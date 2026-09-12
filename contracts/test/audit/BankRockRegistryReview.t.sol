// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BankRockRegistry} from "../../contracts/BankRockRegistry.sol";

/**
 * @title BankRockRegistryReview — proof of concept for the finding raised in the cold re-review,
 *        `contracts/audit/2026-09-12-signoff.md` (N-1).
 *
 * @dev The hardening pass closed audit finding F-1 by asking the recorded Rock Account whether the
 *      rock's *current* owner is one of its signing owners. That is a real improvement for the
 *      passive case, but the question is put to a contract the previous owner still controls, and a
 *      Safe's owner set is writable by the Safe itself. A giver who wants the rock back — or wants
 *      it destroyed — adds the recipient as a signing owner of her own Safe, acts, and removes them
 *      again, all inside one `execTransaction` she alone signs.
 *
 *      This test is expected to FAIL against the source as of 2026-09-12 and to PASS once N-1 is
 *      fixed. The fix must make the Rock Account's authority follow the rock: bind the claimant's
 *      own account during `claimHandover` (the original F-1 recommendation), or stop treating the
 *      account recorded at awakening as a controller once the rock has changed hands.
 */
interface Vm {
    function addr(uint256 privateKey) external pure returns (address);
    function sign(uint256 privateKey, bytes32 digest) external pure returns (uint8 v, bytes32 r, bytes32 s);
    function prank(address sender) external;
    function warp(uint256 timestamp) external;
}

/**
 * @dev A faithful stand-in for the 1-of-1 Safe a Rock Account is.
 *
 *      - `isOwner` is the view the registry calls.
 *      - `addOwnerWithThreshold` / `removeOwner` carry Safe's `authorized` guard: only the Safe
 *        itself may call them, which in practice means a signing owner routing a call through
 *        `execTransaction`.
 *      - `execBatch` stands in for `execTransaction` + `MultiSend`: any current signing owner
 *        submits a batch, and every call in it is made *by the Safe*.
 */
contract GiverSafe {
    mapping(address account => bool isAnOwner) private _owners;

    constructor(address initialOwner) {
        _owners[initialOwner] = true;
    }

    function isOwner(address account) external view returns (bool) {
        return _owners[account];
    }

    /// @dev Safe's `OwnerManager.addOwnerWithThreshold`, `authorized` to the Safe itself.
    function addOwnerWithThreshold(address account, uint256) external {
        require(msg.sender == address(this), "GS031");
        _owners[account] = true;
    }

    /// @dev Safe's `OwnerManager.removeOwner`, `authorized` to the Safe itself.
    function removeOwner(address, address account, uint256) external {
        require(msg.sender == address(this), "GS031");
        _owners[account] = false;
    }

    /// @dev One `execTransaction` over a `MultiSend` batch, signed by a single owner.
    function execBatch(address[] calldata targets, bytes[] calldata payloads) external {
        require(_owners[msg.sender], "GS026");
        require(targets.length == payloads.length, "length");
        for (uint256 i = 0; i < targets.length; i++) {
            (bool ok,) = targets[i].call(payloads[i]);
            require(ok, "batched call reverted");
        }
    }
}

contract BankRockRegistryReviewTest {
    Vm constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 constant ATTESTER_PK = 0xA11CE;

    address constant ALICE = address(0x1111111111111111111111111111111111111111);
    address constant BOB = address(0x2222222222222222222222222222222222222222);
    address constant RELAYER = address(0x5555555555555555555555555555555555555555);

    uint256 constant ROCK = 42;
    bytes32 constant UID = keccak256(hex"04A1B2C3D4E5F6");

    BankRockRegistry registry;
    GiverSafe safe;
    /// @dev Bob's own Rock Account. Since the N-1 fix a claim rebinds the rock's account to the
    ///      one the attestation names — on the open-gift path, the claimant's own — so a claim
    ///      attestation has to carry a real address and the giver's Safe stops being the rock's
    ///      account at the moment of the claim.
    GiverSafe bobSafe;
    address attester;

    function setUp() public {
        attester = vm.addr(ATTESTER_PK);
        registry = new BankRockRegistry(address(this), attester);
        safe = new GiverSafe(ALICE);
        bobSafe = new GiverSafe(BOB);
    }

    function _att(uint32 counter, address subject, address smartAccount)
        internal
        view
        returns (BankRockRegistry.Attestation memory)
    {
        return BankRockRegistry.Attestation({
            rockId: ROCK,
            uidHash: UID,
            counter: counter,
            deadline: block.timestamp + 300,
            subject: subject,
            smartAccount: smartAccount
        });
    }

    function _sign(BankRockRegistry.Attestation memory att) internal view returns (bytes memory) {
        bytes32 digest = registry.hashAttestation(att);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(ATTESTER_PK, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @dev Alice awakens the rock against her Safe, gives it openly, and Bob claims it. This is
    ///      the documented open-gift path: the Safe owner swap cannot be pre-signed (D-027), so
    ///      the Rock Account stays Alice's while the registry's owner becomes Bob.
    function _openGiftClaimedByBob() internal {
        BankRockRegistry.Attestation memory awaken = _att(1, ALICE, address(safe));
        vm.prank(RELAYER);
        registry.awakenRock(ROCK, address(safe), awaken, _sign(awaken));

        vm.prank(ALICE);
        registry.initiateHandover(ROCK, address(0), uint64(block.timestamp + 3600), bytes32(0));

        BankRockRegistry.Attestation memory claim = _att(2, BOB, address(bobSafe));
        vm.prank(RELAYER);
        registry.claimHandover(ROCK, claim, _sign(claim));
    }

    function _state() internal view returns (BankRockRegistry.RockState state) {
        (,,, state,,) = registry.getRock(ROCK);
    }

    /**
     * N-1. `_requireRockController` admits the recorded Rock Account whenever that account answers
     * `isOwner(currentOwner)` with `true`. After an open gift the account is still the giver's
     * Safe, and a Safe's owner set is writable by the Safe — so the giver can make the answer
     * `true` on demand. One `execTransaction` signed by Alice alone:
     *
     *     addOwnerWithThreshold(BOB, 1)   // the gate now admits this Safe
     *     registry.archiveRock(ROCK)      // Bob's rock is destroyed, terminally
     *     removeOwner(SENTINEL, BOB, 1)   // Bob never actually gained anything
     *
     * THE FIX MUST MAKE TRUE: once a rock has changed hands, the account bound at awakening is not
     * a controller of it, whatever that account says about its own signers.
     */
    function testReview_N1_theGiversSafeCannotBuyBackControlByAddingTheRecipientAsASigner() public {
        _openGiftClaimedByBob();

        (address rockOwner, address rockAccount,,,,) = registry.getRock(ROCK);
        require(rockOwner == BOB, "precondition: Bob owns the rock");
        require(rockAccount == address(bobSafe), "precondition: the claim rebound the Rock Account to Bob's");
        require(rockAccount != address(safe), "precondition: the giver's Safe is no longer the rock's account");
        require(!safe.isOwner(BOB), "precondition: the giver's Safe does not answer to Bob yet");

        address[] memory targets = new address[](3);
        bytes[] memory payloads = new bytes[](3);

        targets[0] = address(safe);
        payloads[0] = abi.encodeWithSelector(GiverSafe.addOwnerWithThreshold.selector, BOB, uint256(1));

        targets[1] = address(registry);
        payloads[1] = abi.encodeWithSelector(BankRockRegistry.archiveRock.selector, ROCK);

        targets[2] = address(safe);
        payloads[2] = abi.encodeWithSelector(GiverSafe.removeOwner.selector, address(0x1), BOB, uint256(1));

        vm.prank(ALICE);
        try safe.execBatch(targets, payloads) {
            require(false, "the giver must not be able to retire the recipient's rock");
        } catch {
            // Expected once fixed: the batched archiveRock reverts NotRockOwner.
        }

        require(_state() != BankRockRegistry.RockState.Archived, "Bob's rock must still be alive");
        require(!safe.isOwner(BOB), "and Bob must not have been left holding anything either");
    }

    /**
     * N-1, second door — the one the rebind does not shut.
     *
     * `claimHandover` now writes `rock.smartAccount = att.smartAccount`, which makes the hole
     * *closable*. It does not close it, because the registry never asks whether the account it is
     * told to bind has anything to do with the new owner, and the only signer in this repository
     * never names a different one: `resolveSmartAccount`
     * (`web/src/lib/nfc/rock-resolution.ts` L165-167) returns the rock's **existing** account for
     * every rock in `awake` or `handover_pending`, which on a claim is the giver's Safe. So the
     * rebind is a no-op write of the same address, and the account only becomes the recipient's
     * because the relay route swaps the Safe's owner off chain first.
     *
     * A claimant who does not use that route — self-relaying a captured attestation, which
     * `contracts/README.md` explicitly invites, or a future client-side broadcast — lands in
     * exactly the state N-1 described, with the giver's Safe recorded as the rock's account.
     *
     * THE FIX MUST MAKE TRUE: after a claim, the rock's account cannot be one that answers to the
     * previous owner and not to the new one. On-chain, that is one line in `claimHandover`:
     * `if (!_accountAnswersTo(att.smartAccount, att.subject)) revert ...`, which makes the route's
     * ordering an invariant for every caller instead of a convention for one. (It must be weighed
     * against a Rock Account that has never been deployed: a counterfactual account has no code,
     * so `_accountAnswersTo` is false and such a claim would revert until the account exists.)
     */
    function testReview_N1_aClaimNamingTheGiversAccountMustNotLeaveItInControl() public {
        // Exactly the supported path: a *named* gift to Bob, and a claim attestation carrying the
        // account the verifier actually signs for a rock in `handover_pending` — the rock's own,
        // which is still Alice's Safe. No owner swap has happened; nothing on chain requires one.
        BankRockRegistry.Attestation memory awaken = _att(1, ALICE, address(safe));
        vm.prank(RELAYER);
        registry.awakenRock(ROCK, address(safe), awaken, _sign(awaken));

        vm.prank(ALICE);
        registry.initiateHandover(ROCK, BOB, uint64(block.timestamp + 3600), bytes32(0));

        BankRockRegistry.Attestation memory claim = _att(2, BOB, address(safe));
        vm.prank(RELAYER);
        registry.claimHandover(ROCK, claim, _sign(claim));

        (address rockOwner, address rockAccount,,,,) = registry.getRock(ROCK);
        require(rockOwner == BOB, "precondition: Bob owns the rock");
        require(rockAccount == address(safe), "precondition: the rebind wrote back the giver's Safe");
        require(safe.isOwner(ALICE), "precondition: the Safe is still Alice's");

        address[] memory targets = new address[](3);
        bytes[] memory payloads = new bytes[](3);

        targets[0] = address(safe);
        payloads[0] = abi.encodeWithSelector(GiverSafe.addOwnerWithThreshold.selector, BOB, uint256(1));

        targets[1] = address(registry);
        payloads[1] = abi.encodeWithSelector(BankRockRegistry.archiveRock.selector, ROCK);

        targets[2] = address(safe);
        payloads[2] = abi.encodeWithSelector(GiverSafe.removeOwner.selector, address(0x1), BOB, uint256(1));

        vm.prank(ALICE);
        try safe.execBatch(targets, payloads) {
            require(false, "the giver must not be able to retire the recipient's rock");
        } catch {
            // Expected once fixed: the batched archiveRock reverts NotRockOwner.
        }

        require(_state() != BankRockRegistry.RockState.Archived, "Bob's rock must still be alive");
    }
}
