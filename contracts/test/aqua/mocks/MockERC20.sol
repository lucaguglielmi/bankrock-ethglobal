// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @dev A mintable ERC-20 with a configurable number of decimals, so the Aqua tests run against
 *      the real 6-decimal / 18-decimal asymmetry of Sepolia USDC and WETH (spec 16 §1.1) rather
 *      than two identical 18-decimal tokens.
 *
 *      Test-only. It is never deployed by any script and never referenced by the app.
 */
contract MockERC20 is ERC20 {
    uint8 private immutable _DECIMALS;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _DECIMALS = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _DECIMALS;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
