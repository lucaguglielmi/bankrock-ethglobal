// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {BankRockRegistry} from "../contracts/BankRockRegistry.sol";

/**
 * @dev The subset of the EDR / forge cheatcode interface these tests use. Declared locally so
 *      the suite has no dependency beyond OpenZeppelin; the address is the standard cheatcode
 *      address the Hardhat 3 Solidity test runner exposes.
 */
interface Vm {
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

contract BankRockRegistryTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 constant ATTESTER_PK = 0xA11CE;
    uint256 constant IMPOSTOR_PK = 0xBADBADBAD;

    address constant BOB = address(0x2222222222222222222222222222222222222222);
    address constant CAROL = address(0x3333333333333333333333333333333333333333);
    address constant SAFE = address(0x4444444444444444444444444444444444444444);

    uint256 constant ROCK = 42;
    // keccak256 of a raw 7-byte NTAG UID.
    bytes32 constant UID = keccak256(hex"04A1B2C3D4E5F6");
    bytes32 constant OTHER_UID = keccak256(hex"04FFEEDDCCBBAA");

    BankRockRegistry registry;
    address attester;

    function setUp() public {
        attester = vm.addr(ATTESTER_PK);
        registry = new BankRockRegistry(address(this), attester);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _att(uint256 rockId, bytes32 uidHash, uint32 counter, uint256 deadline)
        internal
        pure
        returns (BankRockRegistry.Attestation memory)
    {
        return BankRockRegistry.Attestation({
            rockId: rockId,
            uidHash: uidHash,
            counter: counter,
            deadline: deadline
        });
    }

    function _sign(uint256 pk, BankRockRegistry.Attestation memory att) internal view returns (bytes memory) {
        bytes32 digest = registry.hashAttestation(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        return abi.encodePacked(r, s, v);
    }

    function _selector(bytes memory reason) internal pure returns (bytes4 sel) {
        if (reason.length < 4) return bytes4(0);
        assembly {
            sel := mload(add(reason, 0x20))
        }
    }

    /// @dev Awakens ROCK bound to UID at counter 1, owned by this test contract.
    function _awaken() internal {
        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 1, block.timestamp + 300);
        registry.awakenRock(ROCK, SAFE, att, _sign(ATTESTER_PK, att));
    }

    // -----------------------------------------------------------------
    // Awakening
    // -----------------------------------------------------------------

    function testAwakenWithValidAttestation() public {
        _awaken();

        (
            address rockOwner,
            address smartAccount,
            bytes32 uidHash,
            BankRockRegistry.RockState state,
            bool lost,
            BankRockRegistry.Handover memory handover
        ) = registry.getRock(ROCK);

        require(rockOwner == address(this), "owner mismatch");
        require(smartAccount == SAFE, "smart account mismatch");
        require(uidHash == UID, "uid binding mismatch");
        require(state == BankRockRegistry.RockState.Awake, "state should be Awake");
        require(!lost, "lost flag should be clear");
        require(handover.expiresAt == 0, "no handover expected");
        require(registry.lastCounter(UID) == 1, "counter should be recorded");
        require(registry.rockIdForUid(UID) == ROCK, "uid should map to rock");
    }

    function testAwakenRejectsNonAttesterSignature() public {
        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 1, block.timestamp + 300);
        bytes memory sig = _sign(IMPOSTOR_PK, att);

        bytes4 sel;
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "impostor signature must be rejected");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.InvalidAttestationSignature.selector, "wrong error");
        require(registry.lastCounter(UID) == 0, "counter must not advance on failure");
    }

    function testAwakenRejectsZeroCounter() public {
        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 0, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "counter 0 must be rejected");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.StaleAttestationCounter.selector, "wrong error");
    }

    function testAwakenRejectedAfterDeadline() public {
        uint256 deadline = block.timestamp + 300;
        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 1, deadline);
        bytes memory sig = _sign(ATTESTER_PK, att);

        vm.warp(deadline + 1);

        bytes4 sel;
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "expired attestation must be rejected");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.AttestationExpired.selector, "wrong error");
    }

    function testCannotAwakenTwice() public {
        _awaken();

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "second awakening must be rejected");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.RockAlreadyAwakened.selector, "wrong error");
    }

    function testUidCannotAwakenASecondRock() public {
        _awaken();

        BankRockRegistry.Attestation memory att = _att(ROCK + 1, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        try registry.awakenRock(ROCK + 1, SAFE, att, sig) {
            require(false, "one tag must not awaken two rocks");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.UidBoundToDifferentRock.selector, "wrong error");
    }

    function testAwakenRejectsAttestationForAnotherRock() public {
        BankRockRegistry.Attestation memory att = _att(ROCK + 7, UID, 1, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "attestation for another rock must be rejected");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.AttestationRockMismatch.selector, "wrong error");
    }

    // -----------------------------------------------------------------
    // Handover — Flow E
    // -----------------------------------------------------------------

    function testHandoverInitiateAndClaim() public {
        _awaken();

        uint64 expiresAt = uint64(block.timestamp + 1 days);
        bytes32 messageHash = keccak256("for your birthday");
        registry.initiateHandover(ROCK, BOB, expiresAt, messageHash);

        (,,, BankRockRegistry.RockState pendingState,, BankRockRegistry.Handover memory h) = registry.getRock(ROCK);
        require(pendingState == BankRockRegistry.RockState.HandoverPending, "should be pending");
        require(h.recipient == BOB, "recipient mismatch");
        require(h.expiresAt == expiresAt, "expiry mismatch");
        require(h.messageHash == messageHash, "message hash mismatch");
        require(h.initiatedBy == address(this), "initiator mismatch");

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        vm.prank(BOB);
        registry.claimHandover(ROCK, att, sig);

        (
            address rockOwner,
            address smartAccount,
            ,
            BankRockRegistry.RockState state,
            ,
            BankRockRegistry.Handover memory cleared
        ) = registry.getRock(ROCK);
        require(rockOwner == BOB, "ownership should move to Bob");
        require(smartAccount == SAFE, "smart account must be unchanged");
        require(state == BankRockRegistry.RockState.Awake, "state should return to Awake");
        require(cleared.expiresAt == 0 && cleared.recipient == address(0), "handover should be cleared");
        require(registry.lastCounter(UID) == 2, "counter should advance");
    }

    function testOpenHandoverIsClaimableByAnyone() public {
        _awaken();

        registry.initiateHandover(ROCK, address(0), uint64(block.timestamp + 1 days), bytes32(0));

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        vm.prank(CAROL);
        registry.claimHandover(ROCK, att, sig);

        (address rockOwner,,,,,) = registry.getRock(ROCK);
        require(rockOwner == CAROL, "open handover should be claimable by the tapper");
    }

    function testClaimRejectsReplayedCounter() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));

        // Counter 1 was already consumed by the awakening: a captured URL cannot be replayed.
        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 1, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "stale counter must be rejected");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.StaleAttestationCounter.selector, "wrong error");

        (address rockOwner,,,,,) = registry.getRock(ROCK);
        require(rockOwner == address(this), "ownership must not have moved");
    }

    function testClaimRejectsAttestationForAnotherUid() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));

        BankRockRegistry.Attestation memory att = _att(ROCK, OTHER_UID, 9, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "a different tag must not claim this rock");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.AttestationUidMismatch.selector, "wrong error");
    }

    function testClaimAfterExpiryRejected() public {
        _awaken();

        uint64 expiresAt = uint64(block.timestamp + 1 days);
        registry.initiateHandover(ROCK, BOB, expiresAt, bytes32(0));

        vm.warp(uint256(expiresAt) + 1);

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "expired handover must not be claimable");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.HandoverExpired.selector, "wrong error");

        (address rockOwner,,, BankRockRegistry.RockState state,,) = registry.getRock(ROCK);
        require(rockOwner == address(this), "ownership must not have moved");
        require(state == BankRockRegistry.RockState.Awake, "expired handover reports as Awake");
    }

    function testClaimByWrongRecipientRejected() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(CAROL);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "only the named recipient may claim");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.NotHandoverRecipient.selector, "wrong error");
    }

    function testCancelHandover() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));

        registry.cancelHandover(ROCK);

        (,,, BankRockRegistry.RockState state,, BankRockRegistry.Handover memory h) = registry.getRock(ROCK);
        require(state == BankRockRegistry.RockState.Awake, "state should be Awake after cancel");
        require(h.recipient == address(0) && h.expiresAt == 0, "handover should be cleared");

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "cancelled handover must not be claimable");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.HandoverNotPending.selector, "wrong error");
    }

    function testOnlyOwnerCanCancelHandover() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));

        bytes4 sel;
        vm.prank(BOB);
        try registry.cancelHandover(ROCK) {
            require(false, "recipient must not cancel");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.NotRockOwner.selector, "wrong error");
    }

    function testOnlyRockOwnerCanInitiateHandover() public {
        _awaken();

        bytes4 sel;
        vm.prank(BOB);
        try registry.initiateHandover(ROCK, CAROL, uint64(block.timestamp + 1 days), bytes32(0)) {
            require(false, "non-owner must not initiate a handover");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.NotRockOwner.selector, "wrong error");
    }

    // -----------------------------------------------------------------
    // Archiving — reuse one physical tag for a new rock
    // -----------------------------------------------------------------

    function testArchiveFromAwake() public {
        _awaken();

        registry.archiveRock(ROCK);

        (
            address rockOwner,
            address smartAccount,
            bytes32 uidHash,
            BankRockRegistry.RockState state,
            ,
        ) = registry.getRock(ROCK);

        require(state == BankRockRegistry.RockState.Archived, "state should be Archived");
        // History survives archiving.
        require(rockOwner == address(this), "archived rock keeps its owner");
        require(smartAccount == SAFE, "archived rock keeps its smart account");
        require(uidHash == UID, "archived rock keeps its UID binding");
        // The tag, however, is released.
        require(registry.rockIdForUid(UID) == 0, "tag should no longer be bound to a rock");
        // Replay protection is not rewound.
        require(registry.lastCounter(UID) == 1, "counter must survive archiving");
    }

    function testArchiveCancelsPendingHandover() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), keccak256("gift"));

        registry.archiveRock(ROCK);

        (,,, BankRockRegistry.RockState state,, BankRockRegistry.Handover memory h) = registry.getRock(ROCK);
        require(state == BankRockRegistry.RockState.Archived, "state should be Archived");
        require(h.recipient == address(0) && h.expiresAt == 0, "handover should be cleared");

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "a cancelled handover must not be claimable");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.HandoverNotPending.selector, "wrong error");
    }

    function testOnlyRockOwnerCanArchive() public {
        _awaken();

        bytes4 sel;
        vm.prank(BOB);
        try registry.archiveRock(ROCK) {
            require(false, "non-owner must not archive");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.NotRockOwner.selector, "wrong error");

        (,,, BankRockRegistry.RockState state,,) = registry.getRock(ROCK);
        require(state == BankRockRegistry.RockState.Awake, "rock must still be Awake");
    }

    function testArchivedRockCannotBeAwakenedAgain() public {
        _awaken();
        registry.archiveRock(ROCK);

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "an archived rock must not be awakened again");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.RockIsArchived.selector, "wrong error");
    }

    function testArchivedRockCannotInitiateHandover() public {
        _awaken();
        registry.archiveRock(ROCK);

        bytes4 sel;
        try registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0)) {
            require(false, "an archived rock must not be given away");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.RockIsArchived.selector, "wrong error");
    }

    function testArchivedRockCannotBeArchivedAgain() public {
        _awaken();
        registry.archiveRock(ROCK);

        bytes4 sel;
        try registry.archiveRock(ROCK) {
            require(false, "archiving is one-way and idempotent calls must revert");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.RockIsArchived.selector, "wrong error");
    }

    function testArchivedRockCannotBeMarkedLost() public {
        _awaken();
        registry.archiveRock(ROCK);

        bytes4 sel;
        try registry.markLost(ROCK) {
            require(false, "an archived rock must not change state");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.RockIsArchived.selector, "wrong error");
    }

    function testSameUidAwakensANewRockAfterArchive() public {
        _awaken();
        registry.archiveRock(ROCK);

        uint256 freshRock = ROCK + 1;
        BankRockRegistry.Attestation memory att = _att(freshRock, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        vm.prank(BOB);
        registry.awakenRock(freshRock, SAFE, att, sig);

        (address rockOwner,, bytes32 uidHash, BankRockRegistry.RockState state,,) = registry.getRock(freshRock);
        require(rockOwner == BOB, "the new rock belongs to whoever awakened it");
        require(uidHash == UID, "the same tag now backs the new rock");
        require(state == BankRockRegistry.RockState.Awake, "new rock should be Awake");
        require(registry.rockIdForUid(UID) == freshRock, "tag should be rebound to the new rock");

        // And the old rock is untouched by any of it.
        (,,, BankRockRegistry.RockState oldState,,) = registry.getRock(ROCK);
        require(oldState == BankRockRegistry.RockState.Archived, "old rock stays archived");
    }

    function testLiveUidStillCannotAwakenASecondRockAfterAnUnrelatedArchive() public {
        // ROCK is archived and its tag released; OTHER_UID awakens a live rock that must keep
        // its exclusive claim on that tag.
        _awaken();
        registry.archiveRock(ROCK);

        uint256 liveRock = ROCK + 1;
        BankRockRegistry.Attestation memory first = _att(liveRock, OTHER_UID, 1, block.timestamp + 300);
        registry.awakenRock(liveRock, SAFE, first, _sign(ATTESTER_PK, first));

        uint256 thirdRock = ROCK + 2;
        BankRockRegistry.Attestation memory second = _att(thirdRock, OTHER_UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, second);

        bytes4 sel;
        try registry.awakenRock(thirdRock, SAFE, second, sig) {
            require(false, "a tag bound to a live rock must not awaken another");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.UidBoundToDifferentRock.selector, "wrong error");
    }

    function testCounterStaysMonotonicAcrossTheArchiveBoundary() public {
        // Burn counters 1 and 2 on the original rock: awaken, then hand over.
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));
        BankRockRegistry.Attestation memory claim = _att(ROCK, UID, 2, block.timestamp + 300);
        // Sign before pranking: hashAttestation is itself a call, and would consume the prank.
        bytes memory claimSig = _sign(ATTESTER_PK, claim);
        vm.prank(BOB);
        registry.claimHandover(ROCK, claim, claimSig);
        require(registry.lastCounter(UID) == 2, "counter should be 2 before archiving");

        vm.prank(BOB);
        registry.archiveRock(ROCK);
        require(registry.lastCounter(UID) == 2, "archiving must not reset the counter");

        // A tap captured before the archive — counter 2 — must not work on the new rock.
        uint256 freshRock = ROCK + 1;
        BankRockRegistry.Attestation memory replay = _att(freshRock, UID, 2, block.timestamp + 300);
        bytes memory replaySig = _sign(ATTESTER_PK, replay);

        bytes4 sel;
        try registry.awakenRock(freshRock, SAFE, replay, replaySig) {
            require(false, "a pre-archive counter must not be reusable on the new rock");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.StaleAttestationCounter.selector, "wrong error");

        // A genuinely newer tap does work.
        BankRockRegistry.Attestation memory fresh = _att(freshRock, UID, 3, block.timestamp + 300);
        registry.awakenRock(freshRock, SAFE, fresh, _sign(ATTESTER_PK, fresh));
        require(registry.lastCounter(UID) == 3, "counter should advance to 3");
    }

    function testArchiveIsNotPauseGated() public {
        _awaken();
        registry.pause();

        // Like cancelHandover, archiving only removes ways to act on a rock, so the emergency
        // stop must not be able to trap a tag.
        registry.archiveRock(ROCK);

        (,,, BankRockRegistry.RockState state,,) = registry.getRock(ROCK);
        require(state == BankRockRegistry.RockState.Archived, "archive should work while paused");
        require(registry.rockIdForUid(UID) == 0, "tag should be released while paused");
    }

    // -----------------------------------------------------------------
    // Lost flag — Flow F
    // -----------------------------------------------------------------

    function testMarkAndClearLost() public {
        _awaken();

        registry.markLost(ROCK);
        (,,,, bool lost,) = registry.getRock(ROCK);
        require(lost, "lost flag should be set");

        registry.clearLost(ROCK);
        (,,,, lost,) = registry.getRock(ROCK);
        require(!lost, "lost flag should be cleared");
    }

    function testOnlyRockOwnerCanMarkLost() public {
        _awaken();

        bytes4 sel;
        vm.prank(BOB);
        try registry.markLost(ROCK) {
            require(false, "non-owner must not mark lost");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.NotRockOwner.selector, "wrong error");
    }

    // -----------------------------------------------------------------
    // Administration
    // -----------------------------------------------------------------

    function testPauseBlocksAwaken() public {
        registry.pause();

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 1, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "paused registry must not awaken");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == Pausable.EnforcedPause.selector, "wrong error");

        registry.unpause();
        registry.awakenRock(ROCK, SAFE, att, sig);
        (address rockOwner,,,,,) = registry.getRock(ROCK);
        require(rockOwner == address(this), "awaken should succeed after unpause");
    }

    function testPauseBlocksHandoverInitiation() public {
        _awaken();
        registry.pause();

        bytes4 sel;
        try registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0)) {
            require(false, "paused registry must not open handovers");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == Pausable.EnforcedPause.selector, "wrong error");
    }

    function testPauseBlocksHandoverClaim() public {
        _awaken();
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 1 days), bytes32(0));
        registry.pause();

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 2, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        vm.prank(BOB);
        try registry.claimHandover(ROCK, att, sig) {
            require(false, "paused registry must not settle handovers");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == Pausable.EnforcedPause.selector, "wrong error");
    }

    function testOnlyOwnerCanPause() public {
        bytes4 sel;
        vm.prank(BOB);
        try registry.pause() {
            require(false, "non-owner must not pause");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == Ownable.OwnableUnauthorizedAccount.selector, "wrong error");
    }

    function testOnlyOwnerCanSetAttester() public {
        bytes4 sel;
        vm.prank(BOB);
        try registry.setAttester(CAROL) {
            require(false, "non-owner must not set the attester");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == Ownable.OwnableUnauthorizedAccount.selector, "wrong error");
        require(registry.attester() == attester, "attester must be unchanged");

        registry.setAttester(CAROL);
        require(registry.attester() == CAROL, "owner should be able to rotate the attester");
    }

    function testRotatedAttesterIsEnforced() public {
        registry.setAttester(CAROL);

        BankRockRegistry.Attestation memory att = _att(ROCK, UID, 1, block.timestamp + 300);
        bytes memory sig = _sign(ATTESTER_PK, att);

        bytes4 sel;
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "the retired attester must no longer be accepted");
        } catch (bytes memory reason) {
            sel = _selector(reason);
        }
        require(sel == BankRockRegistry.InvalidAttestationSignature.selector, "wrong error");
    }

    function testAttestationTypehashIsStable() public view {
        require(
            registry.ATTESTATION_TYPEHASH()
                == keccak256("Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline)"),
            "EIP-712 type string changed"
        );
    }

    function testDomainSeparatorMatchesSpecifiedDomain() public view {
        bytes32 expected = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("BankRockRegistry")),
                keccak256(bytes("1")),
                block.chainid,
                address(registry)
            )
        );
        require(registry.domainSeparator() == expected, "EIP-712 domain changed");
    }
}
