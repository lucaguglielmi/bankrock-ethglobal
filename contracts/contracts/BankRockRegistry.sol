// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title BankRockRegistry
 * @author BankRock Team
 * @notice The immutable registry for Bank Rock objects.
 *
 * @dev 
 *   Welcome to the Bank Rock smart contract! 
 *   If you're reading this on Etherscan or via a CLI, you're awesome.
 * 
 *        _.._
 *      /   _ \
 *     |  /` | |
 *     | |   | |
 *      \ \_ / /
 *       `--'
 *   
 *   We built this contract to be extremely friendly for developers.
 *   Try calling `getRockStatusJSON(id)` to get a perfectly formatted 
 *   JSON string of the rock's state right in your terminal! No ABI parsing needed.
 */
contract BankRockRegistry {
    // Custom descriptive errors (save gas and give crystal clear feedback)
    error RockAlreadyAwakened(uint256 rockId);
    error RockNotAwakened(uint256 rockId);
    error UnauthorizedTapper(address caller, address expectedOwner);
    error InvalidNewOwner();
    error InvalidNFCSequence();

    struct Rock {
        address smartAccount;
        address currentOwner;
        uint256 awakenedAt;
        bool isAwake;
    }

    mapping(uint256 => Rock) public rocks;
    mapping(uint256 => bytes32) public rockToNfcPubKey;

    event RockAwakened(uint256 indexed rockId, address indexed owner, address smartAccount);
    event RockOwnershipTransferred(uint256 indexed rockId, address indexed previousOwner, address indexed newOwner);
    event RockPoked(address indexed poker, string message);
    event TradeExecuted(uint256 indexed rockId, address tokenIn, address tokenOut, uint256 amountIn);

    /**
     * @notice Registers a new physical rock on-chain.
     */
    function awakenRock(uint256 rockId, address smartAccount) external {
        if (rocks[rockId].isAwake) {
            revert RockAlreadyAwakened(rockId);
        }

        rocks[rockId] = Rock({
            smartAccount: smartAccount,
            currentOwner: msg.sender,
            awakenedAt: block.timestamp,
            isAwake: true
        });

        emit RockAwakened(rockId, msg.sender, smartAccount);
    }

    /**
     * @notice Transfers ownership of the rock to a new custodian.
     * @dev Can be called by either the currentOwner or the rock's smartAccount (via 4337 UserOp).
     */
    function transferOwnership(uint256 rockId, address newOwner) external {
        Rock storage r = rocks[rockId];
        if (!r.isAwake) {
            revert RockNotAwakened(rockId);
        }
        if (msg.sender != r.currentOwner && msg.sender != r.smartAccount) {
            revert UnauthorizedTapper(msg.sender, r.currentOwner);
        }
        if (newOwner == address(0)) {
            revert InvalidNewOwner();
        }

        address previousOwner = r.currentOwner;
        r.currentOwner = newOwner;

        emit RockOwnershipTransferred(rockId, previousOwner, newOwner);
    }

    /**
     * @notice Binds an NFC public key to a rock.
     */
    function bindNFC(uint256 rockId, bytes32 nfcPubKey) external {
        Rock storage r = rocks[rockId];
        if (!r.isAwake) revert RockNotAwakened(rockId);
        if (msg.sender != r.currentOwner && msg.sender != r.smartAccount) {
            revert UnauthorizedTapper(msg.sender, r.currentOwner);
        }
        rockToNfcPubKey[rockId] = nfcPubKey;
    }

    /**
     * @notice Executes a trade.
     */
    // Allowed routers (e.g. 1inch v6 Base Sepolia)
    mapping(address => bool) public whitelistedRouters;

    event RouterWhitelisted(address indexed router, bool status);

    function setRouterWhitelist(address router, bool status) external {
        // In a real production environment, this should be protected by an onlyOwner or Admin role.
        // For hackathon simplicity, we leave it open or hardcode it in constructor.
        whitelistedRouters[router] = status;
        emit RouterWhitelisted(router, status);
    }

    function executeTrade(uint256 rockId, address router, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, bytes calldata routerPayload) external {
        Rock storage r = rocks[rockId];
        if (!r.isAwake) revert RockNotAwakened(rockId);
        if (msg.sender != r.currentOwner && msg.sender != r.smartAccount) {
            revert UnauthorizedTapper(msg.sender, r.currentOwner);
        }
        require(whitelistedRouters[router], "Router not whitelisted");

        // Since the user funds reside on the Smart Account, the call should technically happen FROM the smart account.
        // However, if the funds reside on this Registry contract (e.g. an embedded vault), we execute here:
        
        // 1. Check initial balance
        uint256 balanceBefore = 0;
        if (tokenOut != address(0)) {
            // Simplified ERC20 balance check
            (bool success, bytes memory data) = tokenOut.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
            if (success && data.length > 0) balanceBefore = abi.decode(data, (uint256));
        }

        // 2. Execute swap
        (bool swapSuccess, ) = router.call{value: 0}(routerPayload);
        require(swapSuccess, "Swap execution failed");

        // 3. Verify slippage / balance increase
        uint256 balanceAfter = 0;
        if (tokenOut != address(0)) {
            (bool success, bytes memory data) = tokenOut.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
            if (success && data.length > 0) balanceAfter = abi.decode(data, (uint256));
        }

        require(balanceAfter >= balanceBefore + minAmountOut, "Slippage tolerance exceeded");

        emit TradeExecuted(rockId, tokenIn, tokenOut, amountIn);
    }

    /**
     * @notice Checks if a given rock ID is already awakened.
     */
    function isAwakened(uint256 rockId) external view returns (bool) {
        return rocks[rockId].isAwake;
    }

    /**
     * @notice Returns full Rock struct data.
     */
    function getRock(uint256 rockId) external view returns (Rock memory) {
        return rocks[rockId];
    }

    /**
     * @notice A fun function just for developers poking the contract.
     * @return A greeting message from the rock.
     */
    function poke() external returns (string memory) {
        string memory msg_ = "The rock acknowledges your presence. Keep building!";
        emit RockPoked(msg.sender, msg_);
        return msg_;
    }

    /**
     * @notice A developer-delight feature! Returns the rock's state as a fully 
     * formatted JSON string. Perfect for CLI users `cast call` or Etherscan `Read Contract`
     * tab. You don't even need the ABI to read the state beautifully!
     */
    function getRockStatusJSON(uint256 rockId) external view returns (string memory) {
        Rock memory r = rocks[rockId];
        
        if (!r.isAwake) {
            return '{"status": "unawakened", "message": "This rock is still asleep."}';
        }

        // We use string.concat to build a clean JSON response directly on-chain
        return string.concat(
            '{',
            '"rockId": "', _uint2str(rockId), '",',
            '"status": "awake",',
            '"smartAccount": "', _toAsciiString(r.smartAccount), '",',
            '"owner": "', _toAsciiString(r.currentOwner), '",',
            '"awakenedAt": ', _uint2str(r.awakenedAt),
            '}'
        );
    }

    // --- Internal Helpers ---

    function _uint2str(uint256 _i) internal pure returns (string memory _uintAsString) {
        if (_i == 0) return "0";
        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint256 k = len;
        while (_i != 0) {
            k = k - 1;
            uint8 temp = (48 + uint8(_i - (_i / 10) * 10));
            bytes1 b1 = bytes1(temp);
            bstr[k] = b1;
            _i /= 10;
        }
        return string(bstr);
    }

    function _toAsciiString(address x) internal pure returns (string memory) {
        bytes memory s = new bytes(40);
        for (uint i = 0; i < 20; i++) {
            bytes1 b = bytes1(uint8(uint(uint160(x)) / (2**(8*(19 - i)))));
            bytes1 hi = bytes1(uint8(b) / 16);
            bytes1 lo = bytes1(uint8(b) - 16 * uint8(hi));
            s[2*i] = _char(hi);
            s[2*i+1] = _char(lo);
        }
        return string.concat("0x", string(s));
    }

    function _char(bytes1 b) internal pure returns (bytes1 c) {
        if (uint8(b) < 10) return bytes1(uint8(b) + 0x30);
        else return bytes1(uint8(b) + 0x57);
    }
}
