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

Recommended NDEF payload:

https://bankrock.example/r/{publicRockId}

The identifier should be:

- random enough to avoid trivial enumeration;
- permanent for normal use;
- non-secret;
- mapped to the authoritative Rock Registry.

Avoid placing wallet addresses or claim secrets directly on the tag.

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
- private gift message before acceptance;
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

A lost flag warns scanners but does not automatically move or freeze assets.

## Future hardware evolution

While NTAG 424 DNA solves physical presence perfectly, future iterations could integrate active hardware components (like secure enclaves or displays) if the physical form factor changes, but NTAG 424 DNA is the gold standard for the current passive rock form factor.

## Invisible Security (UX First)

Security must be high-end but never get in the way of the user experience. We achieve this through:

- **Passkeys (Biometrics):** Via Privy, users authenticate using FaceID/TouchID (Passkeys) instead of writing down complex mnemonic seed phrases or passwords. 
- **Passive Risk Scoring:** The system should silently evaluate claim requests (e.g., flagging unusual IPs or rapid, repeated claims across multiple rocks) and only introduce friction or CAPTCHAs if the risk score is high.
- **Progressive Security:** For low-value operations (like checking balance), require zero friction. For high-value operations (withdrawing all liquidity), require a biometric step-up, but seamlessly integrated into the flow without redirecting to intimidating security pages.
