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

import {ClayToken} from "./ClayToken.sol";

/// @title Kiln
/// @notice Where a launch's liquidity is fired. Clay can be worked, wetted and
/// thrown again right up until it goes in; once it comes out it is ceramic, and
/// there is no process that turns it back. This contract is the same shape: it
/// takes a token's pool share in once and has no function that gives any back.
///
/// **Search this file for a negative liquidity delta.** There is not one.
/// Liquidity leaves a Uniswap v4 pool through exactly one door — a
/// `modifyLiquidity` call with a negative `liquidityDelta` — and the only
/// `modifyLiquidity` in this contract passes a positive one. There is no
/// withdraw, no owner, no pause, no emergency hatch and no upgrade path.
///
/// A v4 position is not an NFT. It is a row in the pool manager keyed by the
/// address that added it, which is this contract, so there is no object to
/// transfer, sell, lend against or approve away by accident. The position does
/// not exist anywhere outside the pool manager.
///
/// One kiln holds every launch. Positions are keyed per pool, so no launch can
/// reach another's liquidity, and a launch costs one contract deployment less.
///
/// There is nothing to collect here either: Clayspad pools are opened with an
/// LP fee of zero, so this position never accrues a fee that would then need a
/// way out. The 4% in `ClayHook` is the whole fee schedule, and it is banked
/// somewhere else entirely.
///
/// ## What this contract does not lock
///
/// Only the pool's share — 75% of the supply. The other 25% is minted straight
/// to the supply wallet and never comes near this contract. Nothing here
/// restrains it, and nothing here should be read as if it did.
contract Kiln is IUnlockCallback {
    using StateLibrary for IPoolManager;

    /// @dev One position per pool, so it needs nothing to tell it apart.
    bytes32 internal constant POSITION_SALT = bytes32(0);

    struct Firing {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address token;
        uint256 amount; // what actually went in, after quantisation
        uint256 burned; // the dust that did not fit, destroyed
        uint256 firedAt;
    }

    IPoolManager public immutable poolManager;

    /// @notice The launchpad that deployed this kiln. The only address that can
    /// put a supply in — and, having no counterpart function to call, the only
    /// address that cannot take one out either.
    address public immutable launchpad;

    mapping(PoolId poolId => Firing) private _firings;

    error AlreadyFired();
    error NothingToFire();
    error NotLaunchpad();
    error NotPoolManager();

    event Fired(
        PoolId indexed poolId,
        address indexed token,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 amount,
        uint256 burned
    );

    constructor(IPoolManager poolManager_) {
        poolManager = poolManager_;
        launchpad = msg.sender;
    }

    /// @notice Put this contract's whole balance of the pool's token in as one
    /// position, and shut the door. Once per pool, by the launchpad, inside the
    /// launch transaction.
    /// @dev The amount is read as a balance rather than taken as an argument.
    /// That is deliberate: there is no parameter here a caller could use to hold
    /// part of the pool's share back, because there is no parameter here at all.
    function fire(PoolKey calldata key, int24 tickLower, int24 tickUpper) external returns (uint128 liquidity) {
        if (msg.sender != launchpad) revert NotLaunchpad();

        PoolId id = key.toId();
        // Keyed on the token rather than a timestamp: a chain whose genesis
        // block sits at zero would make a timestamp an unreliable way to ask
        // whether this has already run.
        if (_firings[id].token != address(0)) revert AlreadyFired();

        (liquidity) = abi.decode(poolManager.unlock(abi.encode(key, tickLower, tickUpper)), (uint128));

        Firing storage firing = _firings[id];
        firing.tickLower = tickLower;
        firing.tickUpper = tickUpper;
        firing.liquidity = liquidity;
        firing.token = Currency.unwrap(key.currency1);
        firing.firedAt = block.timestamp;

        emit Fired(
            id,
            Currency.unwrap(key.currency1),
            tickLower,
            tickUpper,
            liquidity,
            firing.amount,
            firing.burned
        );
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (PoolKey memory key, int24 tickLower, int24 tickUpper) = abi.decode(data, (PoolKey, int24, int24));

        // The launched token is currency1 in every Clayspad pool. The other side
        // is native ETH, which is address(0) and therefore always the lower
        // currency — so there is no ordering to discover and no WETH anywhere.
        uint256 share = IERC20(Currency.unwrap(key.currency1)).balanceOf(address(this));
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), 0, share
        );
        if (liquidity == 0) revert NothingToFire();

        (BalanceDelta delta,) = poolManager.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: int256(uint256(liquidity)), // positive, here and nowhere else in this file
                salt: POSITION_SALT
            }),
            ""
        );

        // The range sits entirely below spot, so the pool asks for the token and
        // for no ETH at all. The launchpad checks that before calling; this is
        // where it would surface if it were ever untrue.
        uint256 owed = uint256(uint128(-delta.amount1()));
        poolManager.sync(key.currency1);
        IERC20(Currency.unwrap(key.currency1)).transfer(address(poolManager), owed);
        poolManager.settle();

        // Liquidity is quantised, so a sliver of the share does not fit. It is
        // destroyed rather than kept: a launch leaves no loose balance anywhere,
        // this contract included.
        uint256 dust = share - owed;
        if (dust > 0) ClayToken(Currency.unwrap(key.currency1)).burn(dust);

        Firing storage firing = _firings[key.toId()];
        firing.amount = owed;
        firing.burned = dust;

        return abi.encode(liquidity);
    }

    // ------------------------------------------------------------------- views

    /// @notice What this contract fired into a pool, and when.
    function firingOf(PoolId poolId) external view returns (Firing memory) {
        return _firings[poolId];
    }

    /// @notice The position's liquidity as the pool manager has it, rather than
    /// as this contract remembers it. The two agreeing is the check worth making.
    function firedLiquidity(PoolId poolId) external view returns (uint128) {
        Firing memory firing = _firings[poolId];
        if (firing.token == address(0)) return 0;
        return poolManager.getPositionLiquidity(
            poolId, keccak256(abi.encodePacked(address(this), firing.tickLower, firing.tickUpper, POSITION_SALT))
        );
    }
}
