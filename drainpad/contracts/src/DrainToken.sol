// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DrainToken
/// @notice A fixed-supply ERC20 whose entire supply is printed once, in this
/// constructor, and lands in exactly two places: the sump, which pours its share
/// into the pool and owns no function that pumps any back out, and the supply
/// wallet, which holds the rest with no strings attached.
///
/// No mint function. No owner, no pause, no blacklist, no upgrade. Whatever this
/// constructor printed is the supply for the life of the token, and the two
/// balances it created are the only balances that existed before a single trade.
///
/// ## The split is a receipt, not a pledge
///
/// Both mints happen in one transaction and both show up as `Transfer` logs from
/// the zero address. Nobody has to take anyone's word for who got what — the
/// launch transaction says so — and every balance after that block is the
/// market's doing rather than this contract's.
///
/// The supply wallet's quarter is **liquid from the first block**: not vested,
/// not cliffed, not locked, and this contract holds no machinery that could make
/// it any of those. Read that line as exactly what it says before buying.
contract DrainToken is ERC20 {
    /// @notice The sump's share — the tokens that went down into the pool.
    uint256 public immutable toSump;

    /// @notice The supply wallet's share — liquid, from the first block.
    uint256 public immutable toSupplyWallet;

    /// @notice Who holds the liquid share, recorded here so a reader does not
    /// have to dig it out of the launch transaction's logs.
    address public immutable supplyWallet;

    error ZeroMint();

    /// @param name_ Token name.
    /// @param symbol_ Ticker.
    /// @param sump The contract that opens the pool with its share.
    /// @param sumpAmount That share, in wei.
    /// @param supplyWallet_ Who holds the liquid share.
    /// @param supplyWalletAmount That share, in wei.
    constructor(
        string memory name_,
        string memory symbol_,
        address sump,
        uint256 sumpAmount,
        address supplyWallet_,
        uint256 supplyWalletAmount
    ) ERC20(name_, symbol_) {
        if (sumpAmount == 0 || supplyWalletAmount == 0) revert ZeroMint();

        toSump = sumpAmount;
        toSupplyWallet = supplyWalletAmount;
        supplyWallet = supplyWallet_;

        _mint(sump, sumpAmount);
        _mint(supplyWallet_, supplyWalletAmount);
    }

    /// @notice Burn tokens you hold.
    /// @dev The sump calls this on the remainder left once its position is
    /// minted, so a launch never ends with a stray balance stranded in a contract
    /// that has no other way to spend one. Anyone may call it on their own
    /// balance; burning what you hold has never required permission.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
