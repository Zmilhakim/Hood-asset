// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {DrainToken} from "./DrainToken.sol";
import {Grate} from "./Grate.sol";
import {Sump} from "./Sump.sol";

/// @title Drainpad
/// @notice The catchment. Every token launched through Drainpad is recorded here
/// as a runoff, and every figure the site prints is read back out of this
/// contract or out of the pool manager. Nothing is estimated off-chain.
///
/// A launch is one transaction and costs nothing but gas:
///
///   1. print the whole fixed supply, split inside the token's own constructor —
///      the pool's share to the sump, the rest to the supply wallet,
///   2. open a Uniswap v4 pool of native ETH against the token, with the `Grate`
///      in its key and an LP fee of zero,
///   3. sink the sump's share into that pool as one position it can never pump
///      back out.
///
/// ## The split, stated plainly
///
/// Three quarters of every supply goes down into the pool and does not come
/// back. The remaining quarter is minted straight to a wallet the creator
/// nominates, and it is **liquid immediately** — not vested, not cliffed, not
/// locked. No contract in this repository restrains it, and none of them
/// pretends to.
///
/// That quarter is the honest cost of this design, and it is written into the
/// constants below rather than left to a launch parameter, so it is the same
/// quarter for everyone and a reader has one number to check instead of one per
/// launch. Whether the trade is worth taking is the buyer's call; this
/// contract's job is to make sure they can see it before they make it.
///
/// One thing that quarter is *not*, on day one: sellable. A pool nobody has
/// bought from holds no ETH — the whole position is still token — so there is
/// nothing to pay a seller with. It becomes sellable only as the pool fills.
///
/// ## What is fixed, and why
///
/// **The supply**, so no launch can quietly print more than another. **The
/// split**, for the reason above. **The LP fee, at zero**, so the 4% at the
/// grate is the only fee anyone has to reason about, and nothing accrues to a
/// position that has no way to pay out. **The hook**, which is part of a pool's
/// key and so cannot be swapped afterwards — the rate a pool charges on its
/// first day is the rate it charges on its last. And **the pairing**: native
/// ETH, which is `address(0)` and therefore always `currency0`, which makes the
/// launched token always `currency1` and its share always the side below spot.
/// There is no WETH and no address-ordering puzzle.
///
/// ## What a creator controls
///
/// The name, the ticker, the picture, the wallet the quarter lands in, and the
/// price range the pool opens across. That is the whole list.
contract Drainpad {
    using StateLibrary for IPoolManager;

    /// @notice One launch, as the catchment recorded it.
    struct Runoff {
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
    uint256 public constant POOL_BPS = 7_500;

    /// @notice The share minted to the supply wallet, liquid from the first
    /// block. The two shares are constants and they add up to `BPS`; the
    /// constructor checks that rather than leaving the arithmetic to a reader.
    uint256 public constant SUPPLY_WALLET_BPS = 2_500;

    /// @notice Drainpad pools charge no LP fee. The 4% at the `Grate` is the
    /// entire fee schedule.
    uint24 public constant LP_FEE = 0;

    IPoolManager public immutable poolManager;
    Grate public immutable grate;
    Sump public immutable sump;

    /// @notice Where the treasury's quarter of every fee goes. Recorded here for
    /// readers; the address that actually decides is the `immutable` in the grate.
    address public immutable treasury;

    Runoff[] private _runoffs;
    mapping(address creator => uint256[] runoffIds) private _runoffsOf;
    mapping(PoolId poolId => uint256 runoffId) private _runoffOfPool;

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
    event SupplySunk(uint256 indexed id, PoolId indexed poolId, int24 tickLower, int24 tickUpper, uint128 liquidity);

    /// @param poolManager_ The Uniswap v4 pool manager every launch opens a pool in.
    /// @param treasury_ Where the treasury's 25% of every fee goes, forever.
    /// @param grateSalt A CREATE2 salt, mined off-chain, that lands the grate on
    /// an address carrying the flags v4 reads its permissions from. The grate's
    /// own constructor checks this and reverts if the salt is wrong, so a
    /// mis-mined salt costs a failed deployment rather than a launchpad whose fee
    /// is never charged.
    constructor(IPoolManager poolManager_, address treasury_, bytes32 grateSalt) {
        if (address(poolManager_) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        if (POOL_BPS + SUPPLY_WALLET_BPS != BPS) revert BadSplit();

        poolManager = poolManager_;
        treasury = treasury_;
        grate = new Grate{salt: grateSalt}(poolManager_, treasury_);
        sump = new Sump(poolManager_);
    }

    // --------------------------------------------------------------- launching

    /// @notice Launch a token, open its pool, and sink the pool's share into it.
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

        // A creator who names no wallet is nominating their own. There is no path
        // to address(0) here: a quarter of a supply minted to nowhere would be a
        // silent burn dressed up as an allocation.
        address supplyWallet = params.supplyWallet == address(0) ? msg.sender : params.supplyWallet;

        token = _mintToken(params, supplyWallet);

        PoolKey memory key = poolKeyFor(token, params.tickSpacing);
        poolId = key.toId();
        liquidity = _openAndSink(key, params);

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

    /// @dev Deploys the token, which prints the whole supply in its constructor:
    /// the pool's three quarters to the sump, the remaining quarter to the supply
    /// wallet. Neither share ever passes through this contract.
    function _mintToken(LaunchParams calldata params, address supplyWallet) private returns (address) {
        (uint256 toPool, uint256 toSupplyWallet) = supplyShares();
        return address(new DrainToken(params.name, params.symbol, address(sump), toPool, supplyWallet, toSupplyWallet));
    }

    /// @dev Registers the pool with the grate, initialises it, and sinks the
    /// sump's share into it — the three steps that touch the pool manager.
    function _openAndSink(PoolKey memory key, LaunchParams calldata params) private returns (uint128) {
        // Nobody else can have opened this pool: `beforeInitialize` refuses any
        // caller but this contract, and refuses a pool this contract has not
        // registered. An already-initialised pool here would therefore mean a
        // token address collision, which is not a thing to carry on through.
        (uint160 existing,,,) = poolManager.getSlot0(key.toId());
        if (existing != 0) revert PoolAlreadyExists();

        grate.register(key, msg.sender);
        int24 tick = poolManager.initialize(key, params.sqrtPriceX96);

        // The whole range has to sit below spot. A range reaching above it would
        // need ETH as well, and the sump has none to give — that would fail
        // inside the pool manager's callback, which is a worse place to find out.
        if (params.tickUpper > tick) revert NotSingleSided();

        return sump.sink(key, params.tickLower, params.tickUpper);
    }

    /// @dev Writes the runoff into the catchment and emits what a reader indexes on.
    function _record(
        LaunchParams calldata params,
        address token,
        PoolId poolId,
        address supplyWallet,
        uint128 liquidity
    ) private returns (uint256 id) {
        (uint256 toPool, uint256 toSupplyWallet) = supplyShares();

        id = _runoffs.length;
        _runoffs.push(
            Runoff({
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
        _runoffsOf[msg.sender].push(id);
        _runoffOfPool[poolId] = id + 1; // +1, so "no runoff" and "runoff zero" differ
        lastLaunchAt = block.timestamp;

        emit Launched(id, token, msg.sender, poolId, params.name, params.symbol);
        emit SupplySplit(id, supplyWallet, toPool, toSupplyWallet);
        emit SupplySunk(id, poolId, params.tickLower, params.tickUpper, liquidity);
    }

    // ------------------------------------------------------------------- views

    /// @notice How a supply divides. The same arithmetic `launch` runs, exposed
    /// so a caller can check the two figures rather than recomputing them and
    /// hoping they match.
    function supplyShares() public pure returns (uint256 toPool, uint256 toSupplyWallet) {
        toPool = (FIXED_SUPPLY * POOL_BPS) / BPS;
        toSupplyWallet = FIXED_SUPPLY - toPool; // the remainder, so nothing is lost to rounding
    }

    function runoffCount() external view returns (uint256) {
        return _runoffs.length;
    }

    function runoffAt(uint256 id) external view returns (Runoff memory) {
        return _runoffs[id];
    }

    /// @notice A page of the catchment, newest first — the order the feed reads in.
    function latest(uint256 offset, uint256 limit) external view returns (Runoff[] memory page) {
        uint256 total = _runoffs.length;
        if (offset >= total) return new Runoff[](0);

        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Runoff[](size);

        for (uint256 i = 0; i < size; i++) {
            page[i] = _runoffs[total - 1 - offset - i];
        }
    }

    function runoffsOf(address creator) external view returns (uint256[] memory) {
        return _runoffsOf[creator];
    }

    /// @notice The runoff a pool belongs to. Reverts for a pool this contract did
    /// not open, rather than answering about runoff zero.
    function runoffOfPool(PoolId poolId) external view returns (Runoff memory) {
        uint256 slot = _runoffOfPool[poolId];
        if (slot == 0) revert UnknownPool();
        return _runoffs[slot - 1];
    }

    /// @notice The pool key Drainpad opens for a token: native ETH against it, no
    /// LP fee, this grate in the key.
    /// @dev Every one of those is a fixed property rather than a setting. Native
    /// ETH is `address(0)` and so always `currency0`, which makes the launched
    /// token always `currency1`. `fee` is zero because the grate's 4% is the
    /// whole schedule. And `hooks` is part of the key, so a pool with a different
    /// hook in it is not this pool with the rate changed — it is a different pool.
    function poolKeyFor(address token, int24 tickSpacing) public view returns (PoolKey memory) {
        return PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(token),
            fee: LP_FEE,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(grate))
        });
    }

    /// @notice The pool key for a runoff — everything needed to trade it, or to
    /// read it out of the pool manager directly.
    function poolKeyOf(uint256 id) public view returns (PoolKey memory) {
        Runoff memory runoff = _runoffs[id];
        return poolKeyFor(runoff.token, runoff.tickSpacing);
    }

    function poolIdOf(uint256 id) external view returns (PoolId) {
        return poolKeyOf(id).toId();
    }

    /// @notice Everything the catchment header needs, in one call.
    function catchmentStats()
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
            _runoffs.length,
            lastLaunchAt,
            FIXED_SUPPLY,
            POOL_BPS,
            SUPPLY_WALLET_BPS,
            grate.FEE_BPS(),
            grate.CREATOR_BPS()
        );
    }
}
