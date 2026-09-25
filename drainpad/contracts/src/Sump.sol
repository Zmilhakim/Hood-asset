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

import {DrainToken} from "./DrainToken.sol";

/// @title Sump
/// @notice The pit at the bottom of the drain. Everything a launch pours into
/// the pool comes to rest here and settles as silt, and a sump is defined by
/// what it lacks: there is no pump on this one. It takes a supply in once, per
/// pool, and owns no function that hands any back.
///
/// **Search this file for a negative liquidity delta.** There is not one.
/// Liquidity leaves a Uniswap v4 pool through exactly one door — a
/// `modifyLiquidity` call with a negative `liquidityDelta` — and the single
/// `modifyLiquidity` below passes a positive one. No withdraw, no owner, no
/// pause, no emergency hatch, no upgrade path, no delegatecall.
///
/// A v4 position is not an NFT. It is a row in the pool manager keyed by the
/// address that added it, which is this contract — so there is no object to
/// sell, lend against, transfer, or approve away by accident. The position does
/// not exist anywhere outside the pool manager's storage.
///
/// One sump serves every launch. Positions are keyed per pool, so no launch can
/// reach into another's liquidity, and a launch costs one contract deployment
/// less.
///
/// There is nothing to collect here either: Drainpad pools open with an LP fee
/// of zero, so this position never accrues a fee that would then need an exit.
/// The 4% at the `Grate` is the whole fee schedule, and it is banked elsewhere.
///
/// ## What this contract does not hold
///
/// Only the pool's share. The rest of every supply is minted straight to the
/// supply wallet and never comes near this address. Nothing here restrains it,
/// and nothing here should be read as though it did.
contract Sump is IUnlockCallback {
    using StateLibrary for IPoolManager;

    /// @dev One position per pool, so nothing is needed to tell them apart.
    bytes32 internal constant POSITION_SALT = bytes32(0);

    /// @notice What settled in one pool, and when.
    struct Silt {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address token;
        uint256 amount; // what actually went in, after quantisation
        uint256 burned; // the remainder that did not fit, destroyed
        uint256 settledAt;
    }

    IPoolManager public immutable poolManager;

    /// @notice The launchpad that deployed this sump. The only address that can
    /// pour a supply in — and, there being no counterpart function to call, the
    /// only address that cannot take one out either.
    address public immutable launchpad;

    mapping(PoolId poolId => Silt) private _silt;

    error AlreadySunk();
    error NothingToSink();
    error NotLaunchpad();
    error NotPoolManager();

    event Sunk(
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

    /// @notice Put this contract's entire balance of the pool's token in as one
    /// position, and let the grate close over it. Once per pool, by the
    /// launchpad, inside the launch transaction.
    /// @dev The amount is read off this contract's own balance rather than taken
    /// as an argument. That is deliberate: there is no parameter a caller could
    /// use to hold part of the pool's share back, because there is no amount
    /// parameter at all.
    function sink(PoolKey calldata key, int24 tickLower, int24 tickUpper) external returns (uint128 liquidity) {
        if (msg.sender != launchpad) revert NotLaunchpad();

        PoolId id = key.toId();
        // Keyed on the token rather than on a timestamp: a chain whose genesis
        // block sits at zero would make a timestamp an unreliable way of asking
        // whether this has already run.
        if (_silt[id].token != address(0)) revert AlreadySunk();

        (liquidity) = abi.decode(poolManager.unlock(abi.encode(key, tickLower, tickUpper)), (uint128));

        Silt storage settled = _silt[id];
        settled.tickLower = tickLower;
        settled.tickUpper = tickUpper;
        settled.liquidity = liquidity;
        settled.token = Currency.unwrap(key.currency1);
        settled.settledAt = block.timestamp;

        emit Sunk(id, Currency.unwrap(key.currency1), tickLower, tickUpper, liquidity, settled.amount, settled.burned);
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (PoolKey memory key, int24 tickLower, int24 tickUpper) = abi.decode(data, (PoolKey, int24, int24));

        // The launched token is currency1 in every Drainpad pool. The other side
        // is native ETH, which is address(0) and therefore always the lower
        // currency — so there is no ordering to work out and no WETH anywhere.
        uint256 share = IERC20(Currency.unwrap(key.currency1)).balanceOf(address(this));
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), 0, share
        );
        if (liquidity == 0) revert NothingToSink();

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

        // The range sits wholly below spot, so the pool asks for the token and
        // for no ETH at all. The launchpad checks that before calling; here is
        // where it would surface if it were ever untrue.
        uint256 owed = uint256(uint128(-delta.amount1()));
        poolManager.sync(key.currency1);
        IERC20(Currency.unwrap(key.currency1)).transfer(address(poolManager), owed);
        poolManager.settle();

        // Liquidity is quantised, so a remainder of the share does not fit. It is
        // destroyed rather than kept: a launch leaves no loose balance anywhere,
        // this contract included.
        uint256 grit = share - owed;
        if (grit > 0) DrainToken(Currency.unwrap(key.currency1)).burn(grit);

        Silt storage settled = _silt[key.toId()];
        settled.amount = owed;
        settled.burned = grit;

        return abi.encode(liquidity);
    }

    // ------------------------------------------------------------------- views

    /// @notice What settled in a pool, as this contract recorded it.
    function siltOf(PoolId poolId) external view returns (Silt memory) {
        return _silt[poolId];
    }

    /// @notice The position's liquidity as the pool manager has it, rather than
    /// as this contract remembers it. The two agreeing is the check worth making.
    function sunkLiquidity(PoolId poolId) external view returns (uint128) {
        Silt memory settled = _silt[poolId];
        if (settled.token == address(0)) return 0;
        return poolManager.getPositionLiquidity(
            poolId, keccak256(abi.encodePacked(address(this), settled.tickLower, settled.tickUpper, POSITION_SALT))
        );
    }
}
