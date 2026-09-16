// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {CrateSeal} from "./CrateSeal.sol";
import {CrateToken} from "./CrateToken.sol";
import {INonfungiblePositionManager, IUniswapV3Factory, IUniswapV3Pool} from "./interfaces/IUniswapV3.sol";

/// @title CratePacker
/// @notice Packs the crate, once.
///
/// This contract launches exactly one token, with a name and ticker it cannot
/// be talked out of, in a single transaction:
///
///   1. mint the whole fixed supply,
///   2. open a pool holding all of it and no ETH,
///   3. hand the position to a seal that has no way to give it back.
///
/// After that transaction `packed` is true and every entrypoint here is either a
/// view or reverts. There is no second token, no owner function, no treasury and
/// no fee. The address that packed it holds nothing afterwards, because the
/// supply never passed through it — it went from mint to pool inside one call.
///
/// Tick math lives off-chain, where it belongs, but the invariant that makes the
/// pool single-sided is enforced here: the range must sit entirely on the
/// token's side of spot, so the position manager can never pull ETH from the
/// packer and the packer can never keep a slice of the supply.
contract CratePacker is ReentrancyGuard {
    struct PackParams {
        bytes32 salt; // CREATE2 salt, so the token address is known before the tx
        uint160 sqrtPriceX96; // initialization price, computed off-chain
        int24 tickLower;
        int24 tickUpper;
        uint24 fee; // pool fee tier, e.g. 10000 for 1%
    }

    /// @notice The whole supply. Not a parameter, and minted exactly once.
    uint256 public constant SUPPLY = 1_000_000_000e18;

    string public constant TOKEN_NAME = "Crate";
    string public constant TOKEN_SYMBOL = "CRATE";

    address public immutable weth;
    IUniswapV3Factory public immutable dexFactory;
    INonfungiblePositionManager public immutable positionManager;
    CrateSeal public immutable seal;

    /// @notice The account that deployed this packer and may call `pack`. It has
    /// no other power, and none at all once `packed` is true.
    address public immutable packer;

    address public token;
    address public pool;
    uint256 public positionId;
    uint256 public packedAt;
    bool public packed;

    error AlreadyPacked();
    error BadRange();
    error NoLiquidity();
    error NotPacker();
    error NotSingleSided();
    error UnsupportedFee();
    error ZeroAddress();

    event Packed(address indexed token, address indexed pool, uint256 positionId, uint128 liquidity);

    constructor(address weth_, IUniswapV3Factory dexFactory_, INonfungiblePositionManager positionManager_) {
        if (weth_ == address(0) || address(dexFactory_) == address(0) || address(positionManager_) == address(0)) {
            revert ZeroAddress();
        }

        weth = weth_;
        dexFactory = dexFactory_;
        positionManager = positionManager_;
        packer = msg.sender;
        seal = new CrateSeal(positionManager_);
    }

    // ----------------------------------------------------------------- packing

    /// @notice Mint the supply, open the pool with all of it, and seal the
    /// position. Reverts on the second call, forever.
    function pack(PackParams calldata params)
        external
        nonReentrant
        returns (address token_, address pool_, uint256 positionId_)
    {
        if (msg.sender != packer) revert NotPacker();
        if (packed) revert AlreadyPacked();

        int24 spacing = dexFactory.feeAmountTickSpacing(params.fee);
        if (spacing == 0) revert UnsupportedFee();
        if (params.tickLower >= params.tickUpper) revert BadRange();
        if (params.tickLower % spacing != 0 || params.tickUpper % spacing != 0) revert BadRange();

        // CREATE2 so the caller already knows which address the token lands on,
        // and therefore which side of the pool it sits on. Those ticks were
        // computed against this exact address.
        token_ = address(new CrateToken{salt: params.salt}(TOKEN_NAME, TOKEN_SYMBOL, SUPPLY, address(this)));

        uint128 liquidity;
        (pool_, positionId_, liquidity) = _openSealedPool(token_, params);

        packed = true;
        packedAt = block.timestamp;
        token = token_;
        pool = pool_;
        positionId = positionId_;

        emit Packed(token_, pool_, positionId_, liquidity);
    }

    // ---------------------------------------------------------------- internal

    function _openSealedPool(address token_, PackParams calldata params)
        private
        returns (address pool_, uint256 positionId_, uint128 liquidity)
    {
        (address token0, address token1) = token_ < weth ? (token_, weth) : (weth, token_);
        bool tokenIsToken0 = token_ == token0;

        pool_ = dexFactory.getPool(token0, token1, params.fee);
        if (pool_ == address(0)) pool_ = dexFactory.createPool(token0, token1, params.fee);

        // A pool for this pair can be created and initialised by anyone, so an
        // already-priced pool is used as it stands rather than treated as an
        // error — initialising twice would revert and strand this packer. What
        // protects the launch is the single-sided check below, which reads the
        // price that is actually there. A price that would make this launch
        // give ETH away reverts the whole transaction, and `pack` can be run
        // again against a range computed for the price someone else set.
        (uint160 existingPrice,,,,,,) = IUniswapV3Pool(pool_).slot0();
        if (existingPrice == 0) IUniswapV3Pool(pool_).initialize(params.sqrtPriceX96);

        (, int24 currentTick,,,,,) = IUniswapV3Pool(pool_).slot0();

        // The whole range has to sit on the token's side of spot. If it straddles
        // spot the position manager would ask for ETH as well, and this launch
        // has none to give.
        if (tokenIsToken0) {
            if (params.tickLower < currentTick) revert NotSingleSided();
        } else {
            if (params.tickUpper > currentTick) revert NotSingleSided();
        }

        IERC20(token_).approve(address(positionManager), SUPPLY);

        (positionId_, liquidity,,) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: params.fee,
                tickLower: params.tickLower,
                tickUpper: params.tickUpper,
                amount0Desired: tokenIsToken0 ? SUPPLY : 0,
                amount1Desired: tokenIsToken0 ? 0 : SUPPLY,
                amount0Min: 0,
                amount1Min: 0,
                recipient: address(seal),
                deadline: block.timestamp
            })
        );

        if (liquidity == 0) revert NoLiquidity();

        IERC20(token_).approve(address(positionManager), 0);
        seal.sealPosition(positionId_, token0, token1);

        // Whatever rounding left behind is destroyed rather than kept, so packing
        // never ends with a stray balance in this contract.
        uint256 dust = IERC20(token_).balanceOf(address(this));
        if (dust > 0) CrateToken(token_).burn(dust);
    }

    // ------------------------------------------------------------------- views

    /// @notice The address `pack` will deploy for this salt. Read it first,
    /// compare it against WETH to learn the pool ordering, and compute the ticks
    /// against the answer.
    function predictToken(bytes32 salt) external view returns (address) {
        bytes32 initCodeHash = keccak256(
            abi.encodePacked(type(CrateToken).creationCode, abi.encode(TOKEN_NAME, TOKEN_SYMBOL, SUPPLY, address(this)))
        );
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }

    /// @notice Everything a reader needs to check the crate, in one call.
    function crate()
        external
        view
        returns (address token_, address pool_, address seal_, uint256 positionId_, uint256 packedAt_, uint256 supply)
    {
        return (token, pool, address(seal), positionId, packedAt, SUPPLY);
    }
}
