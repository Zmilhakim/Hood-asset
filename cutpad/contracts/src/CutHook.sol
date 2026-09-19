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

/// @title CutHook
/// @notice The cut gate. One hook, every Cutpad pool, one rate: **3% of
/// everything paid into the pool**, in either direction. Buy with ETH and the
/// cut is 3% of the ETH. Sell the token back and it is 3% of the token. The
/// split is fixed here and cannot be changed: 80% to whoever launched that
/// token, 20% to the treasury.
///
/// There is no other fee. Cutpad pools are opened with an LP fee of zero, so
/// the cut is the entire fee schedule — nothing accrues to a position nobody
/// can withdraw from, and there is no second number to read.
///
/// ## Why the cut is charged on the way in
///
/// It costs a trader the same either way, but it decides what the creator earns.
/// Charging the input means a buy pays its cut in ETH; charging the output
/// would pay it in the token being bought, which is the one asset the creator
/// already has no shortage of.
///
/// ## Exact input and exact output are two different calls
///
/// v4 hands a hook a *specified* and an *unspecified* currency, and which one is
/// the input depends on the direction of the swap:
///
///   * **Exact input** (`amountSpecified < 0`) — the specified currency is the
///     input. `beforeSwap` returns a positive specified delta, which the pool
///     manager subtracts from the amount that reaches the curve. The trader pays
///     exactly what they asked to pay; 97% of it is swapped.
///   * **Exact output** (`amountSpecified > 0`) — the specified currency is the
///     output, and the input is only known once the curve has run. So the cut
///     is charged in `afterSwap`, whose return lands on the unspecified currency
///     — the input. It is added on top of what the swap cost, at 3/97 of it, so
///     the cut is still 3% of everything the trader pays in.
///
/// ## The cut is banked as a claim, not taken as cash
///
/// `take` would move real assets out of the pool manager at a point in the swap
/// where the trader has not paid yet — on a young pool with no ETH in it, a buy
/// would revert. So the hook `mint`s ERC-6909 claims against the pool manager
/// instead: no asset moves, the trader settles as normal, and the claim is
/// redeemed for the real thing in `withdraw`, in a transaction of its own.
///
/// ## What this contract cannot do
///
/// It cannot touch liquidity: there is no `modifyLiquidity` call in this file.
/// It cannot change the rate or the split — both are `constant`. It cannot
/// change where the money goes: `treasury` is `immutable` and a pool's creator
/// is written once, by the factory, in the launch transaction. And it pays out
/// only to the caller's own ledger entry, so no argument anyone passes can aim
/// it at somebody else's money.
contract CutHook is IHooks, IUnlockCallback {
    using CurrencyLibrary for Currency;
    using SafeCast for uint256;

    /// @notice Basis points, for the two rates below.
    uint256 public constant BPS = 10_000;

    /// @notice The cut: 3% of everything paid into a Cutpad pool.
    uint256 public constant CUT_BPS = 300;

    /// @notice The creator's share of the cut. The treasury gets the rest.
    uint256 public constant CREATOR_BPS = 8_000;

    /// @dev The hooks this contract is asking to be called for. A v4 pool works
    /// out which callbacks to make from the low 14 bits of the hook's own
    /// address, so this value is also a requirement on where the contract lands
    /// — see the constructor.
    uint160 internal constant REQUIRED_FLAGS = uint160(
        Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
    );

    IPoolManager public immutable poolManager;

    /// @notice The factory that deployed this hook. The only address that can
    /// register a pool, and the only address whose pools this hook will let be
    /// initialised at all.
    address public immutable factory;

    /// @notice Where the treasury's 20% goes. Set at deployment; no setter.
    address public immutable treasury;

    /// @notice Who launched a given pool, and therefore who the 80% belongs to.
    /// Written once per pool, by the factory, and never again.
    mapping(PoolId poolId => address creator) public creatorOf;

    /// @notice What each address can withdraw, by currency, across every pool it
    /// has launched. A creator with three launches withdraws their ETH once.
    mapping(address account => mapping(Currency currency => uint256 amount)) public owed;

    error AlreadyRegistered();
    error HookAddressNotValid(address hooks);
    error NothingOwed();
    error NotFactory();
    error NotPoolManager();
    error NotRegistered();
    error ZeroAddress();

    /// @dev Hooks that this contract deliberately does not implement. The pool
    /// manager never calls them — its own address check guarantees that — so
    /// reverting here is unreachable rather than a policy.
    error HookNotImplemented();

    event PoolRegistered(PoolId indexed poolId, address indexed creator);
    event CutTaken(
        PoolId indexed poolId, Currency indexed currency, address indexed creator, uint256 toCreator, uint256 toTreasury
    );
    event Withdrawn(address indexed account, Currency indexed currency, uint256 amount);

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    /// @param poolManager_ The Uniswap v4 pool manager every Cutpad pool lives in.
    /// @param treasury_ Where the treasury's share of every cut goes, forever.
    /// @dev Deployed with CREATE2 by the factory, from a salt mined off-chain so
    /// that the address carries `REQUIRED_FLAGS`. The check below is what makes
    /// the mining non-optional: a salt that lands anywhere else reverts the
    /// whole deployment rather than producing a hook the pool manager would
    /// silently never call.
    constructor(IPoolManager poolManager_, address treasury_) {
        if (address(poolManager_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (uint160(address(this)) & Hooks.ALL_HOOK_MASK != REQUIRED_FLAGS) revert HookAddressNotValid(address(this));

        poolManager = poolManager_;
        treasury = treasury_;
        factory = msg.sender;
    }

    /// @dev Native ETH arrives here when a claim is redeemed for it.
    receive() external payable {}

    // ---------------------------------------------------------------- the pool

    /// @notice Record who a pool belongs to. Called by the factory in the launch
    /// transaction, before the pool is initialised.
    function register(PoolKey calldata key, address creator) external {
        if (msg.sender != factory) revert NotFactory();
        if (creator == address(0)) revert ZeroAddress();

        PoolId id = key.toId();
        if (creatorOf[id] != address(0)) revert AlreadyRegistered();

        creatorOf[id] = creator;
        emit PoolRegistered(id, creator);
    }

    /// @inheritdoc IHooks
    /// @dev Two guarantees in four lines. Only the factory can open a pool with
    /// this hook in its key, so nobody can point the cut at a pool Cutpad did
    /// not launch — and every pool that exists has a creator on file, so a cut
    /// can never be collected with nowhere to send it.
    function beforeInitialize(address sender, PoolKey calldata key, uint160)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        if (sender != factory) revert NotFactory();
        if (creatorOf[key.toId()] == address(0)) revert NotRegistered();
        return IHooks.beforeInitialize.selector;
    }

    // --------------------------------------------------------------- the cut

    /// @inheritdoc IHooks
    /// @dev Exact-input swaps only; see the note on the contract. An exact-output
    /// swap is charged in `afterSwap`, because the amount it pays in is not known
    /// yet here.
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        if (params.amountSpecified >= 0) {
            return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
        }

        uint256 cut = (uint256(-params.amountSpecified) * CUT_BPS) / BPS;
        if (cut == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        _bank(key, params.zeroForOne ? key.currency0 : key.currency1, cut);

        // Positive on the specified currency: the pool manager subtracts it from
        // the amount that reaches the curve, and credits it to this contract —
        // which is exactly the debt the mint in `_bank` just created.
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(cut.toInt128(), 0), 0);
    }

    /// @inheritdoc IHooks
    /// @dev Exact-output swaps only. `delta` is what the swap cost before this
    /// hook's own delta is applied, so the input side of it is what the curve
    /// charged, and the cut goes on top of that.
    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        if (params.amountSpecified < 0) return (IHooks.afterSwap.selector, 0); // already cut in beforeSwap

        int128 paid = params.zeroForOne ? delta.amount0() : delta.amount1();
        if (paid >= 0) return (IHooks.afterSwap.selector, 0);

        // 3/97 of what the swap cost, so the cut is still 3% of the total the
        // trader parts with. Rounded up, so rounding is never a discount.
        uint256 cut = Math.mulDiv(uint256(uint128(-paid)), CUT_BPS, BPS - CUT_BPS, Math.Rounding.Ceil);
        if (cut == 0) return (IHooks.afterSwap.selector, 0);

        _bank(key, params.zeroForOne ? key.currency0 : key.currency1, cut);

        // Positive on the unspecified currency, which for an exact-output swap is
        // the input: the trader pays this much more than the curve asked.
        return (IHooks.afterSwap.selector, cut.toInt128());
    }

    /// @dev Takes the cut as an ERC-6909 claim against the pool manager and
    /// writes down who it belongs to. No asset moves here — see the note on the
    /// contract about why taking cash mid-swap is not safe on a young pool.
    function _bank(PoolKey calldata key, Currency currency, uint256 amount) private {
        poolManager.mint(address(this), currency.toId(), amount);

        PoolId id = key.toId();
        address creator = creatorOf[id];
        uint256 toCreator = (amount * CREATOR_BPS) / BPS;

        owed[creator][currency] += toCreator;
        owed[treasury][currency] += amount - toCreator;

        emit CutTaken(id, currency, creator, toCreator, amount - toCreator);
    }

    // ----------------------------------------------------------- withdrawing

    /// @notice Take what you are owed in one currency.
    function withdraw(Currency currency) external returns (uint256 amount) {
        Currency[] memory one = new Currency[](1);
        one[0] = currency;
        return withdrawMany(one)[0];
    }

    /// @notice Take what you are owed in several currencies at once — the ETH
    /// from buys and the tokens from sells, in one transaction.
    /// @dev Pays the caller and nobody else. There is no recipient argument on
    /// purpose: the ledger entry that is zeroed and the address that is paid are
    /// the same `msg.sender`, so there is no shape of call that pays one account
    /// out of another's balance.
    function withdrawMany(Currency[] memory currencies) public returns (uint256[] memory amounts) {
        amounts = new uint256[](currencies.length);

        uint256 total;
        for (uint256 i = 0; i < currencies.length; i++) {
            uint256 amount = owed[msg.sender][currencies[i]];
            owed[msg.sender][currencies[i]] = 0; // before the unlock, not after
            amounts[i] = amount;
            total += amount;

            if (amount > 0) emit Withdrawn(msg.sender, currencies[i], amount);
        }
        if (total == 0) revert NothingOwed();

        poolManager.unlock(abi.encode(msg.sender, currencies, amounts));
    }

    /// @inheritdoc IUnlockCallback
    /// @dev Redeems the claims banked during swaps for the real assets. By now
    /// the trades that created them are long settled, so the pool manager is
    /// holding what these claims are against.
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

    /// @notice What this hook is asking the pool manager to call it for, and the
    /// bits its address has to carry for that to happen.
    function hookFlags() external pure returns (uint160) {
        return REQUIRED_FLAGS;
    }

    /// @notice The cut on a swap of `amountIn`, and how it splits.
    /// @dev The same arithmetic the hook runs, exposed so a caller can check a
    /// quote against it rather than reimplementing it.
    function quoteCut(uint256 amountIn) external pure returns (uint256 cut, uint256 toCreator, uint256 toTreasury) {
        cut = (amountIn * CUT_BPS) / BPS;
        toCreator = (cut * CREATOR_BPS) / BPS;
        toTreasury = cut - toCreator;
    }

    // ------------------------------------------------- hooks that are not used

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
