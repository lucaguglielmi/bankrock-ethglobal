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
 * @dev Attestation.
 *
 *  Awakening a rock and claiming a handover both require an EIP-712 attestation signed by
 *  the trusted attester — the server that performs NTAG 424 DNA SDM verification. The
 *  attestation binds the rock id, the tag UID, the tag's read counter and a deadline. The
 *  registry enforces replay resistance on-chain: the counter must be strictly greater than
 *  the highest counter ever recorded for that UID, so a URL captured from a genuine tap
 *  cannot be replayed against the chain after the tag has been read again.
 *
 *  Physical possession is never sufficient financial authorization. An attestation gates
 *  claiming the object; it authorizes no spending of any kind.
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
        HandoverPending
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
     *         verified.
     * @dev EIP-712 type string, exactly:
     *      `Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline)`
     * @param rockId   The public rock id the attestation is for.
     * @param uidHash  `keccak256(rawUid7Bytes)` — the raw 7-byte NTAG UID, hashed.
     * @param counter  The tag's `SDMReadCtr` for this read. Must strictly exceed the highest
     *                 counter this registry has recorded for `uidHash`, so the first accepted
     *                 attestation for a UID must carry a counter of at least 1.
     * @param deadline Unix timestamp after which the attestation is no longer accepted.
     */
    struct Attestation {
        uint256 rockId;
        bytes32 uidHash;
        uint32 counter;
        uint256 deadline;
    }

    /// @notice `keccak256("Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline)")`
    bytes32 public constant ATTESTATION_TYPEHASH =
        keccak256("Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline)");

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error InvalidRockId();
    error InvalidSmartAccount();
    error InvalidUidHash();
    error InvalidRecipient();
    error InvalidHandoverExpiry();
    error InvalidAttester();

    error RockAlreadyAwakened(uint256 rockId);
    error RockNotAwakened(uint256 rockId);
    error UidBoundToDifferentRock(bytes32 uidHash, uint256 boundRockId);

    error NotRockOwner(address caller, address rockOwner);
    error HandoverNotPending(uint256 rockId);
    error HandoverExpired(uint256 rockId, uint64 expiresAt);
    error NotHandoverRecipient(address caller, address recipient);

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
     * @notice Awakens a rock: binds it to a tag UID and a smart account, and records the caller
     *         as its first owner.
     * @dev Requires a valid, unexpired, non-replayed attestation signed by `attester`. A rock can
     *      be awakened exactly once, and a UID can be bound to exactly one rock.
     * @param rockId The public rock id. Must be non-zero.
     * @param smartAccount The Rock Account (ERC-4337 smart account) that custodies this rock's
     *        assets. Recorded here; this registry never calls it.
     * @param att The attestation. `att.rockId` must equal `rockId`.
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
        if (r.state != RockState.Dormant) revert RockAlreadyAwakened(rockId);

        uint256 boundRockId = _uidToRockId[att.uidHash];
        if (boundRockId != 0 && boundRockId != rockId) {
            revert UidBoundToDifferentRock(att.uidHash, boundRockId);
        }

        _consumeAttestation(rockId, att.uidHash, att, sig);

        _uidToRockId[att.uidHash] = rockId;
        r.currentOwner = msg.sender;
        r.smartAccount = smartAccount;
        r.uidHash = att.uidHash;
        r.state = RockState.Awake;

        emit RockAwakened(rockId, msg.sender, att.uidHash, smartAccount, att.counter);
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
        if (msg.sender != r.currentOwner) revert NotRockOwner(msg.sender, r.currentOwner);
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
     * @notice Completes a pending handover. The caller becomes the rock's owner.
     * @dev Requires a fresh attestation for the UID this rock was bound to at awakening — proof
     *      that the caller is holding the physical object. The smart account is deliberately
     *      unchanged: the Rock Account address and its assets are stable across ownership
     *      changes, and swapping its signing key happens off-registry.
     * @param rockId The rock being claimed.
     * @param att The attestation. `att.rockId` must equal `rockId` and `att.uidHash` must equal
     *        the UID hash bound to the rock.
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
        if (h.recipient != address(0) && msg.sender != h.recipient) {
            revert NotHandoverRecipient(msg.sender, h.recipient);
        }

        _consumeAttestation(rockId, r.uidHash, att, sig);

        address previousOwner = r.currentOwner;
        r.currentOwner = msg.sender;
        r.state = RockState.Awake;
        delete r.handover;

        emit HandoverClaimed(rockId, previousOwner, msg.sender, att.counter);
    }

    /**
     * @notice Withdraws a pending handover. Only the current owner.
     * @dev Deliberately callable while paused: cancelling only removes a claim path.
     */
    function cancelHandover(uint256 rockId) external {
        Rock storage r = _rocks[rockId];
        if (r.state != RockState.HandoverPending) revert HandoverNotPending(rockId);
        if (msg.sender != r.currentOwner) revert NotRockOwner(msg.sender, r.currentOwner);

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
        if (msg.sender != r.currentOwner) revert NotRockOwner(msg.sender, r.currentOwner);

        r.lost = true;
        emit RockMarkedLost(rockId, msg.sender);
    }

    /// @notice Clears the lost flag. Only the current owner.
    function clearLost(uint256 rockId) external {
        Rock storage r = _rocks[rockId];
        if (r.state == RockState.Dormant) revert RockNotAwakened(rockId);
        if (msg.sender != r.currentOwner) revert NotRockOwner(msg.sender, r.currentOwner);

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
     *      still see the expired attempt.
     * @return rockOwner The current owner of the object.
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
    function lastCounter(bytes32 uidHash) external view returns (uint32) {
        return _lastCounter[uidHash];
    }

    /// @notice The rock id a UID hash is bound to, or 0 if the tag has never awakened a rock.
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

    function _structHash(Attestation calldata att) private pure returns (bytes32) {
        return keccak256(abi.encode(ATTESTATION_TYPEHASH, att.rockId, att.uidHash, att.counter, att.deadline));
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

        uint32 seen = _lastCounter[att.uidHash];
        if (att.counter <= seen) revert StaleAttestationCounter(att.counter, seen);

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_structHash(att)), sig);
        if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidAttestationSignature();

        _lastCounter[att.uidHash] = att.counter;
    }
}
