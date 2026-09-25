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

import {SnowToken} from "./SnowToken.sol";

/// @title Glacier
/// @notice Where a launch's liquidity is buried. Fresh snow is loose: it drifts,
/// it packs down, the wind moves it somewhere else. Bury it deep enough and it
/// stops being snow at all — the flakes fuse under their own weight into ice,
/// and nothing short of melting the whole glacier takes them apart again. This
/// contract is that shape: it takes a token's pool share in once and has no
/// function that gives any back.
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
/// One glacier holds every launch. Positions are keyed per pool, so no launch
/// can reach another's liquidity, and a launch costs one contract deployment
/// less.
///
/// There is nothing to collect here either: Snowly pools are opened with an LP
/// fee of zero, so this position never accrues a fee that would then need a way
/// out. The 4.5% in `SnowHook` is the whole fee schedule, and it is banked
/// somewhere else entirely.
///
/// ## What this contract does not bury
///
/// Only the pool's share — 80% of the supply. The other 20% is minted straight
/// to the supply wallet and never comes near this contract. Nothing here
/// restrains it, and nothing here should be read as if it did.
contract Glacier is IUnlockCallback {
    using StateLibrary for IPoolManager;

    /// @dev One position per pool, so it needs nothing to tell it apart.
    bytes32 internal constant POSITION_SALT = bytes32(0);

    struct Compaction {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        address token;
        uint256 amount; // what actually went in, after quantisation
        uint256 burned; // the sliver that did not fit, destroyed
        uint256 compactedAt;
    }

    IPoolManager public immutable poolManager;

    /// @notice The launchpad that deployed this glacier. The only address that
    /// can put a supply in — and, having no counterpart function to call, the
    /// only address that cannot take one out either.
    address public immutable launchpad;

    mapping(PoolId poolId => Compaction) private _compactions;

    error AlreadyCompacted();
    error NothingToCompact();
    error NotLaunchpad();
    error NotPoolManager();

    event Compacted(
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
    function compact(PoolKey calldata key, int24 tickLower, int24 tickUpper) external returns (uint128 liquidity) {
        if (msg.sender != launchpad) revert NotLaunchpad();

        PoolId id = key.toId();
        // Keyed on the token rather than a timestamp: a chain whose genesis
        // block sits at zero would make a timestamp an unreliable way to ask
        // whether this has already run.
        if (_compactions[id].token != address(0)) revert AlreadyCompacted();

        (liquidity) = abi.decode(poolManager.unlock(abi.encode(key, tickLower, tickUpper)), (uint128));

        Compaction storage packed = _compactions[id];
        packed.tickLower = tickLower;
        packed.tickUpper = tickUpper;
        packed.liquidity = liquidity;
        packed.token = Currency.unwrap(key.currency1);
        packed.compactedAt = block.timestamp;

        emit Compacted(
            id, Currency.unwrap(key.currency1), tickLower, tickUpper, liquidity, packed.amount, packed.burned
        );
    }

    /// @inheritdoc IUnlockCallback
    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        (PoolKey memory key, int24 tickLower, int24 tickUpper) = abi.decode(data, (PoolKey, int24, int24));

        // The launched token is currency1 in every Snowly pool. The other side
        // is native ETH, which is address(0) and therefore always the lower
        // currency — so there is no ordering to discover and no WETH anywhere.
        uint256 share = IERC20(Currency.unwrap(key.currency1)).balanceOf(address(this));
        (uint160 sqrtPriceX96,,,) = poolManager.getSlot0(key.toId());

        uint128 liquidity = LiquidityAmounts.getLiquidityForAmounts(
            sqrtPriceX96, TickMath.getSqrtPriceAtTick(tickLower), TickMath.getSqrtPriceAtTick(tickUpper), 0, share
        );
        if (liquidity == 0) revert NothingToCompact();

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
        uint256 sliver = share - owed;
        if (sliver > 0) SnowToken(Currency.unwrap(key.currency1)).burn(sliver);

        Compaction storage packed = _compactions[key.toId()];
        packed.amount = owed;
        packed.burned = sliver;

        return abi.encode(liquidity);
    }

    // ------------------------------------------------------------------- views

    /// @notice What this contract buried in a pool, and when.
    function compactionOf(PoolId poolId) external view returns (Compaction memory) {
        return _compactions[poolId];
    }

    /// @notice The position's liquidity as the pool manager has it, rather than
    /// as this contract remembers it. The two agreeing is the check worth making.
    function compactedLiquidity(PoolId poolId) external view returns (uint128) {
        Compaction memory packed = _compactions[poolId];
        if (packed.token == address(0)) return 0;
        return poolManager.getPositionLiquidity(
            poolId, keccak256(abi.encodePacked(address(this), packed.tickLower, packed.tickUpper, POSITION_SALT))
        );
    }
}
