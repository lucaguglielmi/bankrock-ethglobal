// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import {ISafeOwnerManager} from "./interfaces/ISafeOwnerManager.sol";

/**
 * @title BankRockRegistry
 * @author Bank Rock
 *
 * @notice The public record of who owns which Bank Rock. A rock is a physical object carrying an
 *         NFC tag; this contract binds that tag to a rock id, records the wallet that owns the
 *         object and the smart account ("Rock Account") that holds its money, and moves ownership
 *         to the next person when they tap the rock and claim it.
 * @notice This contract never holds tokens, never receives a token approval, and has no function
 *         that can move money — not for its administrator, not for anyone. Losing every key in the
 *         project cannot take a coin out of it, because none is ever in it.
 * @notice Who may call what. Anyone may relay `awakenRock` and `claimHandover`: those are
 *         authorised by the attester's signature, not by the sender, so a person who has just
 *         tapped a rock needs no ETH. Only the rock's owner — or its Rock Account, for as long as
 *         that account still answers to the owner — may give, cancel, retire or flag a rock. Only
 *         the contract administrator may rotate the attester or pause.
 *
 * @dev State machine. `getRock` reports the state as an integer, `describeRock` as a word.
 *
 *      | From            | Call                                   | To                |
 *      | --------------- | -------------------------------------- | ----------------- |
 *      | Dormant         | `awakenRock`                           | Awake             |
 *      | Awake           | `initiateHandover`                     | HandoverPending   |
 *      | HandoverPending | `initiateHandover` (replaces the gift)  | HandoverPending   |
 *      | HandoverPending | `claimHandover`                        | Awake, new owner  |
 *      | HandoverPending | `cancelHandover`                       | Awake             |
 *      | HandoverPending | expiry — no call, nothing written       | reported as Awake |
 *      | Awake           | `archiveRock`                          | Archived          |
 *      | HandoverPending | `archiveRock` (cancels the gift first)  | Archived          |
 *
 *      Every other transition reverts, and each has a test: `Dormant` accepts nothing but
 *      `awakenRock`; `Archived` accepts nothing at all; a rock can be awakened once; one tag backs
 *      one live rock; an expired gift is claimable by nobody; a gift named for someone else cannot
 *      be claimed by a third party.
 *
 * @dev Attestation. `awakenRock` and `claimHandover` require an EIP-712 attestation signed by
 *      `attester()` — the server that performs NTAG 424 DNA SDM verification off-chain. It names
 *      the rock, the tag, the tag's read counter, a deadline, the wallet the tap authorises
 *      (`subject`) and, for an awakening, the Rock Account to bind.
 *
 *      `msg.sender` is not an input to either decision, so the transaction can be relayed: as a
 *      gas-sponsored UserOp from the rock's Safe, or by an operator relayer. An attestation is
 *      therefore a bearer token, but a narrow one — whoever relays it, the only address it can
 *      enrich is the `subject` the attester named, and the only Rock Account it can bind is the
 *      one it names.
 *
 *      Replay resistance is enforced here, not merely off-chain: the counter must strictly exceed
 *      the highest counter this contract has accepted for that tag. Note precisely what that does:
 *      the on-chain counter advances when an attestation is *consumed*, not when the tag is read,
 *      so an outstanding attestation is killed by the next successful call for that tag rather
 *      than by the next tap. `MAX_ATTESTATION_LIFETIME` bounds how long one may sit unspent.
 *
 * @dev Timestamps are unix seconds and every deadline is inclusive: a gift can be claimed in the
 *      block whose timestamp equals `expiresAt`, and an attestation is valid in the block whose
 *      timestamp equals its `deadline`. Every window here is minutes or days wide, so the ±15 s a
 *      proposer can move `block.timestamp` changes no outcome.
 *
 * @dev Physical possession is never sufficient financial authorization. An attestation gates
 *      claiming the object; it authorises no spending of any kind. Threat model: spec 15 Part 5,
 *      and `specs/19-contract-review-and-hardening.md` Part 1.1.
 *
 * @custom:security-contact security@bank-rock.com
 */
contract BankRockRegistry is Ownable2Step, Pausable, EIP712 {
    /* --------------------------------------------------------------------- */
    /*  Types                                                                 */
    /* --------------------------------------------------------------------- */

    /**
     * @notice The lifecycle state of a rock. Etherscan shows the integer, so read it as:
     *         `0 = Dormant`, `1 = Awake`, `2 = HandoverPending`, `3 = Archived`.
     *         `describeRock` returns the same thing as a word.
     */
    enum RockState {
        /// @notice `0` — never awakened: no owner, no Rock Account, no tag binding.
        Dormant,
        /// @notice `1` — awakened and owned, with no gift outstanding.
        Awake,
        /// @notice `2` — awakened and owned, with a gift outstanding that has not expired.
        HandoverPending,
        /// @notice `3` — retired by its owner. Terminal: never awakened, given or revived again.
        Archived
    }

    /**
     * @notice An outstanding gift: the standing offer to hand a rock to its next owner.
     * @dev `Handover` is part of this contract's ABI — `getRock` returns it by value — so it will
     *      not gain fields. Adding one would change that return type and silently break every
     *      existing decoder at once: the web chain library, the MCP server's copy, and any
     *      Etherscan bookmark. A future field goes in a new view, not in this struct.
     */
    struct Handover {
        /// @notice The named recipient, or the zero address for "whoever taps the rock next".
        address recipient;
        /// @notice Unix seconds. The last second at which the gift can be claimed, inclusive.
        uint64 expiresAt;
        /// @notice Unix seconds. When the gift was opened.
        uint64 initiatedAt;
        /// @notice The owner who opened the gift.
        address initiatedBy;
        /// @notice Hash of the off-chain gift message, or zero. The message is never stored here.
        bytes32 messageHash;
    }

    /**
     * @notice Everything this contract records about one rock.
     * @dev Field order is chosen so that `currentOwner`, `state` and `lost` share one storage
     *      slot. It is a private struct — `getRock` returns its fields individually — so the
     *      order is not part of this contract's ABI and can change freely.
     */
    struct Rock {
        /// @notice The wallet that owns the physical object.
        address currentOwner;
        /// @notice Lifecycle state; see `RockState`.
        RockState state;
        /// @notice The owner's own "the tag is lost" flag. Informational: it freezes nothing.
        bool lost;
        /// @notice The Rock Account holding this rock's tokens. Recorded, never called except to
        ///         ask it `isOwner`.
        address smartAccount;
        /// @notice `keccak256(rawUid7Bytes)` of the NFC tag bound at the first awakening.
        bytes32 uidHash;
        /// @notice The outstanding gift, if any. Zeroed whenever no gift is outstanding.
        Handover handover;
    }

    /**
     * @notice The attester's signed statement that a genuine tap of a rock's tag was verified,
     *         and which wallet that tap authorises. Etherscan cannot produce one of these: it
     *         comes from the Bank Rock verifier after a real tap. See `contracts/README.md`.
     * @dev EIP-712 type string, exactly:
     *      `Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)`
     */
    struct Attestation {
        /// @notice The public rock id this attestation is for.
        uint256 rockId;
        /// @notice `keccak256(rawUid7Bytes)` — the raw 7-byte NFC tag UID, hashed.
        bytes32 uidHash;
        /// @notice The tag's `SDMReadCtr` for this read. Must strictly exceed the highest counter
        ///         this registry has accepted for `uidHash`, so the first one must be at least 1.
        ///         Monotonic per tag for the life of the registry; a `uint32` cannot be exhausted
        ///         by a physical tag, which is read at most a few times a minute.
        uint32 counter;
        /// @notice Unix seconds, inclusive. Must be in the future and at most
        ///         `MAX_ATTESTATION_LIFETIME` ahead of the block that consumes it.
        uint256 deadline;
        /// @notice The wallet this tap authorises: the address that becomes the rock's owner.
        ///         Named in the signed payload rather than taken from `msg.sender`, so the call
        ///         can be relayed. Must not be the zero address.
        address subject;
        /// @notice The Rock Account this attestation binds to the rock — on both attested paths.
        ///         Covering it in the signature is what stops a front-runner re-submitting a
        ///         captured attestation with an account of their own. Must not be the zero
        ///         address. On a claim it *replaces* the rock's existing account, so the attester
        ///         chooses: the rock's current account when the claimant is about to become a
        ///         signing owner of it, otherwise the claimant's own account.
        address smartAccount;
    }

    /* --------------------------------------------------------------------- */
    /*  Constants                                                             */
    /* --------------------------------------------------------------------- */

    /// @notice The EIP-712 type hash of `Attestation`. Useful for reproducing a digest by hand.
    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,"
        "address subject,address smartAccount)"
    );

    /**
     * @notice The longest an attestation may stay valid: 15 minutes.
     * @dev The off-chain signer already uses a short TTL, but a policy in TypeScript is not an
     *      invariant. Enforcing the ceiling here means a signer bug — a millisecond clock, a hand
     *      -signed payload, a second implementation — cannot mint a bearer token good for years.
     *      The window has to cover a real tap-to-confirm: verify, build the UserOp, wait for a
     *      bundler. Fifteen minutes is generous for that and short enough that a captured
     *      attestation is worthless by the time anyone notices it.
     */
    uint256 public constant MAX_ATTESTATION_LIFETIME = 15 minutes;

    /**
     * @notice The longest a gift may stay claimable: 90 days.
     * @dev An unbounded gift is a standing offer of the physical object to whoever next taps it,
     *      years later, with the rock stuck in `HandoverPending` and the owner relying on memory
     *      to cancel it. Ninety days covers posting a rock anywhere in the world and forgetting
     *      about it twice; past that, the owner opens a new gift.
     */
    uint64 public constant MAX_HANDOVER_DURATION = 90 days;

    /* --------------------------------------------------------------------- */
    /*  Storage                                                               */
    /* --------------------------------------------------------------------- */

    /// @notice The address whose EIP-712 signature this registry accepts as a tag attestation.
    address public attester;

    /// @notice Every rock, by id. Read it through `getRock` or `describeRock`.
    mapping(uint256 rockId => Rock rock) private _rocks;

    /// @notice The highest tag read counter ever accepted for a tag, by `uidHash`.
    mapping(bytes32 uidHash => uint32 counter) private _lastCounter;

    /// @notice The rock a tag currently backs, by `uidHash`. Zero means unbound.
    mapping(bytes32 uidHash => uint256 rockId) private _uidToRockId;

    /* --------------------------------------------------------------------- */
    /*  Events                                                                */
    /* --------------------------------------------------------------------- */

    /**
     * @notice The attestation signer changed.
     * @param previousAttester The signer that was trusted until this call. Zero at first setting.
     * @param newAttester The signer trusted from now on.
     */
    event AttesterUpdated(address indexed previousAttester, address indexed newAttester);

    /**
     * @notice A rock was awakened: a tag, an owner and a Rock Account are now bound to a rock id.
     * @param rockId The rock that woke up.
     * @param rockOwner The wallet that now owns it — the attestation's subject, not the sender.
     * @param uidHash The tag bound to it, hashed.
     * @param smartAccount The Rock Account that holds its tokens.
     * @param counter The tag read counter consumed by this awakening.
     */
    event RockAwakened(
        uint256 indexed rockId,
        address indexed rockOwner,
        bytes32 indexed uidHash,
        address smartAccount,
        uint32 counter
    );

    /**
     * @notice A gift was opened: the rock is now claimable by its recipient until `expiresAt`.
     * @param rockId The rock being given away.
     * @param from The owner opening the gift.
     * @param recipient The named recipient, or the zero address for "whoever taps it next".
     * @param expiresAt Unix seconds, inclusive: the last second at which it can be claimed.
     * @param messageHash Hash of the off-chain gift message, or zero.
     */
    event HandoverInitiated(
        uint256 indexed rockId,
        address indexed from,
        address indexed recipient,
        uint64 expiresAt,
        bytes32 messageHash
    );

    /**
     * @notice A gift was claimed: the rock changed hands.
     * @param rockId The rock that changed hands.
     * @param previousOwner Who owned it until this call.
     * @param newOwner Who owns it now — the attestation's subject, not the sender.
     * @param smartAccount The Rock Account bound by this claim. It replaces the one the rock
     *        carried before, so authority over a rock never outlives ownership of it.
     * @param counter The tag read counter consumed by this claim.
     */
    event HandoverClaimed(
        uint256 indexed rockId,
        address indexed previousOwner,
        address indexed newOwner,
        address smartAccount,
        uint32 counter
    );

    /**
     * @notice A gift was withdrawn and can no longer be claimed.
     * @dev Also emitted, before the new gift, when `initiateHandover` replaces an outstanding one,
     *      and before `RockArchived` when retiring a rock closes an outstanding gift — so the
     *      event log alone always shows a claim path closing.
     * @param rockId The rock whose gift was withdrawn.
     * @param by The owner or Rock Account that withdrew it.
     */
    event HandoverCancelled(uint256 indexed rockId, address indexed by);

    /**
     * @notice A rock was retired. Terminal, and its tag is released for a new rock id.
     * @param rockId The rock that was retired.
     * @param by The owner or Rock Account that retired it.
     * @param uidHash The tag that is now free to back a different rock.
     */
    event RockArchived(uint256 indexed rockId, address indexed by, bytes32 indexed uidHash);

    /**
     * @notice The owner flagged the physical tag as lost or copied. Informational only.
     * @param rockId The rock flagged.
     * @param by The owner or Rock Account that flagged it.
     */
    event RockMarkedLost(uint256 indexed rockId, address indexed by);

    /**
     * @notice The owner cleared the lost flag.
     * @param rockId The rock whose flag was cleared.
     * @param by The owner or Rock Account that cleared it.
     */
    event RockLostCleared(uint256 indexed rockId, address indexed by);

    /* --------------------------------------------------------------------- */
    /*  Errors                                                                */
    /* --------------------------------------------------------------------- */

    /// @notice Rock id `0` is reserved as "no rock" and can never be awakened.
    error InvalidRockId();

    /// @notice A Rock Account must be a real address.
    /// @param smartAccount The address that was supplied.
    error InvalidSmartAccount(address smartAccount);

    /// @notice A tag hash must be a real hash.
    /// @param uidHash The value that was supplied.
    error InvalidUidHash(bytes32 uidHash);

    /// @notice The attestation names nobody to give the rock to.
    /// @param subject The address that was supplied.
    error InvalidSubject(address subject);

    /// @notice A gift to the current owner would change nothing.
    /// @param recipient The address that was supplied, which already owns this rock.
    error RecipientIsAlreadyTheOwner(address recipient);

    /// @notice A gift must expire in the future.
    /// @param expiresAt The expiry that was supplied, in unix seconds.
    /// @param nowTimestamp The block timestamp it was compared against.
    error InvalidHandoverExpiry(uint64 expiresAt, uint64 nowTimestamp);

    /// @notice A gift may not stay claimable for longer than `MAX_HANDOVER_DURATION`.
    /// @param expiresAt The expiry that was supplied, in unix seconds.
    /// @param maxExpiresAt The latest expiry this block would accept.
    error HandoverTooLong(uint64 expiresAt, uint64 maxExpiresAt);

    /// @notice The registry must always have an attestation signer, so it cannot be set to zero.
    error AttesterCannotBeZero();

    /// @notice This rock has already been awakened.
    /// @param rockId The rock in question.
    error RockAlreadyAwakened(uint256 rockId);

    /// @notice This rock has never been awakened, so there is nothing to act on.
    /// @param rockId The rock in question.
    error RockNotAwakened(uint256 rockId);

    /// @notice This rock was retired. Retirement is permanent and nothing can be done to it.
    /// @param rockId The rock in question.
    error RockIsArchived(uint256 rockId);

    /// @notice This tag already backs a different live rock. Retire that one first.
    /// @param uidHash The tag in question.
    /// @param boundRockId The rock it currently backs.
    error UidBoundToDifferentRock(bytes32 uidHash, uint256 boundRockId);

    /// @notice Only the rock's owner, or a Rock Account that still answers to the owner, may do
    ///         this.
    /// @param rockId The rock in question.
    /// @param caller The address that tried.
    /// @param rockOwner The rock's current owner.
    /// @param smartAccount The rock's recorded Rock Account.
    error NotRockOwner(uint256 rockId, address caller, address rockOwner, address smartAccount);

    /// @notice There is no gift outstanding on this rock.
    /// @param rockId The rock in question.
    error HandoverNotPending(uint256 rockId);

    /// @notice The gift's expiry has passed; it is claimable by nobody.
    /// @param rockId The rock in question.
    /// @param expiresAt The gift's expiry, in unix seconds.
    /// @param nowTimestamp The block timestamp it was compared against.
    error HandoverExpired(uint256 rockId, uint64 expiresAt, uint64 nowTimestamp);

    /// @notice This gift is reserved for a named recipient, and the attestation names someone else.
    /// @param subject The wallet the attestation authorised.
    /// @param recipient The wallet the gift was reserved for.
    error NotHandoverRecipient(address subject, address recipient);

    /// @notice No attestation signer is configured, so no attested action can be verified.
    error AttesterNotSet();

    /// @notice The attestation was issued for a different rock.
    /// @param expected The rock being acted on.
    /// @param provided The rock the attestation names.
    error AttestationRockMismatch(uint256 expected, uint256 provided);

    /// @notice The attestation was issued for a different tag.
    /// @param expected The tag bound to this rock.
    /// @param provided The tag the attestation names.
    error AttestationUidMismatch(bytes32 expected, bytes32 provided);

    /// @notice The attestation authorises a different Rock Account from the one supplied.
    /// @param expected The Rock Account the attestation names.
    /// @param provided The Rock Account supplied to the call.
    error AttestationSmartAccountMismatch(address expected, address provided);

    /// @notice The attestation's deadline has passed. Tap the rock again for a fresh one.
    /// @param deadline The attestation's deadline, in unix seconds.
    /// @param nowTimestamp The block timestamp it was compared against.
    error AttestationExpired(uint256 deadline, uint256 nowTimestamp);

    /// @notice The attestation is valid for longer than `MAX_ATTESTATION_LIFETIME` allows.
    /// @param deadline The attestation's deadline, in unix seconds.
    /// @param maxDeadline The latest deadline this block would accept.
    error AttestationLifetimeTooLong(uint256 deadline, uint256 maxDeadline);

    /// @notice This tag read was already used, or is older than one that was. Tap again.
    /// @param provided The counter the attestation carries.
    /// @param lastSeen The highest counter already accepted for this tag.
    error StaleAttestationCounter(uint32 provided, uint32 lastSeen);

    /// @notice The signature does not come from the configured attestation signer.
    error InvalidAttestationSignature();

    /// @notice This registry must always have an administrator: the attester has to stay
    ///         rotatable, or every future tap becomes unusable. Use `transferOwnership` and
    ///         `acceptOwnership` instead.
    error OwnershipCannotBeRenounced();

    /* --------------------------------------------------------------------- */
    /*  Constructor                                                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Deploys the registry.
     * @param initialOwner The administrator: may rotate the attester, pause and unpause. Ownership
     *        moves in two steps thereafter, and cannot be renounced.
     * @param initialAttester The attestation signer. May be the zero address at deployment, in
     *        which case every attested action reverts `AttesterNotSet` until `setAttester` is
     *        called — a deploy script should never leave it that way.
     */
    constructor(address initialOwner, address initialAttester) Ownable(initialOwner) EIP712("BankRockRegistry", "1") {
        if (initialAttester != address(0)) {
            attester = initialAttester;
            emit AttesterUpdated(address(0), initialAttester);
        }
    }

    /* --------------------------------------------------------------------- */
    /*  Attested actions — anyone may relay these                             */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Wake a rock up: bind it to a tag and a Rock Account, and give it to the wallet the
     *         attestation names. Anyone may send this transaction; only the attestation decides
     *         who ends up owning the rock and which account holds its money. A rock can be
     *         awakened once, and a tag backs one live rock at a time. Emits `RockAwakened`.
     * @param rockId The public rock id. Must not be zero.
     * @param smartAccount The Rock Account that will hold this rock's tokens. Must equal
     *        `att.smartAccount`, and must not be zero.
     * @param att The attestation from the Bank Rock verifier. Etherscan cannot produce one.
     * @param sig The attester's EIP-712 signature over `att`, 65 bytes.
     */
    function awakenRock(uint256 rockId, address smartAccount, Attestation calldata att, bytes calldata sig)
        external
        whenNotPaused
    {
        if (rockId == 0) revert InvalidRockId();
        if (smartAccount == address(0)) revert InvalidSmartAccount(smartAccount);
        if (att.smartAccount != smartAccount) revert AttestationSmartAccountMismatch(att.smartAccount, smartAccount);
        if (att.uidHash == bytes32(0)) revert InvalidUidHash(att.uidHash);

        Rock storage rock = _rocks[rockId];
        if (rock.state == RockState.Archived) revert RockIsArchived(rockId);
        if (rock.state != RockState.Dormant) revert RockAlreadyAwakened(rockId);

        uint256 boundRockId = _uidToRockId[att.uidHash];
        if (boundRockId != 0 && boundRockId != rockId) revert UidBoundToDifferentRock(att.uidHash, boundRockId);

        _consumeAttestation(rockId, att.uidHash, att, sig);

        _uidToRockId[att.uidHash] = rockId;
        rock.currentOwner = att.subject;
        rock.smartAccount = smartAccount;
        rock.uidHash = att.uidHash;
        rock.state = RockState.Awake;

        emit RockAwakened(rockId, att.subject, att.uidHash, smartAccount, att.counter);
    }

    /**
     * @notice Collect a rock that was given to you: the wallet the attestation names becomes the
     *         new owner, and the account the attestation names becomes the rock's Rock Account.
     *         Anyone may send this transaction, so a recipient with no ETH can still receive a
     *         rock. Requires a fresh tap of that rock's own tag, before the gift's expiry, and —
     *         if the gift named a recipient — an attestation for that recipient. Emits
     *         `HandoverClaimed`.
     * @dev The Rock Account is rebound here, and that is the whole point.
     *
     *      Leaving it alone was the original design, on the reasoning that the account address and
     *      its assets should be stable across a change of owner. The re-review of 2026-09-12
     *      showed what that costs: the account recorded at awakening stayed a *controller* of the
     *      rock, and it belonged to the giver. Asking it `isOwner(currentOwner)` is not enough,
     *      because a Safe's owner set is writable by the Safe — the giver can make the answer
     *      `true` for one transaction, retire the recipient's rock, and put it back.
     *
     *      So the authority follows the object. Whichever account the attester names becomes the
     *      rock's account, and the giver's Safe is no longer connected to the rock at all.
     *
     *      That places a real decision with the attester, the verifier that signs after a tap. It
     *      names the rock's *existing* account when the claimant is about to become a signing
     *      owner of it — the named-gift path, where the owner swap is pre-signed and does land, so
     *      the rock's money stays where it is — and the claimant's *own* account otherwise, which
     *      is the open-gift path, where no swap can be pre-signed. The registry does not and
     *      cannot make that choice; it records what it is told and refuses the zero address, so a
     *      rock is never left with no account at all.
     * @param rockId The rock being claimed.
     * @param att The attestation from the Bank Rock verifier. `att.subject` becomes the owner and
     *        `att.smartAccount` becomes the Rock Account; neither may be the zero address.
     * @param sig The attester's EIP-712 signature over `att`, 65 bytes.
     */
    function claimHandover(uint256 rockId, Attestation calldata att, bytes calldata sig) external whenNotPaused {
        Rock storage rock = _rocks[rockId];
        if (rock.state != RockState.HandoverPending) revert HandoverNotPending(rockId);

        Handover memory gift = rock.handover;
        if (block.timestamp > gift.expiresAt) {
            revert HandoverExpired(rockId, gift.expiresAt, uint64(block.timestamp));
        }
        if (gift.recipient != address(0) && att.subject != gift.recipient) {
            revert NotHandoverRecipient(att.subject, gift.recipient);
        }

        if (att.smartAccount == address(0)) revert InvalidSmartAccount(att.smartAccount);

        _consumeAttestation(rockId, rock.uidHash, att, sig);

        address previousOwner = rock.currentOwner;
        rock.currentOwner = att.subject;
        rock.smartAccount = att.smartAccount;
        rock.state = RockState.Awake;
        delete rock.handover;

        emit HandoverClaimed(rockId, previousOwner, att.subject, att.smartAccount, att.counter);
    }

    /* --------------------------------------------------------------------- */
    /*  Rock-owner actions                                                    */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Give this rock away. The recipient collects it by tapping the physical rock and
     *         calling `claimHandover`; you do not need to be online for that. Callable by the
     *         rock's owner, or by its Rock Account while you are still an owner of that account.
     *         Opening a gift while one is already outstanding replaces it, and emits
     *         `HandoverCancelled` for the old one first. Emits `HandoverInitiated`.
     * @param rockId The rock to give away.
     * @param recipient The wallet allowed to claim it, or the zero address to let whoever taps
     *        the rock claim it. May not be the current owner.
     * @param expiresAt Unix seconds, inclusive: the last second at which it can be claimed. Must
     *        be in the future and at most `MAX_HANDOVER_DURATION` from now.
     * @param messageHash Hash of your gift message, or zero. The message stays off-chain.
     */
    function initiateHandover(uint256 rockId, address recipient, uint64 expiresAt, bytes32 messageHash)
        external
        whenNotPaused
    {
        Rock storage rock = _rocks[rockId];
        _requireLiveRock(rockId, rock);
        _requireRockController(rockId, rock);

        if (expiresAt <= block.timestamp) revert InvalidHandoverExpiry(expiresAt, uint64(block.timestamp));
        uint64 maxExpiresAt = uint64(block.timestamp) + MAX_HANDOVER_DURATION;
        if (expiresAt > maxExpiresAt) revert HandoverTooLong(expiresAt, maxExpiresAt);
        if (recipient == rock.currentOwner) revert RecipientIsAlreadyTheOwner(recipient);

        // Replacing a gift is a cancellation followed by a new gift, and the log says so.
        if (rock.state == RockState.HandoverPending) emit HandoverCancelled(rockId, msg.sender);

        rock.handover = Handover({
            recipient: recipient,
            expiresAt: expiresAt,
            initiatedAt: uint64(block.timestamp),
            initiatedBy: msg.sender,
            messageHash: messageHash
        });
        rock.state = RockState.HandoverPending;

        emit HandoverInitiated(rockId, msg.sender, recipient, expiresAt, messageHash);
    }

    /**
     * @notice Take back a gift you opened, so it can no longer be claimed. Callable by the rock's
     *         owner, or by its Rock Account while you are still an owner of that account.
     *         Deliberately still available while the registry is paused: cancelling only removes
     *         a way to act on the rock. Emits `HandoverCancelled`.
     * @param rockId The rock whose gift you are taking back.
     */
    function cancelHandover(uint256 rockId) external {
        Rock storage rock = _rocks[rockId];
        if (rock.state != RockState.HandoverPending) revert HandoverNotPending(rockId);
        _requireRockController(rockId, rock);

        rock.state = RockState.Awake;
        delete rock.handover;

        emit HandoverCancelled(rockId, msg.sender);
    }

    /**
     * @notice Retire this rock permanently and free its tag, so the same physical rock can be
     *         awakened again under a new rock id. Callable by the rock's owner, or by its Rock
     *         Account while you are still an owner of that account. **There is no undo**: a
     *         retired rock can never be awakened, given, claimed, flagged or revived. Any
     *         outstanding gift is cancelled first. Available while paused, for the same reason as
     *         `cancelHandover`. Emits `HandoverCancelled` (if a gift was open) then `RockArchived`.
     * @dev The record stays readable through `getRock` as history — owner, Rock Account and tag
     *      binding are preserved. What is released is `rockIdForUid`, so the tag may back a new
     *      rock. `lastCounter` is deliberately *not* reset: replay protection follows the tag, not
     *      the rock, so an attestation captured before retirement cannot be replayed against
     *      whatever rock that tag awakens next.
     * @param rockId The rock to retire.
     */
    function archiveRock(uint256 rockId) external {
        Rock storage rock = _rocks[rockId];
        _requireLiveRock(rockId, rock);
        _requireRockController(rockId, rock);

        if (rock.state == RockState.HandoverPending) {
            delete rock.handover;
            emit HandoverCancelled(rockId, msg.sender);
        }

        bytes32 uidHash = rock.uidHash;
        delete _uidToRockId[uidHash];
        rock.state = RockState.Archived;

        emit RockArchived(rockId, msg.sender, uidHash);
    }

    /**
     * @notice Flag this rock's physical tag as lost or copied, so anyone reading the registry sees
     *         your statement about it. Callable by the rock's owner, or by its Rock Account while
     *         you are still an owner of that account. Emits `RockMarkedLost`.
     * @dev Informational only: it freezes no funds, blocks no gift and gates nothing on-chain.
     * @param rockId The rock to flag.
     */
    function markLost(uint256 rockId) external {
        Rock storage rock = _rocks[rockId];
        _requireLiveRock(rockId, rock);
        _requireRockController(rockId, rock);

        rock.lost = true;
        emit RockMarkedLost(rockId, msg.sender);
    }

    /**
     * @notice Clear the lost flag — you found the tag. Callable by the rock's owner, or by its
     *         Rock Account while you are still an owner of that account. Emits `RockLostCleared`.
     * @param rockId The rock to unflag.
     */
    function clearLost(uint256 rockId) external {
        Rock storage rock = _rocks[rockId];
        _requireLiveRock(rockId, rock);
        _requireRockController(rockId, rock);

        rock.lost = false;
        emit RockLostCleared(rockId, msg.sender);
    }

    /* --------------------------------------------------------------------- */
    /*  Administrator actions                                                 */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Rotate the attestation signer. Administrator only. Every attestation signed by the
     *         previous signer stops working immediately. Emits `AttesterUpdated`.
     * @param newAttester The address whose signatures the registry will accept. Not zero.
     */
    function setAttester(address newAttester) external onlyOwner {
        if (newAttester == address(0)) revert AttesterCannotBeZero();
        address previous = attester;
        attester = newAttester;
        emit AttesterUpdated(previous, newAttester);
    }

    /**
     * @notice Stop the registry accepting new rocks, new gifts and new claims. Administrator only.
     * @dev Owners can still cancel a gift, retire a rock and clear a lost flag while paused: a
     *      pause must never trap somebody in a state. It does **not** stop the clock — a gift whose
     *      expiry passes during a pause is dead and must be opened again after unpausing.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume normal operation. Administrator only.
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Disabled, and always reverts. Administration of this registry cannot be abandoned.
     * @dev Without an administrator the attester could never be rotated, and every future tap
     *      would be unusable. Ownership moves with `transferOwnership` then `acceptOwnership`.
     */
    function renounceOwnership() public pure override {
        revert OwnershipCannotBeRenounced();
    }

    /* --------------------------------------------------------------------- */
    /*  Views — per rock                                                      */
    /* --------------------------------------------------------------------- */

    /**
     * @notice Everything the registry knows about a rock.
     * @dev `state` is the *effective* state: a rock whose stored state is `HandoverPending` but
     *      whose gift has expired is reported as `Awake`, because an expired gift is claimable by
     *      nobody. The `handover` struct is returned as stored, so the expired attempt is still
     *      visible. An archived rock keeps its owner, Rock Account and tag hash here as history
     *      even after its tag has gone on to back a different rock; ask `rockIdForUid` which rock
     *      a tag backs *now*.
     * @param rockId The rock to read.
     * @return rockOwner The wallet that owns the object; for a retired rock, who retired it.
     * @return smartAccount The Rock Account that holds this rock's tokens. Rebound on every
     *         claim, so it always belongs to the current owner and never to a previous one.
     * @return uidHash `keccak256(rawUid7Bytes)` of the bound tag, or zero if never awakened.
     * @return state Effective lifecycle state: 0 Dormant, 1 Awake, 2 HandoverPending, 3 Archived.
     * @return lost The owner's informational lost flag.
     * @return handover The stored gift record; all-zero when no gift was ever opened.
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
        Rock storage rock = _rocks[rockId];
        state = rock.state;
        if (state == RockState.HandoverPending && block.timestamp > rock.handover.expiresAt) {
            state = RockState.Awake;
        }
        return (rock.currentOwner, rock.smartAccount, rock.uidHash, state, rock.lost, rock.handover);
    }

    /**
     * @notice The same thing as `getRock`, in words instead of numbers. Read this one first.
     * @param rockId The rock to read.
     * @return state One of `"Dormant"`, `"Awake"`, `"HandoverPending"`, `"Archived"`.
     * @return owner The wallet that owns the object, or the zero address if it was never awakened.
     * @return rockAccount The smart account that holds this rock's tokens and may act for the
     *         owner. Always the account the current owner was given the rock with: awakening sets
     *         it and every claim rebinds it.
     * @return lost Whether the owner has flagged the tag as lost.
     * @return handoverExpiresAt Unix seconds at which the outstanding gift stops being claimable,
     *         or 0 when no gift is outstanding.
     */
    function describeRock(uint256 rockId)
        external
        view
        returns (string memory state, address owner, address rockAccount, bool lost, uint64 handoverExpiresAt)
    {
        Rock storage rock = _rocks[rockId];
        RockState stored = rock.state;
        bool giftLive = stored == RockState.HandoverPending && block.timestamp <= rock.handover.expiresAt;

        if (stored == RockState.Dormant) {
            state = "Dormant";
        } else if (stored == RockState.Archived) {
            state = "Archived";
        } else if (giftLive) {
            state = "HandoverPending";
        } else {
            state = "Awake";
        }

        return (state, rock.currentOwner, rock.smartAccount, rock.lost, giftLive ? rock.handover.expiresAt : 0);
    }

    /* --------------------------------------------------------------------- */
    /*  Views — per tag                                                       */
    /* --------------------------------------------------------------------- */

    /**
     * @notice The highest tag read counter this registry has ever accepted for a tag.
     * @dev Monotonic for the life of the tag, across retirement and across rocks: it is never
     *      reset, so an attestation captured before a rock was retired cannot be replayed against
     *      whatever rock that tag awakens next.
     * @param uidHash `keccak256(rawUid7Bytes)` of the tag.
     * @return counter The highest counter accepted so far; 0 if the tag is unknown here.
     */
    function lastCounter(bytes32 uidHash) external view returns (uint32 counter) {
        return _lastCounter[uidHash];
    }

    /**
     * @notice The rock a tag currently backs.
     * @param uidHash `keccak256(rawUid7Bytes)` of the tag.
     * @return rockId The live rock it backs, or 0 if the tag has never awakened a rock or its rock
     *         has since been retired. Retiring releases the tag; it does not erase the retired
     *         rock, which still reports the tag through `getRock`.
     */
    function rockIdForUid(bytes32 uidHash) external view returns (uint256 rockId) {
        return _uidToRockId[uidHash];
    }

    /* --------------------------------------------------------------------- */
    /*  Views — attestation helpers                                           */
    /* --------------------------------------------------------------------- */

    /**
     * @notice The EIP-712 digest the attester must sign for a given attestation.
     * @param att The attestation to hash.
     * @return digest The 32-byte digest, ready to be signed or verified.
     */
    function hashAttestation(Attestation calldata att) external view returns (bytes32 digest) {
        return _hashTypedDataV4(_structHash(att));
    }

    /**
     * @notice The EIP-712 domain separator of this deployment.
     * @dev Includes this chain id and this contract address, so a signature made for another
     *      deployment or another chain cannot be replayed here.
     * @return separator The domain separator.
     */
    function domainSeparator() external view returns (bytes32 separator) {
        return _domainSeparatorV4();
    }

    /* --------------------------------------------------------------------- */
    /*  Views — metadata                                                      */
    /* --------------------------------------------------------------------- */

    /**
     * @notice The version of this contract's interface and behaviour.
     * @return semver A semantic version string.
     */
    function version() external pure returns (string memory semver) {
        return "1.0.0";
    }

    /* --------------------------------------------------------------------- */
    /*  Internal                                                              */
    /* --------------------------------------------------------------------- */

    /// @dev Reverts unless the rock has been awakened and has not been retired.
    function _requireLiveRock(uint256 rockId, Rock storage rock) private view {
        if (rock.state == RockState.Dormant) revert RockNotAwakened(rockId);
        if (rock.state == RockState.Archived) revert RockIsArchived(rockId);
    }

    /**
     * @dev The authority check behind every owner action.
     *
     *      Two addresses may act: the owner's own wallet, and the rock's Rock Account — but the
     *      second only while the owner is still a signing owner of that account. Admitting the
     *      account at all is what makes the gasless flows work: under sponsorship the call arrives
     *      as a UserOp executed *by* the Safe, so `msg.sender` is the account rather than the
     *      person.
     *
     *      The `isOwner` check is the second line, not the first. The first is that
     *      `claimHandover` rebinds `smartAccount`, so the account a rock carries always belongs to
     *      its *current* owner and the giver's Safe is out of the picture the moment the rock
     *      changes hands.
     *
     *      `isOwner` still earns its place for the case rebinding cannot reach: an owner who keeps
     *      the rock and changes the signers of their own account. What it must not be asked to do
     *      alone is arbitrate between two parties, because the contract it questions belongs to
     *      one of them and a Safe's owner set is writable by that Safe. That was the defect the
     *      2026-09-12 re-review found (N-1); rebinding is what closes it.
     *
     *      `isOwner` is called inside a try/catch and anything other than a clean `true` — a
     *      revert, a missing function, an address with no code — counts as false. That fails
     *      closed: the owner's own wallet always works, so a rock is never stranded.
     */
    function _requireRockController(uint256 rockId, Rock storage rock) private view {
        address rockOwner = rock.currentOwner;
        if (msg.sender == rockOwner) return;

        address smartAccount = rock.smartAccount;
        if (msg.sender == smartAccount && _accountAnswersTo(smartAccount, rockOwner)) return;

        revert NotRockOwner(rockId, msg.sender, rockOwner, smartAccount);
    }

    /**
     * @dev True only when `account` cleanly reports `rockOwner` as one of its signing owners.
     *
     *      The `code.length` test is not redundant with the try/catch. Solidity checks that a
     *      call target has code *in the calling frame*, before the call, and a revert raised
     *      there is not catchable — so without this line an owner action sent from a codeless
     *      Rock Account would abort with empty revert data instead of a readable `NotRockOwner`.
     */
    function _accountAnswersTo(address account, address rockOwner) private view returns (bool) {
        if (account.code.length == 0) return false;

        try ISafeOwnerManager(account).isOwner(rockOwner) returns (bool isAnOwner) {
            return isAnOwner;
        } catch {
            return false;
        }
    }

    /// @dev The EIP-712 struct hash of an attestation.
    function _structHash(Attestation calldata att) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH, att.rockId, att.uidHash, att.counter, att.deadline, att.subject, att.smartAccount
            )
        );
    }

    /**
     * @dev Validates an attestation against `expectedRockId` / `expectedUidHash` and records its
     *      counter, so one tag read can never be used twice. Reverts on anything unexpected and
     *      writes nothing in that case.
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
        if (att.subject == address(0)) revert InvalidSubject(att.subject);

        if (att.deadline < block.timestamp) revert AttestationExpired(att.deadline, block.timestamp);
        uint256 maxDeadline = block.timestamp + MAX_ATTESTATION_LIFETIME;
        if (att.deadline > maxDeadline) revert AttestationLifetimeTooLong(att.deadline, maxDeadline);

        uint32 seen = _lastCounter[att.uidHash];
        if (att.counter <= seen) revert StaleAttestationCounter(att.counter, seen);

        (address recovered, ECDSA.RecoverError err,) = ECDSA.tryRecover(_hashTypedDataV4(_structHash(att)), sig);
        if (err != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidAttestationSignature();

        _lastCounter[att.uidHash] = att.counter;
    }
}
