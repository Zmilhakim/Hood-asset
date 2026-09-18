// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {TollHook} from "./TollHook.sol";
import {TollLocker} from "./TollLocker.sol";
import {TollToken} from "./TollToken.sol";

/// @title ToollpadFactory
/// @notice The board. Every token launched through Toollpad is recorded here, and
/// every figure the site prints is read back out of this contract or the pool
/// manager — nothing is estimated off-chain.
///
/// A launch is one transaction, and it costs nothing but gas:
///
///   1. mint the whole fixed supply, straight to the locker,
///   2. open a Uniswap v4 pool of native ETH against it, with `TollHook` in the
///      key and an LP fee of zero,
///   3. put the entire supply in as one position the locker cannot take back.
///
/// The creator ends the transaction holding no tokens — the supply never passed
/// through their hands or this contract's — and owning one thing: 80% of the 5%
/// toll that pool charges from its first trade onwards, forever.
///
/// ## What is fixed, and why
///
/// **The supply**, so no launch can quietly print more than another. **The LP
/// fee, at zero**, so the toll is the only fee anyone has to reason about and
/// nothing accrues to a position that has no way to pay out. **The hook**, which
/// is part of a pool's key and therefore cannot be swapped later — the rate a
/// pool charges on its first day is the rate it charges forever. And **the
/// pairing**: native ETH, which is `address(0)` and so always `currency0`, which
/// makes the launched token always `currency1` and its supply always the side
/// below spot. There is no WETH and no address-ordering puzzle to solve.
///
/// ## What a creator controls
///
/// The name, the ticker, the picture, and the price range the supply opens
/// across. That is the whole list. There is no allocation, no vesting schedule,
/// no unlock cliff and no treasury carve-out, because there is nowhere to put
/// one: the supply has exactly one destination and it is the pool.
contract ToollpadFactory {
    using StateLibrary for IPoolManager;

    struct Notice {
        uint256 id;
        address token;
        address creator;
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        uint256 supply;
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
        int24 tickSpacing;
        uint160 sqrtPriceX96; // the opening price, computed off-chain
        int24 tickLower;
        int24 tickUpper;
    }

    /// @notice Every token launched here has exactly this supply. Not a
    /// parameter.
    uint256 public constant FIXED_SUPPLY = 1_000_000_000e18;

    /// @notice Toollpad pools charge no LP fee. The 5% toll in `TollHook` is the
    /// entire fee schedule.
    uint24 public constant LP_FEE = 0;

    IPoolManager public immutable poolManager;
    TollHook public immutable hook;
    TollLocker public immutable locker;

    /// @notice Where the treasury's share of every toll goes. Recorded here for
    /// readers; the address that actually decides is the `immutable` in the hook.
    address public immutable treasury;

    Notice[] private _notices;
    mapping(address creator => uint256[] noticeIds) private _noticesOf;
    mapping(PoolId poolId => uint256 noticeId) private _noticeOfPool;

    uint256 public lastLaunchAt;

    error BadRange();
    error BadTickSpacing();
    error EmptyMetadata();
    error NotSingleSided();
    error PoolAlreadyExists();
    error UnknownPool();
    error ZeroAddress();

    event Launched(
        uint256 indexed id, address indexed token, address indexed creator, PoolId poolId, string name, string symbol
    );
    event SupplyLocked(uint256 indexed id, PoolId indexed poolId, int24 tickLower, int24 tickUpper, uint128 liquidity);

    /// @param poolManager_ The Uniswap v4 pool manager every launch opens a pool in.
    /// @param treasury_ Where the treasury's 20% of every toll goes, forever.
    /// @param hookSalt A CREATE2 salt, mined off-chain, that lands the hook on an
    /// address carrying the flags v4 reads its permissions from. The hook's own
    /// constructor checks this and reverts if the salt is wrong, so a
    /// mis-mined salt costs a failed deployment rather than a launchpad whose
    /// toll is never collected.
    constructor(IPoolManager poolManager_, address treasury_, bytes32 hookSalt) {
        if (address(poolManager_) == address(0) || treasury_ == address(0)) revert ZeroAddress();

        poolManager = poolManager_;
        treasury = treasury_;
        hook = new TollHook{salt: hookSalt}(poolManager_, treasury_);
        locker = new TollLocker(poolManager_);
    }

    // --------------------------------------------------------------- launching

    /// @notice Launch a token, open its pool, and lock the supply into it.
    function launch(LaunchParams calldata params)
        external
        returns (uint256 id, address token, PoolId poolId, uint128 liquidity)
    {
        if (bytes(params.name).length == 0 || bytes(params.symbol).length == 0) revert EmptyMetadata();
        if (params.tickSpacing <= 0) revert BadTickSpacing();
        if (params.tickLower >= params.tickUpper) revert BadRange();
        if (params.tickLower % params.tickSpacing != 0 || params.tickUpper % params.tickSpacing != 0) {
            revert BadRange();
        }

        token = address(new TollToken(params.name, params.symbol, FIXED_SUPPLY, address(locker)));

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO, // native ETH, always the lower currency
            currency1: Currency.wrap(token),
            fee: LP_FEE,
            tickSpacing: params.tickSpacing,
            hooks: IHooks(address(hook))
        });
        poolId = key.toId();

        // Nobody else can have opened this pool: `beforeInitialize` refuses any
        // caller but this contract, and refuses a pool this contract has not
        // registered. So an already-initialised pool here would mean a token
        // address collision, which is not a thing to carry on through.
        (uint160 existing,,,) = poolManager.getSlot0(poolId);
        if (existing != 0) revert PoolAlreadyExists();

        hook.register(key, msg.sender);
        int24 tick = poolManager.initialize(key, params.sqrtPriceX96);

        // The whole range has to sit below spot. A range reaching above it would
        // need ETH as well, and the locker has none to give — it would fail
        // inside the pool manager's callback, which is a worse place to learn it.
        if (params.tickUpper > tick) revert NotSingleSided();

        liquidity = locker.lockIn(key, params.tickLower, params.tickUpper);

        id = _notices.length;
        _notices.push(
            Notice({
                id: id,
                token: token,
                creator: msg.sender,
                name: params.name,
                symbol: params.symbol,
                imageURI: params.imageURI,
                blurb: params.blurb,
                link: params.link,
                supply: FIXED_SUPPLY,
                launchedAt: block.timestamp,
                tickSpacing: params.tickSpacing,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                liquidity: liquidity
            })
        );
        _noticesOf[msg.sender].push(id);
        _noticeOfPool[poolId] = id + 1; // +1, so that "no notice" and "notice 0" differ
        lastLaunchAt = block.timestamp;

        emit Launched(id, token, msg.sender, poolId, params.name, params.symbol);
        emit SupplyLocked(id, poolId, params.tickLower, params.tickUpper, liquidity);
    }

    // ------------------------------------------------------------------- views

    function noticeCount() external view returns (uint256) {
        return _notices.length;
    }

    function noticeAt(uint256 id) external view returns (Notice memory) {
        return _notices[id];
    }

    /// @notice A page of the board, newest first — the order the feed reads in.
    function latest(uint256 offset, uint256 limit) external view returns (Notice[] memory page) {
        uint256 total = _notices.length;
        if (offset >= total) return new Notice[](0);

        uint256 remaining = total - offset;
        uint256 size = remaining < limit ? remaining : limit;
        page = new Notice[](size);

        for (uint256 i = 0; i < size; i++) {
            page[i] = _notices[total - 1 - offset - i];
        }
    }

    function noticesOf(address creator) external view returns (uint256[] memory) {
        return _noticesOf[creator];
    }

    /// @notice The notice a pool belongs to. Reverts for a pool this factory did
    /// not open, rather than answering about notice zero.
    function noticeOfPool(PoolId poolId) external view returns (Notice memory) {
        uint256 slot = _noticeOfPool[poolId];
        if (slot == 0) revert UnknownPool();
        return _notices[slot - 1];
    }

    /// @notice The pool key for a notice — everything needed to trade it, or to
    /// read it out of the pool manager directly.
    function poolKeyOf(uint256 id) public view returns (PoolKey memory) {
        Notice memory notice = _notices[id];
        return PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(notice.token),
            fee: LP_FEE,
            tickSpacing: notice.tickSpacing,
            hooks: IHooks(address(hook))
        });
    }

    function poolIdOf(uint256 id) external view returns (PoolId) {
        return poolKeyOf(id).toId();
    }

    /// @notice Everything the board header needs, in one call.
    function boardStats()
        external
        view
        returns (uint256 tokens, uint256 lastLaunch, uint256 supply, uint256 tollBps, uint256 creatorBps)
    {
        return (_notices.length, lastLaunchAt, FIXED_SUPPLY, hook.TOLL_BPS(), hook.CREATOR_BPS());
    }
}
