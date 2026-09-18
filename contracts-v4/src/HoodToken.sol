// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title HoodToken
/// @notice A fixed-supply ERC20. The entire supply is minted once, in the
/// constructor, to the locker that is opening the pool in the same
/// transaction. There is no mint function, no owner, and no pause — the supply
/// printed at launch is the supply forever.
contract HoodToken is ERC20 {
    /// @param name_ Token name as it appears on the notice.
    /// @param symbol_ Ticker as it appears on the notice.
    /// @param supply_ The whole supply, minted in full to `recipient`.
    /// @param recipient The locker, which puts all of it into the locked position.
    constructor(string memory name_, string memory symbol_, uint256 supply_, address recipient)
        ERC20(name_, symbol_)
    {
        _mint(recipient, supply_);
    }

    /// @notice Burn tokens you hold. Used by the factory to destroy the dust
    /// left over after the pool position is minted, so no launch leaves a
    /// stray balance behind.
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}
