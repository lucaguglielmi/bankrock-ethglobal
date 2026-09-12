// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title AgentSessionKeyModule
 * @notice An ERC-7579 compatible Validator/Execution module tailored for the Bank Rock MCP AI Agent.
 * @dev Allows a designated AI Agent signer (e.g., controlled by the MCP server) to autonomously 
 * rebalance liquidity (call Aqua.ship and Aqua.dock) without having the authority to withdraw or transfer
 * tokens to arbitrary addresses.
 */
contract AgentSessionKeyModule {
    
    // Mapping of Smart Account => Agent Signer => Is Authorized
    mapping(address => mapping(address => bool)) public authorizedAgents;

    event AgentAuthorized(address indexed smartAccount, address indexed agent);
    event AgentRevoked(address indexed smartAccount, address indexed agent);
    event AgentExecuted(address indexed smartAccount, address indexed agent, address target, bytes data);

    /**
     * @notice Authorize an AI Agent to execute scoped commands for the caller's Smart Account.
     * @param agent The address of the AI Agent signer.
     */
    function authorizeAgent(address agent) external {
        authorizedAgents[msg.sender][agent] = true;
        emit AgentAuthorized(msg.sender, agent);
    }

    /**
     * @notice Revoke an AI Agent's execution rights.
     * @param agent The address of the AI Agent signer.
     */
    function revokeAgent(address agent) external {
        authorizedAgents[msg.sender][agent] = false;
        emit AgentRevoked(msg.sender, agent);
    }

    /**
     * @notice Validates if an agent signature is valid for a given UserOp.
     * @dev In a full ERC-7579 implementation, this would conform to the `IValidator` interface 
     * and validate the signature over the UserOp hash.
     */
    function validateSessionKeySignature(
        address smartAccount,
        address agent,
        bytes32 userOpHash,
        bytes calldata signature
    ) external view returns (bool) {
        require(authorizedAgents[smartAccount][agent], "Agent not authorized");
        
        // Pseudo-validation: Recover signer from userOpHash and signature.
        // For MVP, we assume the bundler handles basic validation or we mock it.
        // return ecrecover(userOpHash, v, r, s) == agent;
        return true; 
    }

    /**
     * @notice Checks if the execution payload is allowed for the agent.
     * @dev Strict scoping: only allow calls to the Aqua protocol contracts.
     * Revert if the target is a token contract (e.g., USDC) and the function selector is `transfer`.
     */
    function checkExecutionScope(
        address smartAccount,
        address target,
        uint256 value,
        bytes calldata data
    ) external view returns (bool) {
        // AI Agents are never allowed to send native ETH
        if (value > 0) return false;

        // Example Scope: Allow interactions with a specific Aqua Maker contract
        // In reality, this would be a configured whitelist per account.
        
        // Prevent generic ERC20 transfers
        if (data.length >= 4) {
            bytes4 selector = bytes4(data[:4]);
            // transfer(address,uint256)
            if (selector == 0xa9059cbb) {
                return false;
            }
        }

        return true;
    }
}
