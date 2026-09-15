// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {INonfungiblePositionManager} from "./interfaces/IUniswapV3.sol";

/// @title PositionLocker
/// @notice Holds launch liquidity positions forever.
///
/// The lock is structural, not a promise: this contract has no function that
/// decreases liquidity, transfers the position NFT out, approves an operator,
/// or reassigns a beneficiary. The only thing that can ever leave is trading
/// fees, and those go to the address that posted the notice.
contract PositionLocker {
    INonfungiblePositionManager public immutable positionManager;
    address public immutable factory;

    /// @notice Who may collect trading fees for a locked position.
    mapping(uint256 positionId => address beneficiary) public beneficiaryOf;

    error NotFactory();
    error NotBeneficiary();
    error AlreadyLocked();
    error ZeroBeneficiary();

    event PositionLocked(uint256 indexed positionId, address indexed beneficiary);
    event FeesCollected(uint256 indexed positionId, address indexed beneficiary, uint256 amount0, uint256 amount1);

    constructor(INonfungiblePositionManager positionManager_) {
        positionManager = positionManager_;
        factory = msg.sender;
    }

    /// @notice Record who may collect fees on a position the factory just minted here.
    function lock(uint256 positionId, address beneficiary) external {
        if (msg.sender != factory) revert NotFactory();
        if (beneficiary == address(0)) revert ZeroBeneficiary();
        if (beneficiaryOf[positionId] != address(0)) revert AlreadyLocked();
        beneficiaryOf[positionId] = beneficiary;
        emit PositionLocked(positionId, beneficiary);
    }

    /// @notice Sweep accrued trading fees to the notice's poster. Principal is
    /// untouched — `collect` can only ever move fees, never liquidity.
    function collectFees(uint256 positionId) external returns (uint256 amount0, uint256 amount1) {
        address beneficiary = beneficiaryOf[positionId];
        if (msg.sender != beneficiary) revert NotBeneficiary();

        (amount0, amount1) = positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: positionId,
                recipient: beneficiary,
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );

        emit FeesCollected(positionId, beneficiary, amount0, amount1);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return this.onERC721Received.selector;
    }
}
