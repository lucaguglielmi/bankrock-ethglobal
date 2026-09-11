# NFC and physical security

## Core rule

The NFC tag is a locator, not a key.

It may identify a rock and open its public page. It must never contain a wallet private key, reusable authorization token or sufficient information to claim funded assets.

## Assumed hardware

The existing rocks may contain ordinary writable NFC tags rather than cryptographically secure tags. The design therefore assumes that:

- tag contents can be read;
- the public URL may be copied;
- the identifier may be cloned onto another tag;
- the tag may become unreadable or be physically lost.

The product remains safe under all four conditions.

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

An unactivated rock must not be claimable solely because someone scanned it first.

Acceptable MVP approaches:

1. Separate single-use activation code supplied with the rock.
2. Creator preassigns an intended recipient.
3. Creator remains online to approve first activation.
4. Tamper-evident printed QR or code paired with the NFC rock.

Preferred MVP: separate one-time activation code plus creator-side ability to revoke it before use.

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

## Future secure edition

A later hardware edition may use tags capable of producing cryptographically verifiable dynamic messages. This could strengthen proof of physical presence, but it is not required for the hackathon and must not be assumed for the current rocks.
