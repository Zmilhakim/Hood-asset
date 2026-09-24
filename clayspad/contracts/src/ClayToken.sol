// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ClayToken
/// @notice A fixed-supply ERC20, minted once in the constructor and split
/// between exactly two addresses: the kiln, which puts its share into the pool
/// and can never take it out again, and the supply wallet, which holds the rest
/// and can do whatever it likes with it.
///
/// There is no mint function, no owner, no pause and no blacklist. The supply
/// printed in this constructor is the supply forever, and the two balances it
/// lands in are the only two that ever existed before anyone traded.
///
/// ## The split is not a promise, it is an event
///
/// Both mints happen here, in one transaction, and both are visible as Transfer
/// logs from the zero address. Nobody has to be trusted about who got what:
/// the answer is in the receipt of the launch, and every balance after that is
/// the market's doing rather than the launchpad's.
///
/// The supply wallet's share is **liquid from the first block**. It is not
/// vested, not cliffed and not locked, and this contract has no machinery to
/// make it any of those things. Anyone deciding whether to buy should read that
/// as exactly what it says.
contract ClayToken is ERC20 {
    /// @notice The kiln's share — the tokens that went into the pool.
    uint256 public immutable toKiln;

    /// @notice The supply wallet's share — liquid, from the first block.
    uint256 public immutable toSupplyWallet;

    /// @notice The address holding the liquid share, recorded so a reader does
    /// not have to trawl the launch transaction's logs to find it.
    address public immutable supplyWallet;

    error ZeroMint();

    /// @param name_ Token name.
    /// @param symbol_ Ticker.
    /// @param kiln The contract that opens the pool with its share.
    /// @param kilnAmount That share, in wei.
    /// @param supplyWallet_ Who holds the liquid share.
    /// @param supplyWalletAmount That share, in wei.
    constructor(
        string memory name_,
        string memory symbol_,
        address kiln,
        uint256 kilnAmount,
        address supplyWallet_,
        uint256 supplyWalletAmount
    ) ERC20(name_, symbol_) {
        if (kilnAmount == 0 || supplyWalletAmount == 0) revert ZeroMint();

        toKiln = kilnAmount;
        toSupplyWallet = supplyWalletAmount;
        supplyWallet = supplyWallet_;

        _mint(kiln, kilnAmount);
        _mint(supplyWallet_, supplyWalletAmount);
    }

    /// @notice Burn tokens you hold.
    /// @dev The kiln calls this on the dust left over once its position is
    /// minted, so a launch never ends with a stray balance sitting in a contract
    /// that has no other way to spend one. Anyone else may call it too; burning
    /// your own tokens has never needed permission.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
