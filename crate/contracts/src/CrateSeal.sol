// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {INonfungiblePositionManager} from "./interfaces/IUniswapV3.sol";

/// @title CrateSeal
/// @notice The crate. It holds the one liquidity position $CRATE ever had, and
/// there is no way to take anything out of it.
///
/// The seal is structural, not a promise. Read the function list: nothing here
/// decreases liquidity, transfers the position, approves an operator on it, or
/// sends a token balance to an address the caller chooses. `collect` is called
/// in exactly one place, with `recipient` hardcoded to this contract, and the
/// only thing that call is allowed to lead to is `increaseLiquidity` back into
/// the same position.
///
/// So the crate is one-way: fees earned by the locked liquidity are pushed back
/// into the locked liquidity. Anyone may pay the gas to do it — `compound` takes
/// no arguments and pays the caller nothing, so there is no privileged party
/// here at all, not even the address that packed it.
contract CrateSeal {
    INonfungiblePositionManager public immutable positionManager;

    /// @notice The packer that deployed this seal. Its only power is to name the
    /// position once, in the packing transaction; afterwards `sealPosition`
    /// reverts for everyone including it.
    address public immutable packer;

    /// @notice The Uniswap v3 position this crate holds. Zero until packed.
    uint256 public positionId;

    /// @notice The pool's two tokens, in pool order. Recorded at packing so
    /// `compound` never has to be told what to move.
    address public token0;
    address public token1;

    /// @notice True once the position is inside. It never goes back to false.
    bool public isSealed;

    error AlreadySealed();
    error NotPacker();
    error NotPositionManager();
    error NotSealed();
    error NothingToCompound();

    event Sealed(uint256 indexed positionId, address token0, address token1);
    event Compounded(uint256 indexed positionId, uint128 liquidityAdded, uint256 amount0, uint256 amount1);

    constructor(INonfungiblePositionManager positionManager_) {
        positionManager = positionManager_;
        packer = msg.sender;
    }

    /// @notice Record the position the packer just minted into this contract.
    /// Callable once, by the packer, in the packing transaction.
    function sealPosition(uint256 positionId_, address token0_, address token1_) external {
        if (msg.sender != packer) revert NotPacker();
        if (isSealed) revert AlreadySealed();

        isSealed = true;
        positionId = positionId_;
        token0 = token0_;
        token1 = token1_;

        emit Sealed(positionId_, token0_, token1_);
    }

    /// @notice Sweep the trading fees the locked position has earned and put
    /// them straight back into it. Permissionless: the caller spends gas and
    /// receives nothing, and no path through this function can move value to
    /// any address other than the position itself.
    ///
    /// @dev A position sitting entirely on one side of spot only consumes one of
    /// the two tokens, so the other stays here until the range is crossed and
    /// a later call can use it. It is inside the seal either way.
    function compound() external returns (uint128 liquidityAdded, uint256 amount0, uint256 amount1) {
        if (!isSealed) revert NotSealed();

        uint256 id = positionId;

        positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: id,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        uint256 balance0 = IERC20(token0).balanceOf(address(this));
        uint256 balance1 = IERC20(token1).balanceOf(address(this));
        if (balance0 == 0 && balance1 == 0) revert NothingToCompound();

        // Approved for this call and revoked in the same one, so the position
        // manager is never left standing with a live allowance on the crate.
        IERC20(token0).approve(address(positionManager), balance0);
        IERC20(token1).approve(address(positionManager), balance1);

        (liquidityAdded, amount0, amount1) = positionManager.increaseLiquidity(
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: id,
                amount0Desired: balance0,
                amount1Desired: balance1,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );

        IERC20(token0).approve(address(positionManager), 0);
        IERC20(token1).approve(address(positionManager), 0);

        emit Compounded(id, liquidityAdded, amount0, amount1);
    }

    /// @dev Accepts the position from the position manager and nothing else, so
    /// the crate cannot be filled with somebody's unrelated NFT.
    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        return this.onERC721Received.selector;
    }
}
