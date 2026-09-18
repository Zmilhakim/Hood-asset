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

/// @title HoodpadLocker
/// @notice Holds the launch liquidity of every notice on the board, forever.
///
/// One locker, many positions — one per pool. The promise is the same one the v3
/// board made, and it is still two promises rather than one:
///
///   **The liquidity never comes out.** Liquidity leaves a Uniswap v4 pool
///   through exactly one door: a `modifyLiquidity` with a negative delta. There
///   is no such call in this file. Search it — every liquidity delta here is
///   zero or positive. Not the poster, not the factory, not this contract on
///   anyone's behalf can shrink a position.
///
///   **The trading fees do come out, to the poster.** `collectFees` pays a
///   pool's accrued LP fees to the address that posted that notice, recorded
///   when the position was locked and never writable again.
///
/// v4 makes the first promise plainer than v3 could. A v4 position is not an
/// NFT; it is a row in the pool manager keyed by the address that added it. This
/// contract is that address, so there is nothing to transfer, sell, borrow
/// against, or approve away by mistake — the position is not a *thing* at all.
///
/// The board's own 5% cut is not here. That is `HoodFeeHook`, a separate ledger
/// on a separate contract, and the two never touch.
contract HoodpadLocker is IUnlockCallback {
    using StateLibrary for IPoolManager;

    /// @dev One position per pool, so no salt is needed to tell them apart.
    bytes32 internal constant POSITION_SALT = bytes32(0);

    enum Action {
        Lock,
        Collect,
        Sweep
    }

    struct Position {
        PoolKey key;
        int24 tickLower;
        int24 tickUpper;
        address beneficiary;
        uint256 lockedAt;
    }

    IPoolManager public immutable poolManager;

    /// @notice The board that deployed this locker. Its only power is to lock a
    /// new position in, once per pool, inside a launch transaction. It cannot
    /// collect, cannot move a beneficiary, and cannot take liquidity out —
    /// there is no code here that would let it.
    address public immutable factory;

    mapping(PoolId poolId => Position position) private _positions;

    /// @dev What the current unlock is working on. Set immediately before
    /// `unlock` and read back inside the callback, so no caller can aim a
    /// callback at a pool of their choosing.
    PoolId private _active;

    error AlreadyLocked();
    error NotFactory();
    error NotLocked();
    error NotPoolManager();
    error NothingToAdd();
    error NothingToCollect();
    error SettleFailed();
    error ZeroBeneficiary();

    event PositionLocked(
        PoolId indexed poolId, address indexed beneficiary, int24 tickLower, int24 tickUpper, uint128 liquidity
    );
    event FeesCollected(PoolId indexed poolId, address indexed beneficiary, uint256 amount0, uint256 amount1);
    event DustSwept(PoolId indexed poolId, uint128 liquidityAdded);

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
        factory = msg.sender;
    }

    /// @notice Native ETH arrives here from the pool manager when a position is
    /// added with less than it was handed. It is inside the lock like everything
    /// else: `sweepDust` can put it back into a position and nothing can take it
    /// out.
    receive() external payable {}

    // --------------------------------------------------------------- locking

    /// @notice Put the whole token balance this contract is holding into one
    /// position and lock it. Callable once per pool, by the factory, inside the
    /// launch transaction.
    ///
    /// @dev The ETH side is deliberately passed as zero rather than read as a
    /// balance. This locker holds ETH dust from every launch that came before,
    /// and a balance read would pull an earlier notice's dust into this one's
    /// position. A launch is single-sided below spot and needs no ETH at all, so
    /// zero is both correct and the only safe number here.
    function lockIn(PoolKey calldata key, int24 tickLower_, int24 tickUpper_, address beneficiary)
        external
        returns (uint128 liquidity)
    {
        if (msg.sender != factory) revert NotFactory();
        if (beneficiary == address(0)) revert ZeroBeneficiary();

        PoolId poolId = key.toId();
        if (_positions[poolId].beneficiary != address(0)) revert AlreadyLocked();

        _positions[poolId] = Position({
            key: key,
            tickLower: tickLower_,
            tickUpper: tickUpper_,
            beneficiary: beneficiary,
            lockedAt: block.timestamp
        });

        _active = poolId;
        liquidity = abi.decode(poolManager.unlock(abi.encode(Action.Lock, poolId)), (uint128));

        emit PositionLocked(poolId, beneficiary, tickLower_, tickUpper_, liquidity);
    }

    // ------------------------------------------------------------------ fees

    /// @notice Pay a pool's accrued LP fees to the poster who launched it.
    ///
    /// Permissionless, because permission would change nothing: the destination
    /// was fixed when the position was locked and no argument moves it. All a
    /// caller can decide is whether to pay the gas.
    function collectFees(PoolId poolId) external returns (uint256 amount0, uint256 amount1) {
        if (_positions[poolId].beneficiary == address(0)) revert NotLocked();

        _active = poolId;
        (amount0, amount1) = abi.decode(poolManager.unlock(abi.encode(Action.Collect, poolId)), (uint256, uint256));
        if (amount0 == 0 && amount1 == 0) revert NothingToCollect();
    }

    // ----------------------------------------------------------------- dust

    /// @notice Put whatever this contract still holds of a pool's two currencies
    /// into that pool's position. Permissionless and one-way: the only place the
    /// balance can go is further into the lock.
    function sweepDust(PoolId poolId) external returns (uint128 liquidityAdded) {
        if (_positions[poolId].beneficiary == address(0)) revert NotLocked();

        _active = poolId;
        liquidityAdded = abi.decode(poolManager.unlock(abi.encode(Action.Sweep, poolId)), (uint128));
        emit DustSwept(poolId, liquidityAdded);
    }

    // -------------------------------------------------------------- callback

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (Action action, PoolId poolId) = abi.decode(data, (Action, PoolId));
        if (PoolId.unwrap(poolId) != PoolId.unwrap(_active)) revert NotLocked();

        if (action == Action.Collect) {
            (uint256 fee0, uint256 fee1) = _payFees(poolId);
            return abi.encode(fee0, fee1);
        }

        // Every `modifyLiquidity` settles the position's accrued fees into the
        // caller's delta, whatever the call was for. So a sweep pays the fees
        // out first and leaves the add with nothing but principal to account
        // for — the poster's fees can never be quietly absorbed into liquidity
        // they will never see again.
        if (action == Action.Sweep) _payFees(poolId);

        Position memory position = _positions[poolId];
        uint256 amount0 = action == Action.Lock ? 0 : position.key.currency0.balanceOfSelf();
        uint256 amount1 = position.key.currency1.balanceOfSelf();

        return abi.encode(_add(position, amount0, amount1));
    }

    /// @dev Modifying a position by zero settles the fees it has accrued and
    /// nothing else — v4 has no separate collect. They go straight to the
    /// poster, so they never sit in this contract's balance where a later sweep
    /// could bury them in the position.
    function _payFees(PoolId poolId) private returns (uint256 amount0, uint256 amount1) {
        Position memory position = _positions[poolId];

        (BalanceDelta fees,) = poolManager.modifyLiquidity(
            position.key,
            ModifyLiquidityParams({
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                liquidityDelta: 0,
                salt: POSITION_SALT
            }),
            ""
        );

        amount0 = fees.amount0() > 0 ? uint256(uint128(fees.amount0())) : 0;
        amount1 = fees.amount1() > 0 ? uint256(uint128(fees.amount1())) : 0;

        if (amount0 > 0) poolManager.take(position.key.currency0, position.beneficiary, amount0);
        if (amount1 > 0) poolManager.take(position.key.currency1, position.beneficiary, amount1);

        if (amount0 > 0 || amount1 > 0) emit FeesCollected(poolId, position.beneficiary, amount0, amount1);
    }

    /// @dev Turns the amounts handed in into liquidity in one position. The
    /// delta is always positive or zero; there is no path through this function
    /// that removes anything.
    function _add(Position memory position, uint256 amount0, uint256 amount1) private returns (uint128 liquidity) {
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(position.key.toId());

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(position.tickLower),
            TickMath.getSqrtPriceAtTick(position.tickUpper),
            amount0,
            amount1
        );
        if (liquidity == 0) revert NothingToAdd();

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            position.key,
            ModifyLiquidityParams({
                tickLower: position.tickLower,
                tickUpper: position.tickUpper,
                liquidityDelta: int256(uint256(liquidity)),
                salt: POSITION_SALT
            }),
            ""
        );

        _settle(position.key.currency0, delta.amount0());
        _settle(position.key.currency1, delta.amount1());
    }

    /// @dev Pays what the add cost, or takes back what it did not use. Both
    /// sides name this contract; neither is an address a caller can set.
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
            if (!IERC20(Currency.unwrap(currency)).transfer(address(poolManager), owed)) revert SettleFailed();
            poolManager.settle();
        }
    }

    // ----------------------------------------------------------------- views

    /// @notice The position locked for a pool. `beneficiary` is the zero address
    /// when the board never locked one there.
    function positionOf(PoolId poolId) external view returns (Position memory) {
        return _positions[poolId];
    }

    /// @notice Who a pool's LP fees are paid to.
    function beneficiaryOf(PoolId poolId) external view returns (address) {
        return _positions[poolId].beneficiary;
    }

    /// @notice How much liquidity a pool's locked position holds, read from the
    /// pool manager rather than from a number this contract keeps for itself.
    function lockedLiquidity(PoolId poolId) external view returns (uint128) {
        Position memory position = _positions[poolId];
        if (position.beneficiary == address(0)) return 0;

        return poolManager.getPositionLiquidity(
            poolId, keccak256(abi.encodePacked(address(this), position.tickLower, position.tickUpper, POSITION_SALT))
        );
    }
}
