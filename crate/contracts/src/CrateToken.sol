// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title CrateToken
/// @notice A fixed-supply ERC20. The whole supply is minted once, in the
/// constructor, to the packer that is opening the pool in the same
/// transaction. There is no mint function, no owner and no pause: what is
/// printed at packing is the supply forever.
///
/// The only direction the supply can move is down, and only by the holder's
/// own hand — `burn` spends the caller's own balance and nobody else's.
contract CrateToken is ERC20 {
    /// @param name_ Token name.
    /// @param symbol_ Ticker.
    /// @param supply_ The whole supply, minted in full to `recipient`.
    /// @param recipient The packer, which moves all of it into the sealed pool.
    constructor(string memory name_, string memory symbol_, uint256 supply_, address recipient)
        ERC20(name_, symbol_)
    {
        _mint(recipient, supply_);
    }

    /// @notice Burn tokens you hold. The packer uses it to destroy the dust left
    /// after the position is minted, so packing leaves no stray balance behind.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
