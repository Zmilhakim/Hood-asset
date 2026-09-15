// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {HoodToken} from "./HoodToken.sol";
import {PositionLocker} from "./PositionLocker.sol";
import {INonfungiblePositionManager, IUniswapV3Factory, IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";

/// @title HoodpadFactory
/// @notice The board. Every token launched through Hoodpad is recorded here as
/// a notice, and every figure the site shows is read back out of this contract
/// — nothing is estimated off-chain.
///
/// A token launch is one transaction:
///   1. mint the whole fixed supply,
///   2. open a single-sided pool with all of it and no ETH,
///   3. hand the position to a locker that can never give it back.
///
/// The price curve and range are computed off-chain (that is where the tick
/// math belongs) and passed in, but the invariant that makes the launch
/// single-sided is enforced here: the range must sit entirely on one side of
/// the initialization price, so the pool cannot pull ETH from the poster and
/// the poster cannot keep a share of the supply.
contract HoodpadFactory is ReentrancyGuard {
    struct Notice {
        uint256 id;
        address token;
        address poster;
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        uint256 supply;
        uint256 postedAt;
        uint256 positionId;
        address pool;
    }

    struct TokenParams {
        bytes32 salt; // CREATE2 salt, so the token address is known before the tx
        string name;
        string symbol;
        string imageURI;
        string blurb;
        string link;
        uint160 sqrtPriceX96; // initialization price, computed off-chain
        int24 tickLower;
        int24 tickUpper;
        uint24 fee; // pool fee tier, e.g. 10000 for 1%
    }

    /// @notice Every token launched here has exactly this supply. It is not a
    /// parameter, so no launch can quietly print more than another.
    uint256 public constant FIXED_SUPPLY = 1_000_000_000e18;

    address public immutable weth;
    IUniswapV3Factory public immutable dexFactory;
    INonfungiblePositionManager public immutable positionManager;
    PositionLocker public immutable locker;
    address public immutable treasury;
    uint256 public immutable postingFee;

    Notice[] private _notices;
    mapping(address poster => uint256[] noticeIds) private _noticesOf;

    uint256 public tokenCount;
    uint256 public lastLaunchAt;

    error BadRange();
    error EmptyMetadata();
    error FeeTooLow();
    error FeeTransferFailed();
    error NoLiquidity();
    error NotSingleSided();
    error RefundFailed();
    error UnsupportedFee();
    error ZeroAddress();

    event NoticePosted(
        uint256 indexed id, address indexed token, address indexed poster, string name, string symbol
    );
    event PoolOpened(uint256 indexed id, address indexed pool, uint256 positionId, uint128 liquidity);

    constructor(
        address weth_,
        IUniswapV3Factory dexFactory_,
        INonfungiblePositionManager positionManager_,
        address treasury_,
        uint256 postingFee_
    ) {
        if (weth_ == address(0) || address(dexFactory_) == address(0) || address(positionManager_) == address(0)) {
            revert ZeroAddress();
        }
        if (treasury_ == address(0) && postingFee_ > 0) revert ZeroAddress();

        weth = weth_;
        dexFactory = dexFactory_;
        positionManager = positionManager_;
        treasury = treasury_;
        postingFee = postingFee_;
        locker = new PositionLocker(positionManager_);
    }

    // ---------------------------------------------------------------- posting

    /// @notice Launch a token and nail it to the board in one transaction.
    function postToken(TokenParams calldata params)
        external
        payable
        nonReentrant
        returns (uint256 id, address token, uint256 positionId)
    {
        if (bytes(params.name).length == 0 || bytes(params.symbol).length == 0) revert EmptyMetadata();

        int24 spacing = dexFactory.feeAmountTickSpacing(params.fee);
        if (spacing == 0) revert UnsupportedFee();
        if (params.tickLower >= params.tickUpper) revert BadRange();
        if (params.tickLower % spacing != 0 || params.tickUpper % spacing != 0) revert BadRange();

        // CREATE2 so the caller already knows which address the token lands on,
        // and therefore which side of the pool it sits on. Those ticks were
        // computed against this exact address.
        token = address(new HoodToken{salt: params.salt}(params.name, params.symbol, FIXED_SUPPLY, address(this)));

        address pool;
        uint128 liquidity;
        (pool, positionId, liquidity) = _openLockedPool(token, params);

        Notice memory draft;
        draft.token = token;
        draft.name = params.name;
        draft.symbol = params.symbol;
        draft.imageURI = params.imageURI;
        draft.blurb = params.blurb;
        draft.link = params.link;
        draft.supply = FIXED_SUPPLY;
        draft.positionId = positionId;
        draft.pool = pool;

        id = _record(draft);

        emit PoolOpened(id, pool, positionId, liquidity);

        _settleFee();
    }

    // ---------------------------------------------------------------- internal

    function _openLockedPool(address token, TokenParams calldata params)
        private
        returns (address pool, uint256 positionId, uint128 liquidity)
    {
        (address token0, address token1) = token < weth ? (token, weth) : (weth, token);
        bool tokenIsToken0 = token == token0;

        pool = dexFactory.getPool(token0, token1, params.fee);
        if (pool == address(0)) pool = dexFactory.createPool(token0, token1, params.fee);
        IUniswapV3Pool(pool).initialize(params.sqrtPriceX96);

        (, int24 currentTick,,,,,) = IUniswapV3Pool(pool).slot0();

        // The whole range has to sit on the token's side of spot. If it straddles
        // spot the position manager would ask for ETH as well, and this launch
        // has none to give.
        if (tokenIsToken0) {
            if (params.tickLower < currentTick) revert NotSingleSided();
        } else {
            if (params.tickUpper > currentTick) revert NotSingleSided();
        }

        IERC20(token).approve(address(positionManager), FIXED_SUPPLY);

        (positionId, liquidity,,) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: params.fee,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                amount0Desired: tokenIsToken0 ? FIXED_SUPPLY : 0,
                amount1Desired: tokenIsToken0 ? 0 : FIXED_SUPPLY,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(locker),
                deadline: block.timestamp
            })
        );

        if (liquidity == 0) revert NoLiquidity();

        IERC20(token).approve(address(positionManager), 0);
        locker.lock(positionId, msg.sender);

        // Whatever rounding left behind is destroyed rather than kept, so a
        // launch never ends with a stray balance in this contract.
        uint256 dust = IERC20(token).balanceOf(address(this));
        if (dust > 0) HoodToken(token).burn(dust);
    }

    /// @dev Stamps the caller, id and timestamp onto a draft notice and files it.
    /// The draft carries the parts the poster controls; these three are not
    /// theirs to set.
    function _record(Notice memory draft) private returns (uint256 id) {
        id = _notices.length;

        draft.id = id;
        draft.poster = msg.sender;
        draft.postedAt = block.timestamp;

        _notices.push(draft);
        _noticesOf[msg.sender].push(id);
        lastLaunchAt = block.timestamp;

        tokenCount += 1;

        emit NoticePosted(id, draft.token, msg.sender, draft.name, draft.symbol);
    }

    function _settleFee() private {
        if (msg.value < postingFee) revert FeeTooLow();

        if (postingFee > 0) {
            (bool paid,) = treasury.call{value: postingFee}("");
            if (!paid) revert FeeTransferFailed();
        }

        uint256 refund = msg.value - postingFee;
        if (refund > 0) {
            (bool refunded,) = msg.sender.call{value: refund}("");
            if (!refunded) revert RefundFailed();
        }
    }

    // ------------------------------------------------------------------- views

    /// @notice The address `postToken` will deploy for these arguments.
    /// Callers read this first, compare it against WETH to learn the pool
    /// ordering, and compute their ticks against the answer.
    function predictToken(string calldata name, string calldata symbol, bytes32 salt)
        external
        view
        returns (address)
    {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(HoodToken).creationCode, abi.encode(name, symbol, FIXED_SUPPLY, address(this))));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }

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

    function noticesOf(address poster) external view returns (uint256[] memory) {
        return _noticesOf[poster];
    }

    /// @notice Everything the board header needs, in one call.
    function boardStats()
        external
        view
        returns (uint256 tokens, uint256 lastLaunch, uint256 fee, uint256 supply)
    {
        return (tokenCount, lastLaunchAt, postingFee, FIXED_SUPPLY);
    }
}
