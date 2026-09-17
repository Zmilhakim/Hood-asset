// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";

/// @title CrateSeal
/// @notice The crate. It owns the one liquidity position $CRATE ever had.
///
/// The liquidity can never come out. The fees it earns can, and they go to one
/// address, fixed when this contract was deployed. Those are two different
/// promises and it is worth keeping them apart:
///
///   The principal — everything anyone ever paid to buy CRATE, minus the fee —
///   is liquidity, and liquidity only leaves a v4 pool through a negative
///   `modifyLiquidity`. There is no such call in this file. Search it: every
///   liquidity delta here is zero or positive. Not the beneficiary, not the
///   packer, not this contract on anyone's behalf can shrink the position.
///
///   The fees are a separate ledger, and `collectFees` pays them to
///   `feeBeneficiary`. That address is immutable and there is no function that
///   changes it, so where the fees go was decided once, before the token
///   existed, and is as fixed as the rest.
///
/// Uniswap v4 makes the first promise simpler than v3 could. A v4 position is
/// not an NFT; it is a row in the pool manager keyed by the address that added
/// it. This contract is that address, so the position is not a thing anyone can
/// be given, sold, borrowed against or mistakenly approved away.
///
/// Everything else this contract holds — the dust left over from packing, and
/// anything anyone sends it — can only go one way: into the position. `compound`
/// is the only thing that moves it, and the position is the only place it can
/// go. That balance is not fees and is never paid to the beneficiary.
contract CrateSeal is IUnlockCallback {
    using StateLibrary for IPoolManager;

    /// @dev One position, so it needs no distinguishing salt.
    bytes32 internal constant POSITION_SALT = bytes32(0);

    enum Action {
        Seal,
        Collect,
        Compound
    }

    IPoolManager public immutable poolManager;

    /// @notice The packer that deployed this seal. Its only power is to fill the
    /// crate once, in the packing transaction; afterwards `sealIn` reverts for
    /// everyone, it included.
    address public immutable packer;

    /// @notice Where trading fees go. Set once, at deployment, and there is no
    /// function anywhere that changes it.
    address public immutable feeBeneficiary;

    /// @notice True once the liquidity is in. It never goes back to false.
    bool public isSealed;

    int24 public tickLower;
    int24 public tickUpper;

    PoolKey internal _key;

    error AlreadySealed();
    error NotPacker();
    error NotPoolManager();
    error NotSealed();
    error NothingToAdd();
    error NothingToCollect();
    error ZeroBeneficiary();

    event Sealed(PoolId indexed poolId, int24 tickLower, int24 tickUpper, uint128 liquidity);
    event FeesCollected(address indexed beneficiary, uint256 amount0, uint256 amount1);
    event Compounded(PoolId indexed poolId, uint128 liquidityAdded, uint256 amount0, uint256 amount1);

    constructor(IPoolManager poolManager_, address feeBeneficiary_) {
        if (feeBeneficiary_ == address(0)) revert ZeroBeneficiary();

        poolManager = poolManager_;
        feeBeneficiary = feeBeneficiary_;
        packer = msg.sender;
    }

    /// @notice Anything sent here is inside the crate: the next `compound` puts
    /// it into the position, and nothing else can move it. This is not how the
    /// beneficiary is paid — fees never pass through this balance.
    receive() external payable {}

    // ----------------------------------------------------------------- packing

    /// @notice Put the whole balance of this contract into one position and shut
    /// the crate. Callable once, by the packer, in the packing transaction.
    function sealIn(PoolKey calldata key_, int24 tickLower_, int24 tickUpper_) external returns (uint128 liquidity) {
        if (msg.sender != packer) revert NotPacker();
        if (isSealed) revert AlreadySealed();

        isSealed = true;
        _key = key_;
        tickLower = tickLower_;
        tickUpper = tickUpper_;

        liquidity = abi.decode(poolManager.unlock(abi.encode(Action.Seal)), (uint128));
        emit Sealed(key_.toId(), tickLower_, tickUpper_, liquidity);
    }

    // -------------------------------------------------------------------- fees

    /// @notice Pay the position's accrued trading fees to the beneficiary.
    ///
    /// Permissionless, because permission would not change anything: the
    /// destination is immutable, so whoever calls this, the money goes to the
    /// same address. All a caller can do is pay the gas.
    function collectFees() external returns (uint256 amount0, uint256 amount1) {
        if (!isSealed) revert NotSealed();

        (amount0, amount1) = abi.decode(poolManager.unlock(abi.encode(Action.Collect)), (uint256, uint256));
        if (amount0 == 0 && amount1 == 0) revert NothingToCollect();
    }

    // ------------------------------------------------------------- compounding

    /// @notice Put whatever this contract is holding into the position. That is
    /// the dust left from packing and anything anyone has sent since — not fees,
    /// which go to the beneficiary and never land in this balance.
    ///
    /// @dev A position sitting entirely on one side of spot only absorbs one of
    /// the two currencies, so the other waits here until the range is crossed
    /// and a later call can use it. It is inside the seal either way.
    function compound() external returns (uint128 liquidityAdded) {
        if (!isSealed) revert NotSealed();
        liquidityAdded = abi.decode(poolManager.unlock(abi.encode(Action.Compound)), (uint128));
    }

    // ---------------------------------------------------------------- callback

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        Action action = abi.decode(data, (Action));

        if (action == Action.Collect) {
            (uint256 fee0, uint256 fee1) = _payFees();
            return abi.encode(fee0, fee1);
        }

        // Every `modifyLiquidity` settles the position's fees into the caller's
        // delta, whatever the delta was for. So the fees are paid out first, and
        // the add below is left with nothing but principal to account for — a
        // fee can never be quietly swallowed into the position.
        if (action == Action.Compound) _payFees();

        (uint128 liquidity, uint256 amount0, uint256 amount1) = _addEverythingHeld();
        if (action == Action.Compound) emit Compounded(_key.toId(), liquidity, amount0, amount1);

        return abi.encode(liquidity);
    }

    /// @dev Modifying a position by zero settles the fees it has accrued and
    /// nothing else — there is no separate collect in v4. They are taken
    /// straight to the beneficiary, so they never touch this contract's balance.
    function _payFees() private returns (uint256 amount0, uint256 amount1) {
        (BalanceDelta fees,) = poolManager.modifyLiquidity(
            _key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: 0,
                salt: POSITION_SALT
            }),
            ""
        );

        amount0 = fees.amount0() > 0 ? uint256(uint128(fees.amount0())) : 0;
        amount1 = fees.amount1() > 0 ? uint256(uint128(fees.amount1())) : 0;

        if (amount0 > 0) poolManager.take(_key.currency0, feeBeneficiary, amount0);
        if (amount1 > 0) poolManager.take(_key.currency1, feeBeneficiary, amount1);

        if (amount0 > 0 || amount1 > 0) emit FeesCollected(feeBeneficiary, amount0, amount1);
    }

    /// @dev Turns everything this contract holds into liquidity in the one
    /// position. The amounts are read as balances rather than passed in, so there
    /// is no argument a caller could use to aim this somewhere else.
    function _addEverythingHeld() private returns (uint128 liquidity, uint256 amount0, uint256 amount1) {
        PoolKey memory key = _key;

        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());

        amount0 = key.currency0.balanceOfSelf();
        amount1 = key.currency1.balanceOfSelf();

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );
        if (liquidity == 0) revert NothingToAdd();

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: POSITION_SALT
            }),
            ""
        );

        _settle(key.currency0, delta.amount0());
        _settle(key.currency1, delta.amount1());
    }

    /// @dev Pays what the add cost, or takes back what it did not use. A `take`
    /// here names this contract and a `settle` pays the pool manager; neither is
    /// a parameter anyone can set, and neither can reach the beneficiary.
    function _settle(Currency currency, int128 delta) private {
        if (delta == 0) return;

        if (delta > 0) {
            poolManager.take(currency, address(this), uint128(delta));
            return;
        }

        uint256 owed = uint256(uint128(-delta));
        if (currency.isAddressZero()) {
            poolManager.settle{value: owed}();
        } else {
            poolManager.sync(currency);
            IERC20(Currency.unwrap(currency)).transfer(address(poolManager), owed);
            poolManager.settle();
        }
    }

    // ------------------------------------------------------------------- views

    /// @notice The pool this crate is liquidity in. Empty until packed.
    function poolKey() external view returns (PoolKey memory) {
        return _key;
    }

    /// @notice How much liquidity the crate holds, read from the pool manager
    /// rather than from a number this contract keeps for itself.
    function sealedLiquidity() external view returns (uint128) {
        if (!isSealed) return 0;
        return poolManager.getPositionLiquidity(
            _key.toId(), keccak256(abi.encodePacked(address(this), tickLower, tickUpper, POSITION_SALT))
        );
    }
}
