// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAavePool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IERC20 {
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title IdleYieldManager
 * @notice Allows the Bank Rock Smart Account to deposit idle USDC into Aave v3 Base Sepolia to earn yield.
 */
contract IdleYieldManager {
    // Aave v3 Pool on Base Sepolia
    address public constant AAVE_POOL = 0x07eA79F68B2B3df46465C5A99c4c1CE56510a76C;
    // USDC on Base Sepolia
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;
    // aUSDC on Base Sepolia
    address public constant aUSDC = 0x4e6D8342E7e8dFbcAEF2B09f5C9C8C089855fBdA;

    /**
     * @notice Supplies idle USDC to Aave v3.
     * @dev Must be executed via the Smart Account.
     */
    function supplyIdleCapital(uint256 amount) external {
        IERC20(USDC).approve(AAVE_POOL, amount);
        IAavePool(AAVE_POOL).supply(USDC, amount, address(this), 0);
    }

    /**
     * @notice Withdraws USDC from Aave v3 back to the Smart Account.
     * @dev Must be executed via the Smart Account.
     */
    function withdrawIdleCapital(uint256 amount) external {
        IAavePool(AAVE_POOL).withdraw(USDC, amount, msg.sender);
    }
}
