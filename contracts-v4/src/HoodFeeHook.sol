// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";

/// @title HoodFeeHook
/// @notice Takes the board's fee out of every swap, and credits it to whoever
/// posted that notice.
///
/// One hook serves every pool the board opens. A pool's hook is part of its key
/// and therefore fixed at launch, so this contract's rules are the rules that
/// pool lives under forever: there is no owner, no setter, no upgrade path, and
/// `FEE_BPS` is a constant rather than storage.
///
/// ## What it charges
///
/// `FEE_BPS` of the swap's *unspecified* side. The unspecified side is whichever
/// of the two amounts the swapper did not pin down — the output of an exact-input
/// swap, the input of an exact-output one — and it is the only side a hook is
/// allowed to move after the fact. Two consequences worth stating plainly rather
/// than discovering:
///
///   Buying the token (ETH in, token out) pays the fee **in the token**.
///   Selling it (token in, ETH out) pays the fee **in ETH**.
///
/// So a poster's earnings on a busy launch arrive mostly as their own token, and
/// only turn into ETH when people sell. That is a property of taking a fee in
/// the unspecified currency, not a choice this contract makes per swap.
///
/// This fee is on top of the pool's own LP fee, which is a separate ledger and
/// belongs to the locked position rather than to the poster's balance here.
///
/// ## Why it credits rather than pays
///
/// The fee is taken to this contract and recorded against the poster, who
/// collects it with `claim`. Paying the poster inside the swap would put an
/// arbitrary address on the hot path of every trade: a poster whose address is a
/// contract that rejects ETH would make every sell in their own pool revert, and
/// the pool would be unusable with nothing anyone could do about it. A ledger
/// cannot fail that way — the worst a bad address can do is fail its own claim.
///
/// `claim` is permissionless, because permission would change nothing: the
/// destination is the poster the factory registered and no argument can move it.
/// Anyone willing to pay the gas can push a poster their fees.
contract HoodFeeHook is BaseHook {
    using SafeCast for uint256;

    /// @notice The board's cut of every swap, in hundredths of a percent.
    /// 500 is 5%. A constant, not a parameter: no pool opened through this hook
    /// can be charged more or less than another, and nothing changes it later.
    uint256 public constant FEE_BPS = 500;

    uint256 internal constant BPS_DENOMINATOR = 10_000;

    /// @notice The highest cut a v4 hook can take at all: the whole unspecified
    /// side of the swap.
    ///
    /// Uniswap does not enforce this. `Hooks.afterSwap` takes whatever int128 a
    /// hook returns and subtracts it from the swapper's delta, with no ceiling
    /// anywhere — so the limit is not a rule, it is arithmetic, and it is a
    /// cliff rather than a slope:
    ///
    ///   below 100%  the swap works and the trader keeps the rest;
    ///   at 100%     the swap succeeds and the trader receives nothing at all;
    ///   above 100%  the subtraction flips the swapper's side negative, they
    ///               end up owing a currency they were meant to receive, and
    ///               every swap reverts.
    ///
    /// That last case cannot be repaired. A pool's hook is part of its key, so a
    /// pool opened against a hook charging 101% is a pool nobody can ever trade
    /// again — not the poster, not the board, not Uniswap. Hence the check in
    /// the constructor: the mistake is caught at deployment, where it costs gas,
    /// rather than at the first swap, where it costs the launch.
    uint256 public constant MAX_FEE_BPS = BPS_DENOMINATOR;

    /// @notice The board that may register pools here. Set in the constructor,
    /// and the factory deploys this hook itself, so the two are married at birth.
    address public immutable factory;

    /// @notice Who the fee belongs to, per pool. Written once, by the factory,
    /// in the launch transaction, and never again.
    mapping(PoolId poolId => address poster) public beneficiaryOf;

    /// @notice What this contract is holding for a poster and has not paid out.
    mapping(PoolId poolId => mapping(Currency currency => uint256 amount)) public owed;

    error AlreadyRegistered();
    error FeeTooHigh();
    error NotFactory();
    error NothingToClaim();
    error PayoutFailed();
    error ZeroAddress();

    event PoolRegistered(PoolId indexed poolId, address indexed poster);
    event FeeTaken(PoolId indexed poolId, address indexed poster, Currency currency, uint256 amount);
    event FeeClaimed(PoolId indexed poolId, address indexed poster, uint256 amountEth, uint256 amountToken);

    /// @param poolManager_ The Uniswap v4 PoolManager these pools live in.
    /// @dev `BaseHook`'s constructor checks that this contract's own address
    /// carries exactly the permission bits `getHookPermissions` asks for. A salt
    /// that mines the wrong address fails here, at deployment, rather than on the
    /// first swap of the first launch.
    constructor(IPoolManager poolManager_) BaseHook(poolManager_) {
        // Constant today, and deliberately still checked: this is the one edit to
        // this file that would compile, deploy, launch, and then brick every pool
        // it ever touched.
        if (FEE_BPS > MAX_FEE_BPS) revert FeeTooHigh();

        factory = msg.sender;
    }

    /// @notice Fees taken in native ETH arrive here from the pool manager.
    receive() external payable {}

    /// @inheritdoc BaseHook
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: false,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // -------------------------------------------------------------- the board

    /// @notice Name the poster a pool's fees belong to. The factory calls this
    /// inside the launch, once per pool, and nothing can call it again.
    function register(PoolId poolId, address poster) external {
        if (msg.sender != factory) revert NotFactory();
        if (poster == address(0)) revert ZeroAddress();
        if (beneficiaryOf[poolId] != address(0)) revert AlreadyRegistered();

        beneficiaryOf[poolId] = poster;
        emit PoolRegistered(poolId, poster);
    }

    // --------------------------------------------------------------- the swap

    /// @dev Takes `FEE_BPS` of the unspecified side and returns it as the hook's
    /// delta, which is how a v4 hook says "this much of the swap was mine". The
    /// `take` below settles that delta in the same breath, so this contract
    /// never leaves the pool manager owing it anything.
    function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        address poster = beneficiaryOf[poolId];

        // A pool this board did not open can still name this hook in its key —
        // anyone may write a pool key. It simply pays nothing, rather than
        // reverting and leaving a pool that cannot be traded at all.
        if (poster == address(0)) return (IHooks.afterSwap.selector, 0);

        // The specified side is the one the swapper fixed; the other is the one
        // a hook may still move. Exact-input and exact-output put them on
        // opposite currencies, which is what this comparison is untangling.
        bool specifiedIsCurrency0 = (params.amountSpecified < 0) == params.zeroForOne;
        (Currency currency, int128 unspecified) =
            specifiedIsCurrency0 ? (key.currency1, delta.amount1()) : (key.currency0, delta.amount0());

        // Sign is the swapper's point of view: positive is owed to them, negative
        // is owed by them. The fee is a share of the size either way.
        uint256 size = unspecified < 0 ? uint256(uint128(-unspecified)) : uint256(uint128(unspecified));
        uint256 fee = (size * FEE_BPS) / BPS_DENOMINATOR;
        if (fee == 0) return (IHooks.afterSwap.selector, 0);

        owed[poolId][currency] += fee;
        poolManager.take(currency, address(this), fee);

        emit FeeTaken(poolId, poster, currency, fee);
        return (IHooks.afterSwap.selector, fee.toInt128());
    }

    // ------------------------------------------------------------- the payout

    /// @notice Pay a pool's accrued fees to the poster who launched it.
    ///
    /// Permissionless: the destination is fixed, so a caller chooses only
    /// whether to spend the gas, never where the money lands.
    function claim(PoolKey calldata key) external returns (uint256 amount0, uint256 amount1) {
        PoolId poolId = key.toId();
        address poster = beneficiaryOf[poolId];
        if (poster == address(0)) revert NothingToClaim();

        amount0 = owed[poolId][key.currency0];
        amount1 = owed[poolId][key.currency1];
        if (amount0 == 0 && amount1 == 0) revert NothingToClaim();

        // Zeroed before either payout, so a poster whose address calls back into
        // this contract finds a balance that is already spent.
        owed[poolId][key.currency0] = 0;
        owed[poolId][key.currency1] = 0;

        if (amount0 > 0) _pay(key.currency0, poster, amount0);
        if (amount1 > 0) _pay(key.currency1, poster, amount1);

        emit FeeClaimed(poolId, poster, amount0, amount1);
    }

    function _pay(Currency currency, address to, uint256 amount) private {
        if (currency.isAddressZero()) {
            (bool sent,) = to.call{value: amount}("");
            if (!sent) revert PayoutFailed();
            return;
        }

        if (!IERC20(Currency.unwrap(currency)).transfer(to, amount)) revert PayoutFailed();
    }

    // ------------------------------------------------------------------ views

    /// @notice What a poster could claim from one pool right now, ETH side first.
    function claimable(PoolKey calldata key) external view returns (uint256 amount0, uint256 amount1) {
        PoolId poolId = key.toId();
        return (owed[poolId][key.currency0], owed[poolId][key.currency1]);
    }
}
