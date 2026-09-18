// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

import {HoodFeeHook} from "./HoodFeeHook.sol";
import {HoodToken} from "./HoodToken.sol";
import {HoodpadLocker} from "./HoodpadLocker.sol";

/// @title HoodpadFactory
/// @notice The board, on Uniswap v4. Posts notices, launches tokens, opens the
/// pool and locks the liquidity — one notice, one transaction.
///
/// ## What one launch does
///
///   1. Deploys the token and mints the whole fixed supply straight to the
///      locker. It never passes through this contract or the poster's hands.
///   2. Opens a v4 pool of native ETH against the token, carrying `hook`, and
///      prices it at the top of the launch range.
///   3. Registers the poster as that pool's fee beneficiary on the hook.
///   4. Tells the locker to put the entire supply in as one position, which it
///      can only do once and can never undo.
///
/// Nothing is held back: no supply for the board, none for the poster, none for
/// the treasury. What a poster earns is fees — the hook's 5% of every swap, and
/// the pool's own LP fee on the locked position — and never the liquidity.
///
/// ## What v4 changed
///
/// **There is no address-ordering puzzle.** The pool's other side is native ETH,
/// which is `address(0)` and therefore always `currency0`. The token is always
/// `currency1`, so its supply always sits *below* spot. The v3 board needed
/// CREATE2 and an on-chain `predictToken` purely to work out which way round the
/// pool would be; all of that is gone, and with it the whole class of launches
/// that got the answer wrong.
///
/// **There is no position NFT.** See `HoodpadLocker`.
///
/// **There is a hook, and it is permanent.** A pool's hook is part of its key, so
/// `hook` is fixed at launch for every pool this board opens. The fee it charges
/// is a constant in that contract, there is no owner and no upgrade path, and
/// nothing can be switched on later that is not on now.
///
/// ## What the board keeps
///
/// `treasury` receives `postingFee` per notice, and that is the whole of its
/// role. Both are immutable. The deployer holds no privilege at all once this
/// contract exists — there is no owner function anywhere in it.
contract HoodpadFactory is ReentrancyGuard {
    using StateLibrary for IPoolManager;

    struct Notice {
        address token;
        address poster;
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        uint256 supply;
        uint256 postedAt;
        PoolId poolId;
        uint24 fee;
        int24 tickSpacing;
        int24 tickLower;
        int24 tickUpper;
    }

    struct TokenParams {
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        uint160 sqrtPriceX96; // initialization price, computed off-chain
        int24 tickLower;
        int24 tickUpper;
        int24 tickSpacing;
        uint24 fee; // static LP fee, hundredths of a bip; 10000 is 1%
    }

    /// @notice Every token launched here has exactly this supply. It is not a
    /// parameter, so no launch can quietly print more than another.
    uint256 public constant FIXED_SUPPLY = 1_000_000_000e18;

    IPoolManager public immutable poolManager;
    HoodpadLocker public immutable locker;
    HoodFeeHook public immutable hook;
    address public immutable treasury;
    uint256 public immutable postingFee;

    Notice[] private _notices;
    mapping(address poster => uint256[] noticeIds) private _noticesOf;
    mapping(PoolId poolId => uint256 noticeId) private _noticeOfPool;

    uint256 public tokenCount;
    uint256 public lastLaunchAt;

    error BadFee();
    error BadRange();
    error EmptyMetadata();
    error FeeTooLow();
    error FeeTransferFailed();
    error NotSingleSided();
    error RefundFailed();
    error ZeroAddress();

    event NoticePosted(uint256 indexed id, address indexed token, address indexed poster, string name, string symbol);
    event PoolOpened(uint256 indexed id, PoolId indexed poolId, uint128 liquidity);

    /// @param poolManager_ The Uniswap v4 PoolManager to launch into.
    /// @param treasury_ Receives the posting fee. Nothing else is ever paid here.
    /// @param postingFee_ Wei per notice. Zero makes posting free.
    /// @param hookSalt_ The mined CREATE2 salt that lands `HoodFeeHook` on an
    /// address carrying the permission bits v4 reads out of it. The hook's own
    /// constructor rejects a wrong one, so a bad salt fails this deployment
    /// rather than the first launch.
    constructor(IPoolManager poolManager_, address treasury_, uint256 postingFee_, bytes32 hookSalt_) {
        if (address(poolManager_) == address(0)) revert ZeroAddress();
        if (treasury_ == address(0) && postingFee_ > 0) revert ZeroAddress();

        poolManager = poolManager_;
        treasury = treasury_;
        postingFee = postingFee_;

        locker = new HoodpadLocker(poolManager_);
        hook = new HoodFeeHook{salt: hookSalt_}(poolManager_);
    }

    // ---------------------------------------------------------------- posting

    /// @notice Launch a token and nail it to the board in one transaction.
    function postToken(TokenParams calldata params)
        external
        payable
        nonReentrant
        returns (uint256 id, address token, PoolId poolId)
    {
        if (bytes(params.name).length == 0 || bytes(params.symbol).length == 0) revert EmptyMetadata();
        if (msg.value < postingFee) revert FeeTooLow();

        // A dynamic fee needs a hook that sets it, and this one does not. The
        // pool manager would refuse it too; saying so here names the mistake.
        if (LPFeeLibrary.isDynamicFee(params.fee) || params.fee > LPFeeLibrary.MAX_LP_FEE) revert BadFee();
        if (params.tickSpacing <= 0) revert BadRange();
        if (params.tickLower >= params.tickUpper) revert BadRange();
        if (params.tickLower % params.tickSpacing != 0 || params.tickUpper % params.tickSpacing != 0) {
            revert BadRange();
        }

        token = address(new HoodToken(params.name, params.symbol, FIXED_SUPPLY, address(locker)));

        PoolKey memory key = PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO, // native ETH, and so always the lower currency
            currency1: Currency.wrap(token),
            fee: params.fee,
            tickSpacing: params.tickSpacing,
            hooks: IHooks(address(hook))
        });
        poolId = key.toId();

        // Anyone may initialise a pool, and this token's address is predictable
        // from this contract's nonce, so an already-priced pool is used as it
        // stands rather than treated as an error — initialising twice reverts,
        // and a launch that reverts there has already spent the token. What
        // protects the launch is the single-sided check below, which reads the
        // price that is actually there: a price that would make this launch buy
        // its own supply reverts the whole transaction, and the notice can be
        // posted again against a range computed for the price someone else set.
        (uint160 existingPrice, int24 existingTick,,) = poolManager.getSlot0(poolId);
        int24 tick = existingPrice == 0 ? poolManager.initialize(key, params.sqrtPriceX96) : existingTick;

        // The whole range has to sit at or below spot. A range reaching above it
        // would need ETH as well, and the locker has none to give — it would
        // revert inside the add rather than here, which is a worse place to
        // learn it.
        if (params.tickUpper > tick) revert NotSingleSided();

        hook.register(poolId, msg.sender);
        uint128 liquidity = locker.lockIn(key, params.tickLower, params.tickUpper, msg.sender);

        id = _notices.length;
        _notices.push(
            Notice({
                token: token,
                poster: msg.sender,
                name: params.name,
                symbol: params.symbol,
                imageURI: params.imageURI,
                blurb: params.blurb,
                link: params.link,
                supply: FIXED_SUPPLY,
                postedAt: block.timestamp,
                poolId: poolId,
                fee: params.fee,
                tickSpacing: params.tickSpacing,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper
            })
        );
        _noticesOf[msg.sender].push(id);
        _noticeOfPool[poolId] = id + 1; // offset by one, so zero still means "no notice"

        tokenCount = _notices.length;
        lastLaunchAt = block.timestamp;

        emit NoticePosted(id, token, msg.sender, params.name, params.symbol);
        emit PoolOpened(id, poolId, liquidity);

        _settleFee();
    }

    /// @dev Forwards the posting fee and returns the rest. Both are sent after
    /// the launch is complete and the notice is on the board, so neither call
    /// can re-enter a half-built launch — and `nonReentrant` refuses anyway.
    function _settleFee() private {
        if (postingFee > 0) {
            (bool paid,) = treasury.call{value: postingFee}("");
            if (!paid) revert FeeTransferFailed();
        }

        uint256 refund = msg.value - postingFee;
        if (refund > 0) {
            (bool returned,) = msg.sender.call{value: refund}("");
            if (!returned) revert RefundFailed();
        }
    }

    // ------------------------------------------------------------------ views

    /// @notice The pool key of a notice, which is what the hook and the locker
    /// both take as their argument. Rebuilt rather than stored twice.
    function poolKeyOf(uint256 id) public view returns (PoolKey memory) {
        Notice memory posted = _notices[id];
        return PoolKey({
            currency0: CurrencyLibrary.ADDRESS_ZERO,
            currency1: Currency.wrap(posted.token),
            fee: posted.fee,
            tickSpacing: posted.tickSpacing,
            hooks: IHooks(address(hook))
        });
    }

    function notice(uint256 id) external view returns (Notice memory) {
        return _notices[id];
    }

    /// @notice A page of the board, newest first.
    function notices(uint256 offset, uint256 limit) external view returns (Notice[] memory page) {
        uint256 total = _notices.length;
        if (offset >= total) return new Notice[](0);

        uint256 size = total - offset;
        if (size > limit) size = limit;

        page = new Notice[](size);
        for (uint256 i = 0; i < size; i++) {
            page[i] = _notices[total - 1 - offset - i];
        }
    }

    function noticesOf(address poster) external view returns (uint256[] memory) {
        return _noticesOf[poster];
    }

    /// @notice Which notice a pool belongs to. Reverts for a pool this board
    /// never opened, rather than pointing at notice zero.
    function noticeIdOfPool(PoolId poolId) external view returns (uint256) {
        uint256 stored = _noticeOfPool[poolId];
        if (stored == 0) revert ZeroAddress();
        return stored - 1;
    }

    /// @notice The board in one call: how many notices, when the last one
    /// landed, what posting costs, the supply every launch mints, and the hook's
    /// cut in hundredths of a percent.
    function boardStats() external view returns (uint256, uint256, uint256, uint256, uint256) {
        return (tokenCount, lastLaunchAt, postingFee, FIXED_SUPPLY, hook.FEE_BPS());
    }
}
