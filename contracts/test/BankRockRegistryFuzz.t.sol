// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BankRockRegistry} from "../contracts/BankRockRegistry.sol";

/**
 * @dev The cheatcode subset these tests use, declared locally in the style of the rest of the
 *      suite so nothing depends on a vendored test library.
 */
interface Vm {
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
    function assume(bool condition) external pure;
}

/// @dev A Rock Account that answers `isOwner` for a set of addresses, like a Safe.
contract FuzzSafe {
    mapping(address account => bool isAnOwner) private _owners;

    function setOwner(address account, bool isAnOwner) external {
        _owners[account] = isAnOwner;
    }

    function isOwner(address account) external view returns (bool) {
        return _owners[account];
    }
}

/**
 * @title BankRockRegistryFuzz — property tests for the three invariants
 *        `specs/19-contract-review-and-hardening.md` Part 1.2 names under Tooling, and which
 *        audit finding F-13 recorded as missing.
 *
 * @dev Two of the three live here (the third, the taker's balance invariant, is in
 *      `test/aqua/XYCSwapTakerFuzz.t.sol` because it needs the Aqua fixture):
 *
 *        1. counter monotonicity across any interleaving of awakenings and retirements;
 *        2. the handover state machine under random action sequences.
 *
 *      The Hardhat 3 Solidity runner fuzzes any `testFuzz_` function with parameters, so the
 *      inputs below are drawn at random on every run.
 */
contract BankRockRegistryFuzzTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 constant ATTESTER_PK = 0xA11CE;

    address constant ALICE = address(0x1111111111111111111111111111111111111111);
    address constant BOB = address(0x2222222222222222222222222222222222222222);
    address constant CAROL = address(0x3333333333333333333333333333333333333333);
    address constant RELAYER = address(0x5555555555555555555555555555555555555555);

    bytes32 constant UID = keccak256(hex"04A1B2C3D4E5F6");

    BankRockRegistry registry;
    FuzzSafe safeAccount;
    address attester;

    function setUp() public {
        attester = vm.addr(ATTESTER_PK);
        registry = new BankRockRegistry(address(this), attester);
        safeAccount = new FuzzSafe();
        safeAccount.setOwner(ALICE, true);
        safeAccount.setOwner(BOB, true);
        safeAccount.setOwner(CAROL, true);
    }

    /* ------------------------------------------------------------------ */
    /* Helpers                                                             */
    /* ------------------------------------------------------------------ */

    function _att(uint256 rockId, uint32 counter, address subject, address smartAccount)
        internal
        view
        returns (BankRockRegistry.Attestation memory)
    {
        return BankRockRegistry.Attestation({
            rockId: rockId,
            uidHash: UID,
            counter: counter,
            deadline: block.timestamp + 60,
            subject: subject,
            smartAccount: smartAccount
        });
    }

    function _sign(BankRockRegistry.Attestation memory att) internal view returns (bytes memory) {
        bytes32 digest = registry.hashAttestation(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, digest);
        return abi.encodePacked(r, s, v);
    }

    function _state(uint256 rockId) internal view returns (BankRockRegistry.RockState state) {
        (,,, state,,) = registry.getRock(rockId);
    }

    /* ------------------------------------------------------------------ */
    /* 1. Counter monotonicity                                             */
    /* ------------------------------------------------------------------ */

    /**
     * @dev Property: `lastCounter(uid)` never decreases, and every counter the registry accepts
     *      strictly exceeds the one before it — across any interleaving of awakenings and
     *      retirements, and no matter how many rocks the tag has backed along the way.
     *
     *      This is the one that matters most: retiring a rock deliberately releases the tag so it
     *      can awaken a new rock id, and the whole safety of that reuse rests on the counter *not*
     *      being released with it.
     */
    function testFuzz_counterIsMonotonicAcrossAnySequence(uint32[8] memory counters, bool[8] memory retireBetween)
        public
    {
        uint256 rockId = 1;
        uint32 highest = 0;
        bool rockIsLive = false;

        for (uint256 i = 0; i < counters.length; i++) {
            uint32 counter = counters[i];

            if (!rockIsLive) {
                BankRockRegistry.Attestation memory att = _att(rockId, counter, ALICE, address(safeAccount));
                bytes memory sig = _sign(att);

                vm.prank(RELAYER);
                try registry.awakenRock(rockId, address(safeAccount), att, sig) {
                    // Accepted, so it must have been strictly greater than everything before it.
                    require(counter > highest, "an accepted counter must beat every earlier one");
                    highest = counter;
                    rockIsLive = true;
                } catch {
                    // Rejected, so it must have been stale. Nothing may have moved.
                    require(counter <= highest, "only a stale counter may be rejected");
                }
            }

            require(registry.lastCounter(UID) == highest, "lastCounter never moves except on acceptance");

            if (rockIsLive && retireBetween[i]) {
                vm.prank(ALICE);
                registry.archiveRock(rockId);
                rockIsLive = false;
                rockId++;

                require(registry.rockIdForUid(UID) == 0, "retiring releases the tag");
                require(registry.lastCounter(UID) == highest, "retiring never releases the counter");
            }
        }
    }

    /* ------------------------------------------------------------------ */
    /* 2. The handover state machine                                       */
    /* ------------------------------------------------------------------ */

    /**
     * @dev Property: under any sequence of owner and claimant actions, the registry's invariants
     *      hold —
     *
     *        * `Archived` is absorbing: nothing leaves it;
     *        * a reported `HandoverPending` always has a live, non-empty gift;
     *        * a gift whose expiry has passed is reported as `Awake` and is claimable by nobody;
     *        * a live rock always has an owner, and that owner can always act on it, so no
     *          sequence can strand a rock in a state nobody can leave.
     */
    function testFuzz_handoverStateMachineHoldsItsInvariants(uint8[12] memory actions, uint16[12] memory durations)
        public
    {
        uint256 rockId = 1;
        uint32 counter = 1;

        BankRockRegistry.Attestation memory awaken = _att(rockId, counter++, ALICE, address(safeAccount));
        vm.prank(RELAYER);
        registry.awakenRock(rockId, address(safeAccount), awaken, _sign(awaken));

        address owner = ALICE;
        bool archived = false;

        for (uint256 i = 0; i < actions.length; i++) {
            uint8 action = actions[i] % 5;
            // 1 hour … ~46 days, always inside MAX_HANDOVER_DURATION.
            uint64 duration = uint64(durations[i]) + 1 hours;

            if (action == 0) {
                address recipient = owner == ALICE ? BOB : ALICE;
                vm.prank(owner);
                try registry.initiateHandover(rockId, recipient, uint64(block.timestamp) + duration, bytes32(0)) {
                    require(!archived, "a retired rock must never accept a gift");
                } catch {
                    require(archived, "the owner may always open a gift on a live rock");
                }
            } else if (action == 1) {
                (,,, BankRockRegistry.RockState before,, BankRockRegistry.Handover memory gift) =
                    registry.getRock(rockId);
                address claimant = gift.recipient == address(0) ? CAROL : gift.recipient;

                BankRockRegistry.Attestation memory att = _att(rockId, counter, claimant, address(0));
                bytes memory sig = _sign(att);
                vm.prank(RELAYER);
                try registry.claimHandover(rockId, att, sig) {
                    require(before == BankRockRegistry.RockState.HandoverPending, "only a live gift is claimable");
                    owner = claimant;
                    counter++;
                } catch {
                    // A rejected claim must never have moved the owner.
                    (address stillOwner,,,,,) = registry.getRock(rockId);
                    require(stillOwner == owner, "a rejected claim changes nothing");
                }
            } else if (action == 2) {
                vm.prank(owner);
                try registry.cancelHandover(rockId) {
                    require(_state(rockId) == BankRockRegistry.RockState.Awake, "cancelling returns to Awake");
                } catch {
                    // Nothing to cancel. Fine.
                }
            } else if (action == 3) {
                vm.warp(block.timestamp + duration);
            } else {
                vm.prank(owner);
                try registry.archiveRock(rockId) {
                    archived = true;
                } catch {
                    require(archived, "the owner may always retire a live rock");
                }
            }

            _assertInvariants(rockId, owner, archived);
        }
    }

    function _assertInvariants(uint256 rockId, address owner, bool archived) private view {
        (address rockOwner,,, BankRockRegistry.RockState state,, BankRockRegistry.Handover memory gift) =
            registry.getRock(rockId);

        if (archived) {
            require(state == BankRockRegistry.RockState.Archived, "Archived is absorbing");
            return;
        }

        require(state != BankRockRegistry.RockState.Dormant, "an awakened rock never returns to Dormant");
        require(state != BankRockRegistry.RockState.Archived, "a rock is only Archived when retired");
        require(rockOwner == owner, "the owner is who the last accepted action made it");
        require(rockOwner != address(0), "a live rock always has an owner");

        if (state == BankRockRegistry.RockState.HandoverPending) {
            require(gift.expiresAt >= block.timestamp, "a reported gift has not expired");
            require(gift.initiatedBy != address(0), "a reported gift is a real record");
        } else {
            require(
                gift.expiresAt == 0 || gift.expiresAt < block.timestamp,
                "Awake means no gift, or one that has lapsed"
            );
        }
    }

    /* ------------------------------------------------------------------ */
    /* 3. Bounded lifetimes, over the whole input range                    */
    /* ------------------------------------------------------------------ */

    /// @dev Property: an attestation is accepted exactly when its deadline is in `[now, now+MAX]`.
    function testFuzz_attestationDeadlineWindowIsExact(uint256 deadline) public {
        uint256 earliest = block.timestamp;
        uint256 latest = block.timestamp + registry.MAX_ATTESTATION_LIFETIME();

        BankRockRegistry.Attestation memory att = BankRockRegistry.Attestation({
            rockId: 1,
            uidHash: UID,
            counter: 1,
            deadline: deadline,
            subject: ALICE,
            smartAccount: address(safeAccount)
        });
        bytes memory sig = _sign(att);

        vm.prank(RELAYER);
        try registry.awakenRock(1, address(safeAccount), att, sig) {
            require(deadline >= earliest && deadline <= latest, "accepted only inside the window");
        } catch {
            require(deadline < earliest || deadline > latest, "rejected only outside the window");
        }
    }

    /// @dev Property: a gift is accepted exactly when its expiry is in `(now, now+MAX]`.
    function testFuzz_handoverExpiryWindowIsExact(uint64 expiresAt) public {
        BankRockRegistry.Attestation memory awaken = _att(1, 1, ALICE, address(safeAccount));
        vm.prank(RELAYER);
        registry.awakenRock(1, address(safeAccount), awaken, _sign(awaken));

        uint64 now64 = uint64(block.timestamp);
        // The contract computes the ceiling in uint64 and would wrap for a timestamp near the
        // type's limit; the chain is nowhere near it, and neither is this test.
        uint64 latest = now64 + registry.MAX_HANDOVER_DURATION();

        vm.prank(ALICE);
        try registry.initiateHandover(1, BOB, expiresAt, bytes32(0)) {
            require(expiresAt > now64 && expiresAt <= latest, "accepted only inside the window");
        } catch {
            require(expiresAt <= now64 || expiresAt > latest, "rejected only outside the window");
        }
    }
}
