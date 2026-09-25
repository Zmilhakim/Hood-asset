// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from
    "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

/// @title Grate
/// @notice Nothing enters a drain without crossing the grate first, and the
/// grate keeps a share of whatever crosses it. Every Drainpad pool charges **4%
/// of everything paid into it**, in either direction: buy with ETH and the 4% is
/// kept in ETH, sell the token back and it is kept in the token. The split is
/// written into this file as a constant with no setter — **75% to whoever
/// launched the token, 25% to the treasury**.
///
/// There is no second fee to add on. Drainpad pools are opened with an LP fee of
/// zero, so this rate is the entire schedule: nothing accrues to a position that
/// has no way to pay out, and a trader has one number to reason about rather
/// than two.
///
/// ## Why the fee is kept on the way in
///
/// It costs the trader the same either way; what changes is what the creator
/// ends up holding. Charging the input means a buy pays its fee in ETH. Charging
/// the output would pay it in the token being bought — the one asset the creator
/// is least short of, and the one whose worth depends on the very thing the fee
/// is meant to reward.
///
/// ## Exact input and exact output are two different calls
///
/// v4 hands a hook a *specified* and an *unspecified* currency, and which of the
/// two is the input depends on the swap:
///
///   * **Exact input** (`amountSpecified < 0`) — the specified currency is what
///     the trader pays. `beforeSwap` returns a positive specified delta, which
///     the pool manager subtracts before the curve ever sees it: the trader pays
///     exactly what they asked to pay, and 96% of it is swapped.
///   * **Exact output** (`amountSpecified > 0`) — the specified currency is what
///     the trader receives, and what they pay is unknown until the curve has
///     run. So the fee is kept in `afterSwap`, whose return lands on the
///     unspecified currency, which for that swap is the input. It goes on top of
///     what the curve charged, at 4/96 of it, which leaves the fee at 4% of
///     everything the trader parts with — the same as the other branch.
///
/// ## The fee is banked as a claim, not lifted as cash
///
/// `take` would move a real asset out of the pool manager at a point in the swap
/// where the trader has not paid yet. On a pool holding no ETH — which every
/// Drainpad pool is until its first buy — that reverts, and the launch would be
/// unbuyable. So the grate `mint`s ERC-6909 claims against the pool manager
/// instead: nothing moves, the trader settles as normal, and the claim is
/// redeemed for the real asset in `withdraw`, in a transaction of its own.
///
/// ## What this contract cannot do
///
/// It cannot touch liquidity — there is no `modifyLiquidity` call in this file.
/// It cannot change the rate or the split; both are `constant`. It cannot change
/// where the money goes: `treasury` is `immutable`, and a pool's creator is
/// written once, by the launchpad, inside the launch transaction. And it pays
/// out only against the caller's own ledger entry, so no shape of call aims it
/// at somebody else's balance.
contract Grate is IHooks, IUnlockCallback {
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;

    /// @notice Basis points, for the two rates below.
    uint256 public constant BPS = 10_000;

    /// @notice The fee: 4% of everything paid into a Drainpad pool.
    uint256 public constant FEE_BPS = 400;

    /// @notice The creator's share of that fee. The treasury takes the rest.
    uint256 public constant CREATOR_BPS = 7_500;

    /// @dev The callbacks this contract asks for. A v4 pool reads a hook's
    /// permissions out of the low bits of the hook's own address, so this is also
    /// a requirement on where the contract lands — see the constructor.
    uint160 internal constant REQUIRED_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );

    IPoolManager public immutable poolManager;

    /// @notice The launchpad that deployed this grate: the only address that can
    /// register a pool, and the only one whose pools this grate lets be
    /// initialised at all.
    address public immutable launchpad;

    /// @notice Where the treasury's 25% goes. Set at deployment; no setter.
    address public immutable treasury;

    /// @notice Who launched a pool, and therefore whose the 75% is. Written once
    /// per pool, by the launchpad, and never again.
    mapping(PoolId poolId => address creator) public creatorOf;

    /// @notice What each address may withdraw, by currency, across every pool it
    /// has launched. A creator with three launches withdraws their ETH once.
    mapping(address account => mapping(Currency currency => uint256 amount)) public owed;

    error AlreadyRegistered();
    error HookAddressNotValid(address hooks);
    error NothingOwed();
    error NotLaunchpad();
    error NotPoolManager();
    error NotRegistered();
    error ZeroAddress();

    /// @dev Callbacks this contract deliberately leaves unimplemented. The pool
    /// manager never makes them — its own address-flag check guarantees it — so
    /// reverting here is unreachable rather than a policy.
    error HookNotImplemented();

    event PoolRegistered(PoolId indexed poolId, address indexed creator);
    event FeeKept(
        PoolId indexed poolId, Currency indexed currency, address indexed creator, uint256 toCreator, uint256 toTreasury
    );
    event Withdrawn(address indexed account, Currency indexed currency, uint256 amount);

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @param poolManager_ The Uniswap v4 pool manager every Drainpad pool lives in.
    /// @param treasury_ Where the treasury's share of every fee goes, forever.
    /// @dev Deployed with CREATE2 by the launchpad, from a salt mined off-chain so
    /// the resulting address carries `REQUIRED_FLAGS`. The check below is what
    /// makes that mining non-optional: a salt landing anywhere else reverts the
    /// deployment outright, rather than producing a launchpad whose fee is
    /// quietly never charged because the pool manager never calls it.
    constructor(IPoolManager poolManager_, address treasury_) {
        if (address(poolManager_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (uint160(address(this)) & Hooks.ALL_HOOK_MASK != REQUIRED_FLAGS) revert HookAddressNotValid(address(this));

        poolManager = poolManager_;
        treasury = treasury_;
        launchpad = msg.sender;
    }

    /// @dev Native ETH arrives here when a claim is redeemed for it.
    receive() external payable {}

    // ---------------------------------------------------------------- the pool

    /// @notice Record who a pool belongs to. Called by the launchpad in the
    /// launch transaction, before the pool is initialised.
    function register(PoolKey calldata key, address creator) external {
        if (msg.sender != launchpad) revert NotLaunchpad();
        if (creator == address(0)) revert ZeroAddress();

        PoolId id = key.toId();
        if (creatorOf[id] != address(0)) revert AlreadyRegistered();

        creatorOf[id] = creator;
        emit PoolRegistered(id, creator);
    }

    /// @inheritdoc IHooks
    /// @dev Two guarantees in four lines. Only the launchpad may open a pool with
    /// this grate in its key, so nobody can point this fee at a pool Drainpad did
    /// not launch — and every pool that exists has a creator on file, so a fee
    /// can never be kept with nowhere to send it.
    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != launchpad) revert NotLaunchpad();
        if (creatorOf[key.toId()] == address(0)) revert NotRegistered();
        return IHooks.beforeInitialize.selector;
    }

    // ----------------------------------------------------------------- the fee

    /// @inheritdoc IHooks
    /// @dev Exact-input swaps only; see the note on the contract. An exact-output
    /// swap is charged in `afterSwap`, because what it pays in is not known yet.
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (params.amountSpecified >= 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 fee = (uint256(-params.amountSpecified) * FEE_BPS) / BPS;
        if (fee == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        _bank(key, params.zeroForOne ? key.currency0 : key.currency1, fee);

        // Positive on the specified currency: the pool manager subtracts it from
        // what reaches the curve and credits it to this contract — exactly the
        // debt the mint inside `_bank` has just created.
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(fee.toInt128(), 0), 0);
    }

    /// @inheritdoc IHooks
    /// @dev Exact-output swaps only. `delta` is what the swap cost before this
    /// hook's own delta is applied, so its input side is what the curve charged,
    /// and the fee goes on top of that.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        if (params.amountSpecified < 0) return (IHooks.afterSwap.selector, 0); // already kept in beforeSwap

        int128 paid = params.zeroForOne ? delta.amount0() : delta.amount1();
        if (paid >= 0) return (IHooks.afterSwap.selector, 0);

        // 4/96 of what the curve charged, so the fee is still 4% of the total the
        // trader parts with. Rounded up, so rounding is never a discount.
        uint256 fee = Math.mulDiv(uint256(uint128(-paid)), FEE_BPS, BPS - FEE_BPS, Math.Rounding.Ceil);
        if (fee == 0) return (IHooks.afterSwap.selector, 0);

        _bank(key, params.zeroForOne ? key.currency0 : key.currency1, fee);

        // Positive on the unspecified currency, which for an exact-output swap is
        // the input: the trader pays this much more than the curve asked.
        return (IHooks.afterSwap.selector, fee.toInt128());
    }

    /// @dev Keeps the fee as an ERC-6909 claim against the pool manager and
    /// writes down whose it is. No asset moves here — see the note on the
    /// contract about why lifting cash mid-swap is unsafe on a young pool.
    function _bank(PoolKey calldata key, Currency currency, uint256 amount) private {
        poolManager.mint(address(this), currency.toId(), amount);

        PoolId id = key.toId();
        address creator = creatorOf[id];
        uint256 toCreator = (amount * CREATOR_BPS) / BPS;

        owed[creator][currency] += toCreator;
        owed[treasury][currency] += amount - toCreator;

        emit FeeKept(id, currency, creator, toCreator, amount - toCreator);
    }

    // ------------------------------------------------------------- withdrawing

    /// @notice Take what you are owed in one currency.
    function withdraw(Currency currency) external returns (uint256 amount) {
        Currency[] memory one = new Currency[](1);
        one[0] = currency;
        return withdrawMany(one)[0];
    }

    /// @notice Take what you are owed in several currencies at once — the ETH
    /// from buys and the tokens from sells, in one transaction.
    /// @dev Pays the caller and nobody else. There is no recipient argument, on
    /// purpose: the ledger entry that is zeroed and the address that is paid are
    /// the same `msg.sender`, so no argument anyone passes can pay one account
    /// out of another's balance.
    function withdrawMany(Currency[] memory currencies) public returns (uint256[] memory amounts) {
        amounts = new uint256[](currencies.length);

        uint256 total;
        for (uint256 i = 0; i < currencies.length; i++) {
            uint256 amount = owed[msg.sender][currencies[i]];
            owed[msg.sender][currencies[i]] = 0; // zeroed before the unlock, not after
            amounts[i] = amount;
            total += amount;

            if (amount > 0) emit Withdrawn(msg.sender, currencies[i], amount);
        }
        if (total == 0) revert NothingOwed();

        poolManager.unlock(abi.encode(msg.sender, currencies, amounts));
    }

    /// @inheritdoc IUnlockCallback
    /// @dev Redeems the claims banked during swaps for the real assets. By the
    /// time this runs, the trades that created them are long settled, so the pool
    /// manager is holding what the claims are against.
    function unlockCallback(bytes calldata data) external onlyPoolManager returns (bytes memory) {
        (address to, Currency[] memory currencies, uint256[] memory amounts) =
            abi.decode(data, (address, Currency[], uint256[]));

        for (uint256 i = 0; i < currencies.length; i++) {
            if (amounts[i] == 0) continue;
            poolManager.burn(address(this), currencies[i].toId(), amounts[i]);
            poolManager.take(currencies[i], to, amounts[i]);
        }

        return "";
    }

    // ------------------------------------------------------------------- views

    /// @notice What this grate asks the pool manager to call it for, and the bits
    /// its address has to carry for that to happen.
    function hookFlags() external pure returns (uint160) {
        return REQUIRED_FLAGS;
    }

    /// @notice The fee on a swap paying in `amountIn`, and how it splits.
    /// @dev The same arithmetic the grate runs, exposed so a caller can check a
    /// quote against it rather than reimplementing it and hoping.
    function quoteFee(uint256 amountIn) external pure returns (uint256 fee, uint256 toCreator, uint256 toTreasury) {
        fee = (amountIn * FEE_BPS) / BPS;
        toCreator = (fee * CREATOR_BPS) / BPS;
        toTreasury = fee - toCreator;
    }

    // ------------------------------------------- callbacks that are never made

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata) external pure returns (bytes4) {
        revert HookNotImplemented();
    }
}
