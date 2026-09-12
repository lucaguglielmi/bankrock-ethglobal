// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * @title BankRockRegistry
 * @notice Identity and lifecycle registry for Bank Rock physical objects.
 *
 * @dev Scope, and what is deliberately absent.
 *
 *  This contract binds a public rock id to (a) the NTAG 424 DNA tag that proves physical
 *  possession of the object and (b) the smart account that actually custodies the rock's
 *  assets. It records who currently owns the object and moves that ownership through an
 *  explicit handover. That is all it does.
 *
 *  It holds no tokens, receives no ERC-20 approvals, and never performs a `call` with
 *  caller-supplied calldata. The previous revision of this contract exposed `executeTrade`
 *  (an arbitrary-call proxy behind an unauthenticated router allowlist) and
 *  `setRouterWhitelist` with no access control. Both are removed rather than guarded:
 *  trading happens from the Rock Account against Aqua, which is where the system
 *  architecture always placed it. Nothing in this contract can move value, so there is
 *  nothing here to steal.
 *
 * @dev Why there is no immediate `transferOwnership(rockId, newOwner)`.
 *
 *  Every change of object ownership goes through `initiateHandover` -> `claimHandover`,
 *  including the case where the current owner already knows the recipient's address. An
 *  owner-initiated instant transfer would produce a second, shorter on-chain shape for the
 *  same real-world event: the provenance history would then contain some transfers that
 *  were proven by a physical tap and some that were not, and a reader could not tell them
 *  apart without inspecting which function was called. Forcing one path keeps the history
 *  uniform — a rock changes hands exactly when someone holding the physical object presents
 *  a fresh attestation for it — and it keeps the security properties uniform too: a
 *  compromised owner key cannot hand the object to an attacker who never held it.
 *
 *  Note that `transferOwnership(address)` inherited from `Ownable` is unrelated: it moves
 *  administration of this contract (pausing and the attester address), never a rock.
 *
 * @dev Archiving.
 *
 *  `archiveRock` is the one-way exit. It retires a rock and releases its tag so the same
 *  physical object can awaken a fresh rock id — the operator rehearsing the awakening beat with
 *  a single tag, without reprogramming it. The archived record stays readable, and the tag's
 *  read counter keeps climbing across the boundary, so nothing about reuse weakens replay
 *  resistance. See `archiveRock` and `lastCounter`.
 *
 * @dev Attestation.
 *
 *  Awakening a rock and claiming a handover both require an EIP-712 attestation signed by
 *  the trusted attester — the server that performs NTAG 424 DNA SDM verification. The
 *  attestation binds the rock id, the tag UID, the tag's read counter, a deadline, and the
 *  `subject`: the wallet that the tap authorises. The registry enforces replay resistance
 *  on-chain: the counter must be strictly greater than the highest counter ever recorded for
 *  that UID, so a URL captured from a genuine tap cannot be replayed against the chain after
 *  the tag has been read again.
 *
 *  `msg.sender` is not an input to either decision. Ownership comes from `att.subject`, which
 *  means the transaction can be submitted by anybody: a gas-sponsored UserOp from the rock's
 *  Safe, or an operator relayer. A user who has just tapped a rock owns no ETH and must not
 *  need any. An attestation is therefore a bearer token, but a narrowly useful one: whoever
 *  relays it, the only address it can ever enrich is the `subject` the attester named, and it
 *  is spent the moment it lands, because the counter it carries is consumed.
 *
 *  Physical possession is never sufficient financial authorization. An attestation gates
 *  claiming the object; it authorizes no spending of any kind.
 *
 *  Known gap, recorded rather than silently accepted: `awakenRock` takes `smartAccount` as a
 *  plain argument, and the attestation does not cover it. An observer who sees a pending
 *  awakening can therefore re-submit the same attestation with a different `smartAccount`,
 *  which would leave the rock owned by the right person but pointing at a Rock Account the
 *  observer controls. Closing it needs either `smartAccount` added to the signed payload, or
 *  `msg.sender == smartAccount` required on awaken (which keeps 4337 sponsorship working, but
 *  rules out a plain operator relayer). The type string is fixed by agreement with the
 *  attestation signer, so the choice is deferred rather than made here.
 */
contract BankRockRegistry is Ownable, Pausable, EIP712 {
    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    /// @notice Lifecycle state of a rock.
    enum RockState {
        /// @dev Never awakened. No owner, no smart account, no UID binding.
        Dormant,
        /// @dev Awakened and owned. No handover outstanding.
        Awake,
        /// @dev Awakened, owned, and a handover is outstanding and not yet expired.
        HandoverPending,
        /// @dev Retired by its owner. Terminal: it can never be awakened, given, or revived.
        ///      Its owner, smart account and UID binding stay readable as history.
        Archived
    }

    /// @notice An outstanding gift handover (Flow E).
    struct Handover {
        /// @dev Named recipient, or `address(0)` for "whoever taps the rock and claims it".
        address recipient;
        /// @dev Unix timestamp after which the handover can no longer be claimed by anyone.
        uint64 expiresAt;
        /// @dev Timestamp the handover was created.
        uint64 initiatedAt;
        /// @dev Owner who created the handover.
        address initiatedBy;
        /// @dev Hash of the off-chain gift message. The message itself is never stored here.
        bytes32 messageHash;
    }

    /// @notice Full record for one rock.
    struct Rock {
        address currentOwner;
        address smartAccount;
        /// @dev `keccak256(rawUid7Bytes)` of the NTAG 424 DNA tag bound at first awakening.
        bytes32 uidHash;
        RockState state;
        /// @dev Informational only (Flow F). Freezes nothing.
        bool lost;
        Handover handover;
    }

    /**
     * @notice A server-signed statement that a genuine tap of the tag bound to `rockId` was
     *         verified, and which wallet that tap authorises.
     * @dev EIP-712 type string, exactly:
     *      `Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject)`
     * @param rockId   The public rock id the attestation is for.
     * @param uidHash  `keccak256(rawUid7Bytes)` — the raw 7-byte NTAG UID, hashed.
     * @param counter  The tag's `SDMReadCtr` for this read. Must strictly exceed the highest
     *                 counter this registry has recorded for `uidHash`, so the first accepted
     *                 attestation for a UID must carry a counter of at least 1.
     * @param deadline Unix timestamp after which the attestation is no longer accepted.
     * @param subject  The wallet this tap authorises: the address that becomes the rock's owner.
     *                 It is named in the signed payload rather than taken from `msg.sender`, so
     *                 the transaction can be submitted by anyone — a sponsored UserOp from the
     *                 rock's Safe, or an operator relayer — without the tapping user needing gas.
     *                 Must not be the zero address.
     */
    struct Attestation {
        uint256 rockId;
        bytes32 uidHash;
        uint32 counter;
        uint256 deadline;
        address subject;
    }

    /// @notice `keccak256("Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject)")`
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject)"
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidRockId();
    error InvalidSmartAccount();
    error InvalidUidHash();
    error InvalidRecipient();
    error InvalidSubject();
    error InvalidHandoverExpiry();
    error InvalidAttester();

    error RockAlreadyAwakened(uint256 rockId);
    error RockNotAwakened(uint256 rockId);
    error RockIsArchived(uint256 rockId);
    error UidBoundToDifferentRock(bytes32 uidHash, uint256 boundRockId);

    error NotRockOwner(address caller, address rockOwner);
    error HandoverNotPending(uint256 rockId);
    error HandoverExpired(uint256 rockId, uint64 expiresAt);
    error NotHandoverRecipient(address subject, address recipient);

    error AttesterNotSet();
    error AttestationRockMismatch(uint256 expected, uint256 provided);
    error AttestationUidMismatch(bytes32 expected, bytes32 provided);
    error AttestationExpired(uint256 deadline);
    error StaleAttestationCounter(uint32 provided, uint32 lastSeen);
    error InvalidAttestationSignature();

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event AttesterUpdated(address indexed previousAttester, address indexed newAttester);

    event RockAwakened(
        uint256 indexed rockId,
        address indexed rockOwner,
        bytes32 indexed uidHash,
        address smartAccount,
        uint32 counter
    );

    event HandoverInitiated(
        uint256 indexed rockId,
        address indexed from,
        address indexed recipient,
        uint64 expiresAt,
        bytes32 messageHash
    );

    event HandoverClaimed(
        uint256 indexed rockId,
        address indexed previousOwner,
        address indexed newOwner,
        uint32 counter
    );

    event HandoverCancelled(uint256 indexed rockId, address indexed by);

    event RockArchived(uint256 indexed rockId, address indexed by, bytes32 indexed uidHash);

    event RockMarkedLost(uint256 indexed rockId, address indexed by);
    event RockLostCleared(uint256 indexed rockId, address indexed by);

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    /// @notice The address whose EIP-712 signature this registry accepts as a tag attestation.
    address public attester;

    mapping(uint256 rockId => Rock) private _rocks;

    /// @dev Highest `SDMReadCtr` ever accepted for a given UID hash.
    mapping(bytes32 uidHash => uint32) private _lastCounter;

    /// @dev UID hash -> the rock id it was bound to at first awakening. 0 means unbound.
    mapping(bytes32 uidHash => uint256) private _uidToRockId;

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /**
     * @param initialOwner Administrator of this contract: may pause, unpause and set the attester.
     * @param initialAttester Address of the attestation signer. May be `address(0)` at deploy
     *        time, in which case `awakenRock` and `claimHandover` revert until `setAttester`
     *        is called.
     */
    constructor(address initialOwner, address initialAttester)
        Ownable(initialOwner)
        EIP712("BankRockRegistry", "1")
    {
        if (initialAttester != address(0)) {
            attester = initialAttester;
            emit AttesterUpdated(address(0), initialAttester);
        }
    }

    // ---------------------------------------------------------------------
    // Administration
    // ---------------------------------------------------------------------

    /// @notice Sets the attestation signer. Only the contract administrator.
    function setAttester(address newAttester) external onlyOwner {
        if (newAttester == address(0)) revert InvalidAttester();
        address previous = attester;
        attester = newAttester;
        emit AttesterUpdated(previous, newAttester);
    }

    /// @notice Halts awakening and handovers. Views, `cancelHandover` and the lost flag stay live.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes awakening and handovers.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /**
     * @notice Awakens a rock: binds it to a tag UID and a smart account, and records
     *         `att.subject` as its first owner.
     * @dev Requires a valid, unexpired, non-replayed attestation signed by `attester`. A rock can
     *      be awakened exactly once, and a UID can be bound to exactly one rock.
     *
     *      `msg.sender` is deliberately irrelevant. Ownership is taken from the signed payload,
     *      so the transaction can be relayed by anyone: a gas-sponsored UserOp from the rock's
     *      Safe, or an operator relayer. The tapping user never needs a funded wallet, which is
     *      the whole point of the sponsored-onboarding decision.
     * @param rockId The public rock id. Must be non-zero.
     * @param smartAccount The Rock Account (ERC-4337 smart account) that custodies this rock's
     *        assets. Recorded here; this registry never calls it.
     * @param att The attestation. `att.rockId` must equal `rockId` and `att.subject` must be
     *        non-zero; `att.subject` becomes the owner.
     * @param sig The attester's EIP-712 signature over `att`.
     */
    function awakenRock(uint256 rockId, address smartAccount, Attestation calldata att, bytes calldata sig)
        external
        whenNotPaused
    {
        if (rockId == 0) revert InvalidRockId();
        if (smartAccount == address(0)) revert InvalidSmartAccount();
        if (att.uidHash == bytes32(0)) revert InvalidUidHash();

        Rock storage r = _rocks[rockId];
        if (r.state == RockState.Archived) revert RockIsArchived(rockId);
        if (r.state != RockState.Dormant) revert RockAlreadyAwakened(rockId);

        uint256 boundRockId = _uidToRockId[att.uidHash];
        if (boundRockId != 0 && boundRockId != rockId) {
            revert UidBoundToDifferentRock(att.uidHash, boundRockId);
        }

        _consumeAttestation(rockId, att.uidHash, att, sig);

        _uidToRockId[att.uidHash] = rockId;
        r.currentOwner = att.subject;
        r.smartAccount = smartAccount;
        r.uidHash = att.uidHash;
        r.state = RockState.Awake;

        emit RockAwakened(rockId, att.subject, att.uidHash, smartAccount, att.counter);
    }

    /**
     * @notice Retires a rock and releases its tag, so the same physical tag can awaken a new
     *         rock id. Only the current owner.
     *
     * @dev Terminal and one-way. An archived rock can never be awakened, given, claimed,
     *      flagged lost, or un-archived; there is deliberately no `unarchive`. Its owner, smart
     *      account and UID binding stay readable through `getRock`, so the object's history does
     *      not disappear when the tag is reused — the record becomes a closed chapter rather
     *      than a blank.
     *
     *      What archiving actually releases is the tag: `rockIdForUid(uidHash)` returns to zero,
     *      which is what lets the next `awakenRock` bind that UID to a *different* rock id. The
     *      practical use is rehearsal — awakening the demo beat repeatedly with one physical tag
     *      without reprogramming it between runs.
     *
     *      `lastCounter(uidHash)` is deliberately NOT reset. Replay protection follows the tag,
     *      not the rock: the tag's read counter only ever goes up, so an attestation captured
     *      before archiving cannot be replayed against the rock that comes after it.
     *
     *      An outstanding handover is cancelled as part of archiving, and emits
     *      `HandoverCancelled` before `RockArchived`, so a reader of the event log sees the
     *      claim path close explicitly rather than inferring it from the archive.
     *
     *      Not gated by `whenNotPaused`. Like `cancelHandover`, archiving only removes ways to
     *      act on a rock; an emergency stop should not be able to trap a tag.
     */
    function archiveRock(uint256 rockId) external {
        Rock storage r = _rocks[rockId];
        if (r.state == RockState.Dormant) revert RockNotAwakened(rockId);
        if (r.state == RockState.Archived) revert RockIsArchived(rockId);
        _requireRockController(r);

        if (r.state == RockState.HandoverPending) {
            delete r.handover;
            emit HandoverCancelled(rockId, msg.sender);
        }

        bytes32 uidHash = r.uidHash;
        delete _uidToRockId[uidHash];
        r.state = RockState.Archived;

        emit RockArchived(rockId, msg.sender, uidHash);
    }

    // ---------------------------------------------------------------------
    // Handover (Flow E)
    // ---------------------------------------------------------------------

    /**
     * @notice Opens a pending handover of the rock. The recipient completes it by tapping the
     *         physical rock and calling `claimHandover`; the giver need not be online for that.
     * @dev Replaces any handover already outstanding for this rock.
     * @param rockId The rock to give away.
     * @param recipient The intended recipient, or `address(0)` to let whoever taps the rock and
     *        presents a fresh attestation claim it.
     * @param expiresAt Unix timestamp after which the handover is dead. Must be in the future.
     *        After it passes the handover is claimable by nobody, including the named recipient.
     * @param messageHash Hash of the gift message shown off-chain, or `bytes32(0)` for none.
     */
    function initiateHandover(uint256 rockId, address recipient, uint64 expiresAt, bytes32 messageHash)
        external
        whenNotPaused
    {
        Rock storage r = _rocks[rockId];
        if (r.state == RockState.Dormant) revert RockNotAwakened(rockId);
        if (r.state == RockState.Archived) revert RockIsArchived(rockId);
        _requireRockController(r);
        if (expiresAt <= block.timestamp) revert InvalidHandoverExpiry();
        if (recipient == r.currentOwner) revert InvalidRecipient();

        r.handover = Handover({
            recipient: recipient,
            expiresAt: expiresAt,
            initiatedAt: uint64(block.timestamp),
            initiatedBy: msg.sender,
            messageHash: messageHash
        });
        r.state = RockState.HandoverPending;

        emit HandoverInitiated(rockId, msg.sender, recipient, expiresAt, messageHash);
    }

    /**
     * @notice Completes a pending handover. `att.subject` becomes the rock's owner.
     * @dev Requires a fresh attestation for the UID this rock was bound to at awakening — proof
     *      that `att.subject` is holding the physical object. The smart account is deliberately
     *      unchanged: the Rock Account address and its assets are stable across ownership
     *      changes, and swapping its signing key happens off-registry.
     *
     *      As with `awakenRock`, `msg.sender` is irrelevant and the transaction may be relayed.
     *      A named recipient is matched against `att.subject`, not against the sender, so the
     *      recipient claims their gift without holding any ETH.
     * @param rockId The rock being claimed.
     * @param att The attestation. `att.rockId` must equal `rockId`, `att.uidHash` must equal the
     *        UID hash bound to the rock, and `att.subject` must be the named recipient when the
     *        handover named one.
     * @param sig The attester's EIP-712 signature over `att`.
     */
    function claimHandover(uint256 rockId, Attestation calldata att, bytes calldata sig)
        external
        whenNotPaused
    {
        Rock storage r = _rocks[rockId];
        if (r.state != RockState.HandoverPending) revert HandoverNotPending(rockId);

        Handover memory h = r.handover;
        if (block.timestamp > h.expiresAt) revert HandoverExpired(rockId, h.expiresAt);
        if (h.recipient != address(0) && att.subject != h.recipient) {
            revert NotHandoverRecipient(att.subject, h.recipient);
        }

        _consumeAttestation(rockId, r.uidHash, att, sig);

        address previousOwner = r.currentOwner;
        r.currentOwner = att.subject;
        r.state = RockState.Awake;
        delete r.handover;

        emit HandoverClaimed(rockId, previousOwner, att.subject, att.counter);
    }

    /**
     * @notice Withdraws a pending handover. Only the current owner.
     * @dev Deliberately callable while paused: cancelling only removes a claim path.
     */
    function cancelHandover(uint256 rockId) external {
        Rock storage r = _rocks[rockId];
        if (r.state != RockState.HandoverPending) revert HandoverNotPending(rockId);
        _requireRockController(r);

        r.state = RockState.Awake;
        delete r.handover;

        emit HandoverCancelled(rockId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Lost flag (Flow F)
    // ---------------------------------------------------------------------

    /**
     * @notice Flags the rock's physical tag as lost or copied.
     * @dev Informational only. It freezes no funds, blocks no handover and gates nothing on-chain;
     *      it exists so that a reader of the registry can see the owner's own statement about the
     *      object. Only the current owner may set it.
     */
    function markLost(uint256 rockId) external {
        Rock storage r = _rocks[rockId];
        if (r.state == RockState.Dormant) revert RockNotAwakened(rockId);
        if (r.state == RockState.Archived) revert RockIsArchived(rockId);
        _requireRockController(r);

        r.lost = true;
        emit RockMarkedLost(rockId, msg.sender);
    }

    /// @notice Clears the lost flag. Only the current owner.
    function clearLost(uint256 rockId) external {
        Rock storage r = _rocks[rockId];
        if (r.state == RockState.Dormant) revert RockNotAwakened(rockId);
        if (r.state == RockState.Archived) revert RockIsArchived(rockId);
        _requireRockController(r);

        r.lost = false;
        emit RockLostCleared(rockId, msg.sender);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /**
     * @notice Reads the full record for a rock.
     * @dev `state` is the *effective* state: a rock whose stored state is `HandoverPending` but
     *      whose handover deadline has passed is reported as `Awake`, because an expired handover
     *      is claimable by nobody. The `handover` struct is returned as stored, so a caller can
     *      still see the expired attempt. `Archived` is terminal and is reported as stored.
     *
     *      An archived rock keeps its owner, smart account and UID hash here as history, even
     *      though its tag may since have awakened a different rock. To ask which rock a tag is
     *      bound to *now*, use `rockIdForUid`.
     * @return rockOwner The owner at the time of the last state change. For an archived rock,
     *         the owner who archived it.
     * @return smartAccount The Rock Account holding this rock's assets.
     * @return uidHash `keccak256(rawUid7Bytes)` of the bound tag, or zero if never awakened.
     * @return state Effective lifecycle state.
     * @return lost The owner's informational lost flag.
     * @return handover The stored handover record.
     */
    function getRock(uint256 rockId)
        external
        view
        returns (
            address rockOwner,
            address smartAccount,
            bytes32 uidHash,
            RockState state,
            bool lost,
            Handover memory handover
        )
    {
        Rock storage r = _rocks[rockId];
        state = r.state;
        if (state == RockState.HandoverPending && block.timestamp > r.handover.expiresAt) {
            state = RockState.Awake;
        }
        return (r.currentOwner, r.smartAccount, r.uidHash, state, r.lost, r.handover);
    }

    /// @notice The highest tag read counter this registry has accepted for a UID hash.
    /// @dev Monotonic for the life of the tag, across archiving and across rocks: it is never
    ///      reset, so an attestation captured before a rock was archived cannot be replayed
    ///      against whatever rock that tag awakens next.
    function lastCounter(bytes32 uidHash) external view returns (uint32) {
        return _lastCounter[uidHash];
    }

    /// @notice The rock id a UID hash is currently bound to, or 0 if the tag has never awakened a
    ///         rock or its rock has since been archived. Archiving releases the tag; it does not
    ///         erase the archived rock, which still reports the UID hash through `getRock`.
    function rockIdForUid(bytes32 uidHash) external view returns (uint256) {
        return _uidToRockId[uidHash];
    }

    /// @notice The EIP-712 domain separator for this deployment.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice The EIP-712 digest an attester must sign for `att`.
    function hashAttestation(Attestation calldata att) external view returns (bytes32) {
        return _hashTypedDataV4(_structHash(att));
    }

    // ---------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------

    /**
     * @dev Owner-gated actions accept either the human owner's wallet or the rock's own Safe.
     *
     *      Under gas sponsorship the call arrives as a UserOp executed *by* the Safe, so
     *      `msg.sender` is the Rock Account rather than the person. Both are the same authority
     *      — the Safe is controlled by the current owner's signing key — and accepting both is
     *      what lets an owner give, cancel, archive or flag a rock without holding any ETH.
     *
     *      There is no zero-address hole here: `smartAccount` is required to be non-zero at
     *      awakening, and every caller of this helper has already rejected the `Dormant` state.
     */
    function _requireRockController(Rock storage r) private view {
        if (msg.sender != r.currentOwner && msg.sender != r.smartAccount) {
            revert NotRockOwner(msg.sender, r.currentOwner);
        }
    }

    function _structHash(Attestation calldata att) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH, att.rockId, att.uidHash, att.counter, att.deadline, att.subject
            )
        );
    }

    /**
     * @dev Validates an attestation against `expectedRockId` / `expectedUidHash` and records its
     *      counter, so the same tag read can never be used twice.
     */
    function _consumeAttestation(
        uint256 expectedRockId,
        bytes32 expectedUidHash,
        Attestation calldata att,
        bytes calldata sig
    ) private {
        address signer = attester;
        if (signer == address(0)) revert AttesterNotSet();
        if (att.rockId != expectedRockId) revert AttestationRockMismatch(expectedRockId, att.rockId);
        if (att.uidHash != expectedUidHash) revert AttestationUidMismatch(expectedUidHash, att.uidHash);
        if (att.deadline < block.timestamp) revert AttestationExpired(att.deadline);
        if (att.subject == address(0)) revert InvalidSubject();

        uint32 seen = _lastCounter[att.uidHash];
        if (att.counter <= seen) revert StaleAttestationCounter(att.counter, seen);

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_structHash(att)), sig);
        if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidAttestationSignature();

        _lastCounter[att.uidHash] = att.counter;
    }
}
