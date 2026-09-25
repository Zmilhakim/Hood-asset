// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title SnowToken
/// @notice A fixed-supply ERC20, minted once in the constructor and split
/// between exactly two addresses: the glacier, which puts its share into the
/// pool and has no way to draw it back out, and the supply wallet, which holds
/// the rest and can do whatever it likes with it.
///
/// There is no mint function, no owner, no pause and no blacklist. The supply
/// printed in this constructor is the supply forever, and the two balances it
/// lands in are the only two that existed before anybody traded.
///
/// ## The split is not a promise, it is a receipt
///
/// Both mints happen here, in one transaction, and both appear as Transfer logs
/// from the zero address. Nobody has to be trusted about who got what — the
/// answer is in the launch transaction, and every balance after it is the
/// market's doing rather than the launchpad's.
///
/// The supply wallet's fifth is **liquid from the first block**. It is not
/// vested, not cliffed and not locked, and this contract has no machinery to
/// make it any of those things. Anyone deciding whether to buy should read that
/// as exactly what it says.
contract SnowToken is ERC20 {
    /// @notice The glacier's share — the tokens that went into the pool.
    uint256 public immutable toGlacier;

    /// @notice The supply wallet's share — liquid, from the first block.
    uint256 public immutable toSupplyWallet;

    /// @notice The address holding the liquid share, recorded so a reader does
    /// not have to trawl the launch transaction's logs to find it.
    address public immutable supplyWallet;

    error ZeroMint();

    /// @param name_ Token name.
    /// @param symbol_ Ticker.
    /// @param glacier The contract that opens the pool with its share.
    /// @param glacierAmount That share, in wei.
    /// @param supplyWallet_ Who holds the liquid share.
    /// @param supplyWalletAmount That share, in wei.
    constructor(
        string memory name_,
        string memory symbol_,
        address glacier,
        uint256 glacierAmount,
        address supplyWallet_,
        uint256 supplyWalletAmount
    ) ERC20(name_, symbol_) {
        if (glacierAmount == 0 || supplyWalletAmount == 0) revert ZeroMint();

        toGlacier = glacierAmount;
        toSupplyWallet = supplyWalletAmount;
        supplyWallet = supplyWallet_;

        _mint(glacier, glacierAmount);
        _mint(supplyWallet_, supplyWalletAmount);
    }

    /// @notice Burn tokens you hold.
    /// @dev The glacier calls this on the sliver left over once its position is
    /// minted, so a launch never ends with a stray balance sitting in a contract
    /// that has no other way to spend one. Anyone else may call it too; burning
    /// your own tokens has never needed permission.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
