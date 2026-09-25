// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {Glacier} from "./Glacier.sol";
import {SnowHook} from "./SnowHook.sol";
import {SnowToken} from "./SnowToken.sol";

/// @title Snowly
/// @notice The snowfield. Every token launched through Snowly is recorded here
/// as a drift, and every figure the site prints is read back out of this
/// contract or the pool manager. Nothing is estimated off-chain.
///
/// A launch is one transaction and costs nothing but gas:
///
///   1. mint the whole fixed supply, split in the token's own constructor —
///      80% to the glacier, 20% to the supply wallet,
///   2. open a Uniswap v4 pool of native ETH against the token, with `SnowHook`
///      in the key and an LP fee of zero,
///   3. bury the glacier's 80% in the pool as one position it can never dig out.
///
/// ## The split, stated plainly
///
/// Four fifths of every supply goes into the pool and does not come back. The
/// remaining fifth is minted straight to a wallet the creator nominates, and it
/// is **liquid immediately** — not vested, not cliffed, not locked. No contract
/// in this repository restrains it, and none of them pretends to.
///
/// That fifth is the honest cost of this design, and it is written into the
/// constants below rather than left to a launch parameter, so it is the same
/// fifth for everyone and a reader has one number to check instead of one per
/// launch. Whether that trade is worth taking is the buyer's call; this
/// contract's job is to make sure they can see it before they make it.
///
/// ## What is fixed, and why
///
/// **The supply**, so no launch can quietly print more than another. **The
/// split**, for the reason above. **The LP fee, at zero**, so the 4.5% in the
/// hook is the only fee anyone has to reason about, and nothing accrues to a
/// position that has no way to pay out. **The hook**, which is part of a pool's
/// key and so cannot be swapped afterwards — the rate a pool charges on its
/// first day is the rate it charges on its last. And **the pairing**: native
/// ETH, which is `address(0)` and therefore always `currency0`, which makes the
/// launched token always `currency1` and its share always the side below spot.
/// There is no WETH and no address-ordering puzzle.
///
/// ## What a creator controls
///
/// The name, the ticker, the picture, the wallet the fifth lands in, and the
/// price range the pool opens across. That is the whole list.
contract Snowly {
    using StateLibrary for IPoolManager;

    struct Drift {
        uint256 id;
        address token;
        address creator;
        address supplyWallet;
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        uint256 supply;
        uint256 toPool;
        uint256 toSupplyWallet;
        uint256 launchedAt;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    struct LaunchParams {
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        address supplyWallet; // zero means the creator's own address
        int24 tickSpacing;
        uint160 sqrtPriceX96; // the opening price, computed off-chain
        int24 tickLower;
        int24 tickUpper;
    }

    /// @notice Basis points, for the split below.
    uint256 public constant BPS = 10_000;

    /// @notice Every token launched here has exactly this supply. Not a
    /// parameter, so no launch can print more than another.
    uint256 public constant FIXED_SUPPLY = 1_000_000_000e18;

    /// @notice The share that goes into the pool and stays there.
    uint256 public constant POOL_BPS = 8_000;

    /// @notice The share minted to the supply wallet, liquid from the first
    /// block. The two shares are constants and they add up to `BPS`; the
    /// constructor checks that rather than trusting the arithmetic to a reader.
    uint256 public constant SUPPLY_WALLET_BPS = 2_000;

    /// @notice Snowly pools charge no LP fee. The 4.5% in `SnowHook` is the
    /// entire fee schedule.
    uint24 public constant LP_FEE = 0;

    IPoolManager public immutable poolManager;
    SnowHook public immutable hook;
    Glacier public immutable glacier;

    /// @notice Where the treasury's quarter of every fee goes. Recorded here for
    /// readers; the address that actually decides is the `immutable` in the hook.
    address public immutable treasury;

    Drift[] private _drifts;
    mapping(address creator => uint256[] driftIds) private _driftsOf;
    mapping(PoolId poolId => uint256 driftId) private _driftOfPool;

    uint256 public lastLaunchAt;

    error BadRange();
    error BadSplit();
    error BadTickSpacing();
    error EmptyMetadata();
    error NotSingleSided();
    error PoolAlreadyExists();
    error UnknownPool();
    error ZeroAddress();

    event Launched(
        uint256 indexed id, address indexed token, address indexed creator, PoolId poolId, string name, string symbol
    );
    event SupplySplit(uint256 indexed id, address indexed supplyWallet, uint256 toPool, uint256 toSupplyWallet);
    event SupplyBuried(uint256 indexed id, PoolId indexed poolId, int24 tickLower, int24 tickUpper, uint128 liquidity);

    /// @param poolManager_ The Uniswap v4 pool manager every launch opens a pool in.
    /// @param treasury_ Where the treasury's 25% of every fee goes, forever.
    /// @param hookSalt A CREATE2 salt, mined off-chain, that lands the hook on an
    /// address carrying the flags v4 reads its permissions from. The hook's own
    /// constructor checks this and reverts if the salt is wrong, so a mis-mined
    /// salt costs a failed deployment rather than a launchpad whose fee is never
    /// collected.
    constructor(IPoolManager poolManager_, address treasury_, bytes32 hookSalt) {
        if (address(poolManager_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (POOL_BPS + SUPPLY_WALLET_BPS != BPS) revert BadSplit();

        poolManager = poolManager_;
        treasury = treasury_;
        hook = new SnowHook{salt: hookSalt}(poolManager_, treasury_);
        glacier = new Glacier(poolManager_);
    }

    // --------------------------------------------------------------- launching

    /// @notice Launch a token, open its pool, and bury the pool's share in it.
    /// @dev The work is split across three private calls rather than written out
    /// here. That is not decoration: solc keeps every live local in the stack
    /// frame, and one function holding the metadata, the two shares, the pool
    /// key, the opening tick and the resulting liquidity at once runs past the
    /// sixteen-slot limit. Each step below hands back only what the next one
    /// needs, which keeps the frame small enough to compile without `viaIR`.
    function launch(LaunchParams calldata params)
        external
        returns (uint256 id, address token, PoolId poolId, uint128 liquidity)
    {
        _check(params);

        // A creator who names no wallet is nominating their own. There is no
        // path to address(0) here: a fifth of a supply minted to nowhere would
        // be a silent burn dressed up as an allocation.
        address supplyWallet = params.supplyWallet == address(0) ? msg.sender : params.supplyWallet;

        token = _mintToken(params, supplyWallet);

        PoolKey memory key = poolKeyFor(token, params.tickSpacing);
        poolId = key.toId();
        liquidity = _openAndBury(key, params);

        id = _record(params, token, poolId, supplyWallet, liquidity);
    }

    /// @dev Everything about a launch that can be rejected before anything is
    /// deployed. Reverting here costs the caller a failed transaction; reverting
    /// after the token exists costs the same gas and leaves a confusing receipt.
    function _check(LaunchParams calldata params) private pure {
        if (bytes(params.name).length == 0 || bytes(params.symbol).length == 0) revert EmptyMetadata();
        if (params.tickSpacing <= 0) revert BadTickSpacing();
        if (params.tickLower >= params.tickUpper) revert BadRange();
        if (params.tickLower % params.tickSpacing != 0 || params.tickUpper % params.tickSpacing != 0) {
            revert BadRange();
        }
    }

    /// @dev Deploys the token, which mints the whole supply in its constructor:
    /// the pool's four fifths to the glacier, the remaining fifth to the supply
    /// wallet. Neither share ever passes through this contract.
    function _mintToken(LaunchParams calldata params, address supplyWallet) private returns (address) {
        (uint256 toPool, uint256 toSupplyWallet) = supplyShares();
        return address(
            new SnowToken(params.name, params.symbol, address(glacier), toPool, supplyWallet, toSupplyWallet)
        );
    }

    /// @dev Registers the pool with the hook, initialises it, and buries the
    /// glacier's share in it — the three steps that touch the pool manager.
    function _openAndBury(PoolKey memory key, LaunchParams calldata params) private returns (uint128) {
        // Nobody else can have opened this pool: `beforeInitialize` refuses any
        // caller but this contract, and refuses a pool this contract has not
        // registered. An already-initialised pool here would therefore mean a
        // token address collision, which is not a thing to carry on through.
        (uint160 existing,,,) = poolManager.getSlot0(key.toId());
        if (existing != 0) revert PoolAlreadyExists();

        hook.register(key, msg.sender);
        int24 tick = poolManager.initialize(key, params.sqrtPriceX96);

        // The whole range has to sit below spot. A range reaching above it would
        // need ETH as well, and the glacier has none to give — that would fail
        // inside the pool manager's callback, which is a worse place to find out.
        if (params.tickUpper > tick) revert NotSingleSided();

        return glacier.compact(key, params.tickLower, params.tickUpper);
    }

    /// @dev Writes the drift to the snowfield and emits what a reader indexes on.
    function _record(
        LaunchParams calldata params,
        address token,
        PoolId poolId,
        address supplyWallet,
        uint128 liquidity
    ) private returns (uint256 id) {
        (uint256 toPool, uint256 toSupplyWallet) = supplyShares();

        id = _drifts.length;
        _drifts.push(
            Drift({
                id: id,
                token: token,
                creator: msg.sender,
                supplyWallet: supplyWallet,
                name: params.name,
                symbol: params.symbol,
                imageURI: params.imageURI,
                blurb: params.blurb,
                link: params.link,
                supply: FIXED_SUPPLY,
                toPool: toPool,
                toSupplyWallet: toSupplyWallet,
                launchedAt: block.timestamp,
                tickSpacing: params.tickSpacing,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidity: liquidity
            })
        );
        _driftsOf[msg.sender].push(id);
        _driftOfPool[poolId] = id + 1; // +1, so "no drift" and "drift zero" differ
        lastLaunchAt = block.timestamp;

        emit Launched(id, token, msg.sender, poolId, params.name, params.symbol);
        emit SupplySplit(id, supplyWallet, toPool, toSupplyWallet);
        emit SupplyBuried(id, poolId, params.tickLower, params.tickUpper, liquidity);
    }

    // ------------------------------------------------------------------- views

    /// @notice How a supply divides. The same arithmetic `launch` runs, exposed
    /// so a caller can check the two figures rather than recomputing them and
    /// hoping they match.
    function supplyShares() public pure returns (uint256 toPool, uint256 toSupplyWallet) {
        toPool = (FIXED_SUPPLY * POOL_BPS) / BPS;
        toSupplyWallet = FIXED_SUPPLY - toPool; // the remainder, so nothing is lost to rounding
    }

    function driftCount() external view returns (uint256) {
        return _drifts.length;
    }

    function driftAt(uint256 id) external view returns (Drift memory) {
        return _drifts[id];
    }

    /// @notice A page of the snowfield, newest first — the order the feed reads in.
    function latest(uint256 offset, uint256 limit) external view returns (Drift[] memory page) {
        uint256 total = _drifts.length;
        if (offset >= total) return new Drift[](0);

        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Drift[](size);

        for (uint256 i = 0; i < size; i++) {
            page[i] = _drifts[total - 1 - offset - i];
        }
    }

    function driftsOf(address creator) external view returns (uint256[] memory) {
        return _driftsOf[creator];
    }

    /// @notice The drift a pool belongs to. Reverts for a pool this contract did
    /// not open, rather than answering about drift zero.
    function driftOfPool(PoolId poolId) external view returns (Drift memory) {
        uint256 slot = _driftOfPool[poolId];
        if (slot == 0) revert UnknownPool();
        return _drifts[slot - 1];
    }

    /// @notice The pool key Snowly opens for a token: native ETH against it, no
    /// LP fee, this hook in the key.
    /// @dev Every one of those is a fixed property rather than a setting. Native
    /// ETH is `address(0)` and so always `currency0`, which makes the launched
    /// token always `currency1`. `fee` is zero because the hook's 4.5% is the
    /// whole schedule. And `hooks` is part of the key, so a pool with a different
    /// hook in it is not this pool with the rate changed — it is a different pool.
    function poolKeyFor(address token, int24 tickSpacing) public view returns (PoolKey memory) {
        return PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(token),
            fee: LP_FEE,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });
    }

    /// @notice The pool key for a drift — everything needed to trade it, or to
    /// read it out of the pool manager directly.
    function poolKeyOf(uint256 id) public view returns (PoolKey memory) {
        Drift memory drift = _drifts[id];
        return poolKeyFor(drift.token, drift.tickSpacing);
    }

    function poolIdOf(uint256 id) external view returns (PoolId) {
        return poolKeyOf(id).toId();
    }

    /// @notice Everything the snowfield header needs, in one call.
    function fieldStats()
        external
        view
        returns (
            uint256 tokens,
            uint256 lastLaunch,
            uint256 supply,
            uint256 poolBps,
            uint256 supplyWalletBps,
            uint256 feeBps,
            uint256 creatorBps
        )
    {
        return (
            _drifts.length,
            lastLaunchAt,
            FIXED_SUPPLY,
            POOL_BPS,
            SUPPLY_WALLET_BPS,
            hook.FEE_BPS(),
            hook.CREATOR_BPS()
        );
    }
}
