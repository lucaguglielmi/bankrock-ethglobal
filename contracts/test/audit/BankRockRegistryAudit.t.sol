// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BankRockRegistry} from "../../contracts/BankRockRegistry.sol";

/**
 * @title BankRockRegistryAudit — proof-of-concept tests for the findings in
 *        `contracts/audit/2026-09-12-findings.md`
 *
 * @dev Every test in this file is expected to FAIL against the source as audited on 2026-09-12
 *      and to PASS once the corresponding finding is fixed. Each test states, in a comment, the
 *      property the fix must establish. Style follows `test/BankRockRegistry.t.sol`: a locally
 *      declared cheatcode interface, no dependency beyond OpenZeppelin.
 */
interface Vm {
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

/// @dev A Rock Account that reports one signing owner — the minimum the registry now requires of
///      an account a claim binds.
contract ClaimantAccount {
    address private immutable OWNER;

    constructor(address owner) {
        OWNER = owner;
    }

    function isOwner(address account) external view returns (bool) {
        return account == OWNER;
    }
}

contract BankRockRegistryAuditTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 constant ATTESTER_PK = 0xA11CE;

    /// @dev The giver. Owns the rock first and, through the Safe below, keeps controlling it.
    address constant ALICE = address(0x1111111111111111111111111111111111111111);
    /// @dev The recipient of the gift.
    address constant BOB = address(0x2222222222222222222222222222222222222222);
    /// @dev The Rock Account bound at awakening. Its Safe owner is Alice's wallet (D-029), and
    ///      after an *open* handover it stays Alice's — D-027 says the owner swap is UNAVAILABLE
    ///      for an open gift, so this address remains under the giver's control.
    address constant SAFE = address(0x4444444444444444444444444444444444444444);
    /// @dev Bob's own Rock Account. Since the N-1 fix a claim rebinds the rock's account to the
    ///      one the attestation names, and the registry checks that the named account already
    ///      reports the new owner as one of its signers — so it has to be a real deployed account.
    address BOB_ACCOUNT;
    address constant RELAYER = address(0x5555555555555555555555555555555555555555);

    uint256 constant ROCK = 42;
    bytes32 constant UID = keccak256(hex"04A1B2C3D4E5F6");

    BankRockRegistry registry;
    address attester;

    function setUp() public {
        attester = vm.addr(ATTESTER_PK);
        registry = new BankRockRegistry(address(this), attester);
        BOB_ACCOUNT = address(new ClaimantAccount(BOB));
    }

    // -----------------------------------------------------------------
    // Helpers (mirrors of test/BankRockRegistry.t.sol)
    // -----------------------------------------------------------------

    function _att(uint32 counter, uint256 deadline, address subject, address smartAccount)
        internal
        pure
        returns (BankRockRegistry.Attestation memory)
    {
        return BankRockRegistry.Attestation({
            rockId: ROCK,
            uidHash: UID,
            counter: counter,
            deadline: deadline,
            subject: subject,
            smartAccount: smartAccount
        });
    }

    function _sign(BankRockRegistry.Attestation memory att) internal view returns (bytes memory) {
        bytes32 digest = registry.hashAttestation(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Alice awakens ROCK, bound to UID and to the Rock Account SAFE.
    function _awakenAsAlice() internal {
        BankRockRegistry.Attestation memory att = _att(1, block.timestamp + 300, ALICE, SAFE);
        vm.prank(RELAYER);
        registry.awakenRock(ROCK, SAFE, att, _sign(att));
    }

    /// @dev Alice gives the rock openly ("whoever taps it") and Bob claims it with a fresh tap.
    function _openGiftClaimedByBob() internal {
        _awakenAsAlice();

        vm.prank(ALICE);
        registry.initiateHandover(ROCK, address(0), uint64(block.timestamp + 3600), bytes32(0));

        BankRockRegistry.Attestation memory claim = _att(2, block.timestamp + 300, BOB, BOB_ACCOUNT);
        vm.prank(RELAYER);
        registry.claimHandover(ROCK, claim, _sign(claim));
    }

    function _state() internal view returns (BankRockRegistry.RockState state) {
        (,,, state,,) = registry.getRock(ROCK);
    }

    function _owner() internal view returns (address rockOwner) {
        (rockOwner,,,,,) = registry.getRock(ROCK);
    }

    // -----------------------------------------------------------------
    // F-1 — the giver's Rock Account keeps controller rights after the handover
    // -----------------------------------------------------------------

    /**
     * F-1 (High). `_requireRockController` accepts `r.smartAccount`, and `claimHandover` never
     * changes `r.smartAccount`. After an open gift — where D-027 states the pre-signed Safe owner
     * swap cannot exist — the giver still controls that Safe and therefore still passes the
     * registry's owner gate for a rock they no longer own. `archiveRock` is terminal.
     *
     * THE FIX MUST MAKE TRUE: after `claimHandover`, the Rock Account recorded at awakening is no
     * longer accepted by `_requireRockController` unless it is also the account of the *current*
     * owner. Either bind the claimant's own account (`att.smartAccount`) during the claim, or
     * drop `smartAccount` from the controller set. Both make this test pass.
     */
    function testAudit_F1_theGiversSafeCannotArchiveTheRockAfterTheHandover() public {
        _openGiftClaimedByBob();
        require(_owner() == BOB, "precondition: Bob owns the rock");

        vm.prank(SAFE);
        try registry.archiveRock(ROCK) {
            require(false, "the giver's Rock Account must not be able to retire Bob's rock");
        } catch {
            // Expected once fixed: NotRockOwner.
        }

        require(_state() != BankRockRegistry.RockState.Archived, "the rock must still be alive");
    }

    /**
     * F-1, second consequence: the same stale authority can re-open a handover of a rock the
     * giver no longer owns, moving it out of `Awake` behind the new owner's back.
     *
     * THE FIX MUST MAKE TRUE: as above.
     */
    function testAudit_F1_theGiversSafeCannotReGiftTheRockAfterTheHandover() public {
        _openGiftClaimedByBob();

        vm.prank(SAFE);
        try registry.initiateHandover(ROCK, ALICE, uint64(block.timestamp + 3600), bytes32(0)) {
            require(false, "the giver's Rock Account must not be able to give Bob's rock away");
        } catch {
            // Expected once fixed: NotRockOwner.
        }
    }

    // -----------------------------------------------------------------
    // F-2 — an attestation has no maximum lifetime on-chain
    // -----------------------------------------------------------------

    /**
     * F-2 (Medium). The registry accepts any `deadline` in the future. The ten-minute lifetime
     * exists only in `web/src/lib/nfc/attestation.ts` (`ATTESTATION_TTL_SECONDS`), so a signer bug,
     * a second signer implementation, or a rotated-but-still-trusted key can mint a bearer token
     * that stays spendable for years — against a contract whose own NatSpec calls the attestation
     * "spent the moment it lands".
     *
     * THE FIX MUST MAKE TRUE: a named constant `MAX_ATTESTATION_LIFETIME` (10 minutes, matching
     * the off-chain TTL) is enforced in `_consumeAttestation`, so `deadline > block.timestamp +
     * MAX_ATTESTATION_LIFETIME` reverts with a self-explanatory error.
     */
    function testAudit_F2_anAttestationWithAnUnboundedDeadlineIsRejected() public {
        BankRockRegistry.Attestation memory att = _att(1, type(uint256).max, ALICE, SAFE);
        bytes memory sig = _sign(att);

        vm.prank(RELAYER);
        try registry.awakenRock(ROCK, SAFE, att, sig) {
            require(false, "an attestation valid forever must be rejected");
        } catch {
            // Expected once fixed: AttestationLifetimeTooLong(deadline, maxDeadline).
        }
    }

    // -----------------------------------------------------------------
    // F-3 — administration can be lost in one transaction
    // -----------------------------------------------------------------

    /**
     * F-3 (Medium). The registry inherits plain `Ownable`. `renounceOwnership()` is live on the
     * Etherscan Write tab, one row away from `transferOwnership`, and it permanently removes the
     * only address that can rotate the attester or unpause. That is exactly the threat-model goal
     * "make the attester unrotatable" / "lock a rock forever" reached by a single mis-click.
     *
     * THE FIX MUST MAKE TRUE: `renounceOwnership()` reverts (override it), and ownership moves
     * only through `Ownable2Step` — `transferOwnership` records a pending owner and leaves
     * `owner()` unchanged until the new owner calls `acceptOwnership()`.
     */
    function testAudit_F3_ownershipCannotBeRenouncedOrHandedToATypo() public {
        try registry.renounceOwnership() {
            require(false, "renounceOwnership must be disabled: it makes the attester unrotatable");
        } catch {
            // Expected once fixed.
        }

        registry.transferOwnership(BOB);
        require(
            registry.owner() == address(this),
            "transferOwnership must be two-step: owner() must not move before acceptOwnership()"
        );
    }

    // -----------------------------------------------------------------
    // F-4 — a handover has no maximum duration
    // -----------------------------------------------------------------

    /**
     * F-4 (Low). `initiateHandover` accepts any `expiresAt` in the future, including
     * `type(uint64).max`. An open handover with no real expiry is a standing offer of the object
     * to whoever next taps it, years later, and `getRock` will keep reporting `HandoverPending`
     * forever. The spec calls for `MAX_HANDOVER_DURATION` as a named, tested constant.
     *
     * THE FIX MUST MAKE TRUE: `expiresAt > block.timestamp + MAX_HANDOVER_DURATION` reverts with
     * an error naming both values.
     */
    function testAudit_F4_aHandoverCannotBeOpenForever() public {
        _awakenAsAlice();

        vm.prank(ALICE);
        try registry.initiateHandover(ROCK, address(0), type(uint64).max, bytes32(0)) {
            require(false, "a handover must not be allowed to stay claimable forever");
        } catch {
            // Expected once fixed: HandoverTooLong(expiresAt, maxExpiresAt).
        }
    }

    // -----------------------------------------------------------------
    // F-9 — the expiry boundary is untested and undocumented
    // -----------------------------------------------------------------

    /**
     * F-9 (Informational). `claimHandover` uses `block.timestamp > h.expiresAt`, so a claim
     * landing in the block whose timestamp is exactly `expiresAt` still succeeds, while
     * `initiateHandover` requires `expiresAt > block.timestamp`. That is self-consistent
     * (`expiresAt` is the last claimable second) but nothing in the suite pins it, so a later
     * `>=` "tidy-up" would silently change behaviour at the boundary.
     *
     * THIS TEST PASSES TODAY. It is included as a regression pin, not as a failing PoC: the
     * finding is that the behaviour was unpinned, and the fix is this test plus one sentence of
     * NatSpec on `expiresAt`.
     */
    function testAudit_F9_aClaimAtExactlyExpiresAtStillSucceeds() public {
        _awakenAsAlice();

        uint64 expiresAt = uint64(block.timestamp + 3600);
        vm.prank(ALICE);
        registry.initiateHandover(ROCK, BOB, expiresAt, bytes32(0));

        vm.warp(expiresAt);

        BankRockRegistry.Attestation memory claim = _att(2, block.timestamp + 300, BOB, BOB_ACCOUNT);
        vm.prank(RELAYER);
        registry.claimHandover(ROCK, claim, _sign(claim));

        require(_owner() == BOB, "expiresAt is inclusive: the last claimable second");
        require(_state() == BankRockRegistry.RockState.Awake, "the rock is Awake after the claim");
    }
}
