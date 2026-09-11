// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BankRockRegistry} from "../contracts/BankRockRegistry.sol";

contract MockCaller {
    function tryTransfer(BankRockRegistry registry, uint256 rockId, address newOwner) external returns (bool) {
        try registry.transferOwnership(rockId, newOwner) {
            return true;
        } catch {
            return false;
        }
    }
}

contract BankRockRegistryTest {
    BankRockRegistry registry;

    address constant ALICE = address(0x1111111111111111111111111111111111111111);
    address constant BOB = address(0x2222222222222222222222222222222222222222);
    address constant SAFE = address(0x3333333333333333333333333333333333333333);

    function setUp() public {
        registry = new BankRockRegistry();
    }

    function testAwakenRock() public {
        uint256 rockId = 42;
        registry.awakenRock(rockId, SAFE);

        bool awake = registry.isAwakened(rockId);
        require(awake, "Rock should be awake");

        BankRockRegistry.Rock memory r = registry.getRock(rockId);
        require(r.smartAccount == SAFE, "Safe address mismatch");
        require(r.currentOwner == address(this), "Owner mismatch");
        require(r.isAwake == true, "isAwake flag mismatch");
        require(r.awakenedAt > 0, "awakenedAt timestamp should be set");
    }

    function testCannotAwakenTwice() public {
        uint256 rockId = 55;
        registry.awakenRock(rockId, SAFE);

        bool failed = false;
        try registry.awakenRock(rockId, ALICE) {
            failed = false;
        } catch {
            failed = true;
        }
        require(failed, "Double awakening must revert");
    }

    function testTransferOwnership() public {
        uint256 rockId = 100;
        registry.awakenRock(rockId, SAFE);

        registry.transferOwnership(rockId, BOB);

        BankRockRegistry.Rock memory r = registry.getRock(rockId);
        require(r.currentOwner == BOB, "Owner should be updated to Bob");
    }

    function testUnauthorizedTransferReverts() public {
        uint256 rockId = 101;
        registry.awakenRock(rockId, SAFE);

        MockCaller unauthorized = new MockCaller();
        bool success = unauthorized.tryTransfer(registry, rockId, BOB);
        require(!success, "Unauthorized caller should revert");
    }

    function testPoke() public {
        string memory greeting = registry.poke();
        require(bytes(greeting).length > 0, "Poke should return greeting");
    }

    function testJSONStatus() public {
        uint256 rockId = 77;
        string memory unawakenedJson = registry.getRockStatusJSON(rockId);
        require(bytes(unawakenedJson).length > 0, "Unawakened JSON should not be empty");

        registry.awakenRock(rockId, SAFE);
        string memory awakenedJson = registry.getRockStatusJSON(rockId);
        require(bytes(awakenedJson).length > 0, "Awakened JSON should not be empty");
    }
}
