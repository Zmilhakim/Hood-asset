// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {INonfungiblePositionManager} from "../interfaces/IUniswapV3.sol";

/// @dev A Uniswap v3 stand-in, small enough to read in one sitting, used only by
/// the tests. It keeps the parts the contracts actually depend on — pool
/// creation, one-shot initialisation, the tick reported by `slot0`, pulling
/// tokens on mint, paying out fees on collect — and fakes everything else. Tick
/// math is not modelled: the tick a pool reports is whatever the test set, which
/// is the point, because what is under test is how the packer branches on it.

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external
        returns (bytes4);
}

contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockPool {
    uint160 public sqrtPriceX96;
    int24 public tick;

    int24 private immutable tickOnInit;

    constructor(int24 tickOnInit_) {
        tickOnInit = tickOnInit_;
    }

    function initialize(uint160 sqrtPriceX96_) external {
        require(sqrtPriceX96 == 0, "already initialized");
        require(sqrtPriceX96_ != 0, "zero price");
        sqrtPriceX96 = sqrtPriceX96_;
        tick = tickOnInit;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (sqrtPriceX96, tick, 0, 0, 0, 0, true);
    }
}

contract MockDexFactory {
    mapping(uint24 fee => int24 spacing) public feeAmountTickSpacing;
    mapping(bytes32 key => address pool) private _pools;

    /// @dev The tick the next pool created here reports once it is initialised.
    int24 public nextTick;

    constructor() {
        feeAmountTickSpacing[500] = 10;
        feeAmountTickSpacing[3000] = 60;
        feeAmountTickSpacing[10000] = 200;
    }

    function setNextTick(int24 tick) external {
        nextTick = tick;
    }

    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address) {
        return _pools[_key(tokenA, tokenB, fee)];
    }

    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool) {
        require(feeAmountTickSpacing[fee] != 0, "unsupported fee");
        bytes32 key = _key(tokenA, tokenB, fee);
        require(_pools[key] == address(0), "exists");
        pool = address(new MockPool(nextTick));
        _pools[key] = pool;
    }

    function _key(address tokenA, address tokenB, uint24 fee) private pure returns (bytes32) {
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        return keccak256(abi.encode(token0, token1, fee));
    }
}

contract MockPositionManager {
    mapping(uint256 tokenId => address) public ownerOf;
    mapping(uint256 tokenId => address) public token0Of;
    mapping(uint256 tokenId => address) public token1Of;
    mapping(uint256 tokenId => uint128) public liquidityOf;
    mapping(uint256 tokenId => uint256) public owed0;
    mapping(uint256 tokenId => uint256) public owed1;

    uint256 public nextTokenId = 1;

    /// @dev When false, `increaseLiquidity` consumes only token0 — the way a
    /// range sitting entirely above spot does.
    bool public consumeToken1 = true;

    function setConsumeToken1(bool consume) external {
        consumeToken1 = consume;
    }

    /// @dev Test helper: credit fees to a position. The balances that pay them
    /// out are whatever this contract already holds, so a test that credits
    /// more than the venue has fails at `collect`, the way it should.
    function accrueFees(uint256 tokenId, uint256 amount0, uint256 amount1) external {
        owed0[tokenId] += amount0;
        owed1[tokenId] += amount1;
    }

    function mint(INonfungiblePositionManager.MintParams calldata params)
        external
        payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        amount0 = params.amount0Desired;
        amount1 = params.amount1Desired;
        if (amount0 > 0) IERC20(params.token0).transferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(params.token1).transferFrom(msg.sender, address(this), amount1);

        liquidity = uint128(amount0 + amount1);
        require(liquidity > 0, "no liquidity");

        tokenId = nextTokenId++;
        ownerOf[tokenId] = params.recipient;
        token0Of[tokenId] = params.token0;
        token1Of[tokenId] = params.token1;
        liquidityOf[tokenId] = liquidity;

        if (params.recipient.code.length > 0) {
            bytes4 received =
                IERC721Receiver(params.recipient).onERC721Received(msg.sender, msg.sender, tokenId, "");
            require(received == IERC721Receiver.onERC721Received.selector, "bad receiver");
        }
    }

    function increaseLiquidity(INonfungiblePositionManager.IncreaseLiquidityParams calldata params)
        external
        payable
        returns (uint128 liquidity, uint256 amount0, uint256 amount1)
    {
        amount0 = params.amount0Desired;
        amount1 = consumeToken1 ? params.amount1Desired : 0;

        if (amount0 > 0) IERC20(token0Of[params.tokenId]).transferFrom(msg.sender, address(this), amount0);
        if (amount1 > 0) IERC20(token1Of[params.tokenId]).transferFrom(msg.sender, address(this), amount1);

        liquidity = uint128(amount0 + amount1);
        require(liquidity > 0, "no liquidity");
        liquidityOf[params.tokenId] += liquidity;
    }

    function collect(INonfungiblePositionManager.CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1)
    {
        require(msg.sender == ownerOf[params.tokenId], "not owner");

        amount0 = owed0[params.tokenId];
        amount1 = owed1[params.tokenId];
        owed0[params.tokenId] = 0;
        owed1[params.tokenId] = 0;

        if (amount0 > 0) IERC20(token0Of[params.tokenId]).transfer(params.recipient, amount0);
        if (amount1 > 0) IERC20(token1Of[params.tokenId]).transfer(params.recipient, amount1);
    }
}
