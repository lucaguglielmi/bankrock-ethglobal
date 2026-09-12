# NFC and physical security

## Core rule

The NFC tag is a locator, not a key.

It may identify a rock and open its public page. It must never contain a wallet private key, reusable authorization token or sufficient information to claim funded assets.

## Assumed hardware

**Decision: Cryptographic NFC Tags (NTAG 424 DNA)**

To elevate the security narrative and provide a magical UX, the project assumes the use of **NTAG 424 DNA** tags. These tags generate a unique, cryptographically signed URL on every tap.

- The tag contents (URL) are dynamic and change on every scan.
- The server mathematically verifies the signature to prove the user physically tapped the real rock.
- URL cloning is impossible, as a copied URL will have an invalid or already-used counter/signature.

## Tag payload

One URL, written once (D-022). The exact template, with the zero placeholders the provisioning
tool needs in order to derive the SDM offsets:

```
https://bank-rock.com/r/{publicRockId}?e=00000000000000000000000000000000&c=0000000000000000
```

| Element | Value |
| --- | --- |
| Path | `/r/{publicRockId}` — a decimal integer, because the attestation signs `rockId` as `uint256` |
| `e` | encrypted PICCData, 32 hex characters (16 bytes). Alias `picc_data` is accepted |
| `c` | truncated SDM CMAC, 16 hex characters (8 bytes). Alias `cmac` is accepted |
| `enc` | optional SDMENCFileData — **do not enable it**; the verifier expects an empty MAC input |
| `uid`, `ctr` | never in the URL: both live inside the encrypted PICCData |

**The chip rewrites `e` and `c` on every read; the path, the key and the offsets are written
once.** Consequences that matter elsewhere in this specification:

- `/r/` is a redirect, not a verifier. It preserves the query verbatim and hands it to the rock
  page. It must not verify, because verification advances the tag's read counter and a counter
  advanced on a redirect would burn the tap.
- **The URL never changes, so the number in the path is a hint, not the answer.** After an
  archive (D-028) the tag is unbound and that id belongs to a closed chapter. The verifier
  resolves the *effective* rock from the registry — `bound` / `url` / `next_free` /
  `registry_unavailable` — after the CMAC match and before the counter advance, and signs the
  attestation for the effective id. A tag is never reprogrammed to change rocks.
- The identifier is non-secret and carries no wallet address and no claim secret. Enumerating it
  gains nothing: without a fresh `e` and `c` there is no verification and therefore no
  attestation.

The full provisioning settings — SDM meta-read and file-read keys, the `0xC7` PICCDataTag, access
rights, offsets, and why diversification stays off for the hackathon — are in
[`18-demo-readiness.md`](./18-demo-readiness.md) §4.2, and are not duplicated here.

## Registration protection

Because we use NTAG 424 DNA, the physical tap itself is mathematically proven. 

**Decision: Cryptographic Tap Proof (No PIN required)**

We no longer need a cumbersome, separate 6-digit PIN code printed on a card. 

- The creator registers the tag's master key in the database during provisioning.
- When a recipient taps the rock, the tag generates a signed URL containing a unique counter.
- The server verifies the signature. If valid and the rock is in a "gift pending" state, the recipient is instantly authorized to claim it.
- This provides a seamless "tap to claim" experience while perfectly protecting against URL copying or first-scanner theft.

## Public scan behaviour

A public scan may reveal:

- rock metadata;
- public wallet and strategy state;
- ownership history;
- a safe trade action.

It must not reveal:

- activation secret;
- authentication material;
- personal email or social identity;
- private gift message — a public scan never carries it. Only its `keccak256` is on chain, and
  reading the text needs a Privy token; the rock page asks for it only for the **named recipient**,
  who is shown it on the screen they claim from (spec 02 Flow E step 2);
- server authorization tokens.

## Ownership and possession

Possessing the physical rock is socially meaningful but is not equivalent to financial ownership.

Financial ownership is determined by the Rock Account controller. To make gifting feel physical, the handover flow requires both:

- authenticated authorization; and
- access to the physical package or separate claim proof.

## Lost-tag recovery

The owner can:

1. authenticate through Privy;
2. select the affected rock;
3. mark its public tag as lost;
4. register a replacement tag;
5. preserve the existing Rock Account.

A lost flag warns scanners but does not automatically move or freeze assets. On chain it is
literally informational: `markLost` / `clearLost` set a boolean and gate nothing. The interface
must not present it as a security control — possession was never the authorisation for spending
in the first place. Replacement tags are cut from MVP scope (spec 15 Part 6).

## Retiring a tag — archive and start over

Distinct from losing one. `archiveRock` retires a rock and **releases its tag binding**, so the
same physical tag can awaken a fresh rock id (D-028, Flow K). It is one-way, keeps the archived
rock readable as history, and deliberately does **not** reset `lastCounter(uidHash)`: replay
protection follows the tag, not the rock, so an attestation captured before the archive can never
be replayed against the rock that comes after it. Nothing about tag reuse weakens the cloning
argument above.

## Future hardware evolution

While NTAG 424 DNA solves physical presence perfectly, future iterations could integrate active hardware components (like secure enclaves or displays) if the physical form factor changes, but NTAG 424 DNA is the gold standard for the current passive rock form factor.

## Invisible Security (UX First)

Security must be high-end but never get in the way of the user experience. We achieve this through:

- **Passkeys (Biometrics):** Via Privy, users authenticate using FaceID/TouchID (Passkeys) instead of writing down complex mnemonic seed phrases or passwords. 
- **Passive Risk Scoring:** The system should silently evaluate claim requests (e.g., flagging unusual IPs or rapid, repeated claims across multiple rocks) and only introduce friction or CAPTCHAs if the risk score is high.
- **Progressive Security:** For low-value operations (like checking balance), require zero friction. For high-value operations (withdrawing all liquidity), require a biometric step-up, but seamlessly integrated into the flow without redirecting to intimidating security pages.
