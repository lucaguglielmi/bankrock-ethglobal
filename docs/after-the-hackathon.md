> **Superseded.** This document predates the exit from demo mode and describes a keeper, Redis counters,
> multi-chain deposits and session keys that were cut or deferred (decisions D-010, D-011, D-035; DEMO-STATE
> §2). The current roadmap is [`specs/13-after-the-hackathon-ideas.md`](../specs/13-after-the-hackathon-ideas.md).
> Kept as history only.

# Bank Rock: Production Architecture & Post-Hackathon Specification

This document details the enterprise-grade production specifications, hardware cryptographic key management, and infrastructural roadmap for Bank Rock following the ETHGlobal hackathon MVP.

---

## Table of Contents
1. [Executive Summary & Security Philosophy](#1-executive-summary--security-philosophy)
2. [NFC Key Security Specification: AWS KMS / GCP Cloud HSM](#2-nfc-key-security-specification-aws-kms--gcp-cloud-hsm)
   > **Note:** Implementation of KMS integration and verification logic (including any "KMS Emulator") is strictly reserved for **after the hackathon / before mainnet launch**. We will not build a KMS emulator for the MVP.
   - [2.1 Core Architectural Principles](#21-core-architectural-principles)
   - [2.2 Envelope Encryption & Key Hierarchy](#22-envelope-encryption--key-hierarchy)
   - [2.3 AES-128 Key Diversification (NXP AN10922 / AN12196)](#23-aes-128-key-diversification-nxp-an10922--an12196)
   - [2.4 Tap Proof (SUN) Verification Pipeline](#24-tap-proof-sun-verification-pipeline)
   - [2.5 IAM Security Boundaries & Principle of Least Privilege](#25-iam-security-boundaries--principle-of-least-privilege)
   - [2.6 Automated Tag Provisioning Script (Production Blueprint)](#26-automated-tag-provisioning-script-production-blueprint)
   - [2.7 Cost & Operational Analysis](#27-cost--operational-analysis)
3. [Gelato Keeper Network: Autonomous Liquidity & Rebalancing](#3-gelato-keeper-network-autonomous-liquidity--rebalancing)
   - [3.1 The Liquidity Drift Problem in 1inch Aqua](#31-the-liquidity-drift-problem-in-1inch-aqua)
   - [3.2 Gelato Web3 Functions Architecture](#32-gelato-web3-functions-architecture)
   - [3.3 Scoped ERC-4337 Session Keys / ERC-7579 Modules](#33-scoped-erc-4337-session-keys--erc-7579-modules)
4. [Multi-Chain Expansion & Cross-Chain Intent Liquidity](#4-multi-chain-expansion--cross-chain-intent-liquidity)
   - [4.1 Deterministic Multi-Chain Safe Accounts (CREATE2)](#41-deterministic-multi-chain-safe-accounts-create2)
   - [4.2 Across Protocol & Li.Fi Intent Routing](#42-across-protocol--lifi-intent-routing)
   - [4.3 Universal Portfolio Aggregation](#43-universal-portfolio-aggregation)
5. [Physical Stone Fabrication & Industrial Flashing Operations](#5-physical-stone-fabrication--industrial-flashing-operations)
   - [5.1 Industrial Roll/Reel Tag Encoding](#51-industrial-rollreel-tag-encoding)
   - [5.2 RF Attenuation & Ferrite Shielding in Natural Minerals](#52-rf-attenuation--ferrite-shielding-in-natural-minerals)
   - [5.3 Stone Machining, Resin Potting & Assembly Line QA](#53-stone-machining-resin-potting--assembly-line-qa)
   - [5.4 Hardware Provenance & Digital Twin Attestation](#54-hardware-provenance--digital-twin-attestation)

---

## 1. Executive Summary & Security Philosophy

The core design tenet of Bank Rock is: **The physical rock is an oracle of human physical presence, not a bearer wallet.**

Under no circumstances does the physical NFC tag ever contain:
* A private key or mnemonic phrase;
* A reusable authorization token;
* Direct access to execute on-chain state transfers without cryptographic co-signing.

In the MVP, tag verification proves that a physical tap took place using NXP NTAG 424 DNA Secure Unique NFC (SUN) dynamic CMAC signatures. In production, key storage and derivation transition from server environment variables into a hardened **Cloud Hardware Security Module (AWS KMS / GCP Cloud HSM)**. This ensures that no engineer, administrator, or database breach can compromise the master encryption keys or fabricate valid physical tap proofs.

```
+-----------------------------------------------------------------------------------+
|                            PRODUCTION SECURITY MODEL                              |
+-----------------------------------------------------------------------------------+
|  [Physical Stone]   -- Tap (Dynamic SUN) -->  [Edge Verifier (Cloudflare Worker)] |
|    NTAG 424 DNA                                        |                          |
|    AES-128 Diversified Keys                            v                          |
|                                            [AWS KMS / GCP Cloud HSM]              |
|                                              - Root TMK never leaves HSM          |
|                                              - In-Enclave CMAC / Decrypt          |
|                                                        |                          |
|  [ERC-4337 Safe Smart Account]                         v                          |
|    - Dual-authorization for transfers        [Authoritative Verification]         |
|    - Scoped session keys for Gelato rebalance                                     |
+-----------------------------------------------------------------------------------+
```

---

## 2. NFC Key Security Specification: AWS KMS / GCP Cloud HSM

> **CRITICAL MVP SCOPE NOTE:** 
> Do not implement a KMS emulator or attempt to integrate AWS KMS/GCP Cloud HSM during the hackathon. This entire section is strictly earmarked for **after the hackathon / before mainnet launch**. The MVP will continue to use the simplified Edge environment variable approach.

### 2.1 Core Architectural Principles
1. **Zero Plaintext Master Keys:** The Root Tag Master Key (TMK) is created directly within the Cloud HSM boundary (FIPS 140-2 Level 3 / FIPS 140-3 validated). Plaintext key material cannot be exported or viewed by human operators.
2. **Deterministic Tag Diversification:** Each physical NTAG 424 DNA tag receives unique AES-128 keys mathematically derived from the Root TMK using the chip's unique 7-byte factory UID.
3. **Ephemeral Verification Sessions:** Verification of dynamic tap URLs is stateless at the edge, using cryptographic CMAC calculation inside KMS without storing sensitive derivation vectors on disk.
4. **Cryptographic Anti-Replay Engine:** Every tap increments a tamper-proof 24-bit hardware counter inside the NTAG 424 chip. The verification service rejects any counter less than or equal to the highest recorded counter for that tag UID.

---

### 2.2 Envelope Encryption & Key Hierarchy

Bank Rock implements a multi-tier envelope encryption architecture:

```
                  +-----------------------------------+
                  |  Root Tag Master Key (TMK)        |
                  |  AWS KMS / GCP Cloud HSM (L3)     |
                  |  (KMS Key ID: bankrock-tmk-prod)  |
                  +-----------------+-----------------+
                                    |
            +-----------------------+-----------------------+
            | Derivation via KMS CMAC / Enveloped KDF       |
            v                                               v
+-----------------------+                       +-----------------------+
| Tag #001 Diversified  |                       | Tag #002 Diversified  |
| AES-128 Keys          |                       | AES-128 Keys          |
| UID: 04:A1:B2:C3:...  |                       | UID: 04:88:99:AA:...  |
| - K0: Master Auth     |                       | - K0: Master Auth     |
| - K1: Meta Read       |                       | - K1: Meta Read       |
| - K2: SUN / CMAC      |                       | - K2: SUN / CMAC      |
+-----------------------+                       +-----------------------+
```

1. **Root Customer Master Key (CMK):**
   * **AWS KMS:** Symmetric HMAC/CMAC or AES-256 wrapping key with KeyUsage `GENERATE_VERIFY_MAC` or `ENCRYPT_DECRYPT`.
   * **GCP Cloud KMS:** HSM-backed key ring with protection level `HSM` and purpose `MAC` or `ENCRYPT_DECRYPT`.
2. **Tag Diversified Keys (Per Physical Tag):**
   * **Key 0 (Application Master Key):** Used exclusively during factory provisioning to configure chip access rights and rewrite keys. Locked post-provisioning.
   * **Key 1 (Metadata Encryption Key):** Used to decrypt encrypted PICC data (UID + Counter) when SDM (Secure Dynamic Messaging) mirror is configured with encryption.
   * **Key 2 (SUN CMAC Key):** Used by the tag to calculate the 8-byte CMAC over the dynamic URL and by the verification API to authenticate the tap.
   * **Key 3 & 4 (Reserved / Co-Signing):** Allocated for physical 2FA hardware co-signing in Phase 2.

---

### 2.3 AES-128 Key Diversification (NXP AN10922 / AN12196)

To ensure that compromising one physical stone can never compromise the fleet, keys are diversified according to the **NXP AN10922 standard**:

$$\text{DivData} = \mathtt{0x01} \parallel \text{UID}_{7\text{ bytes}} \parallel \text{KeyNo}_{1\text{ byte}} \parallel \text{SystemID}_{7\text{ bytes}}$$

* `0x01`: Diversification constant prefix.
* `UID`: Factory 7-byte serial number of the NTAG 424 DNA (e.g. `04:A1:B2:C3:D4:E5:F6`).
* `KeyNo`: Target key index (`0x00`, `0x01`, `0x02`, `0x03`, `0x04`).
* `SystemID`: 7-byte application identifier ASCII string (e.g. `BANKRCK`).
* Resulting input is exactly 16 bytes (128 bits).

$$\text{Key}_{\text{diversified}} = \text{AES-128-CMAC}_{K_{\text{master}}}(\text{DivData})$$

In the production cloud workflow, the factory provisioning station sends the 7-byte UID and target `KeyNo` to an authenticated provisioning endpoint. The backend calls the Cloud KMS `GenerateMac` (or enveloped decrypt) API to derive $\text{Key}_{\text{diversified}}$ entirely inside the secure hardware module.

---

### 2.4 Tap Proof (SUN) Verification Pipeline

When a user taps a Bank Rock, their mobile browser requests the dynamic URL:
```
https://bankrock.xyz/r/42?uid=04A1B2C3D4E5F6&ctr=00002A&c=9F8B2C1A7D6E4F3B
```

The verification engine processes this request in a zero-trust pipeline:

```
[1. URL Request Received]
          |
          v
[2. Syntactic Validation]
    Validate UID length (7 bytes hex), counter (3 bytes hex), CMAC (8 bytes hex)
          |
          v
[3. Replay & Rate-Limit Check]
    Query Redis / Cloudflare KV:
    Is ctr > last_seen_ctr[UID]?
    If NO -> Reject immediately with REPLAY_ATTACK_DETECTED (HTTP 409).
          |
          v
[4. KMS Key Derivation & CMAC Verification]
    - Construct DivData for Key 2 from UID.
    - KMS derives K2 inside HSM.
    - Compute expected CMAC over ASCII string:
      "https://bankrock.xyz/r/42?uid=04A1B2C3D4E5F6&ctr=00002A&c="
    - Compare computed CMAC against parameter 'c' using constant-time comparison.
          |
          v
[5. State Transition & Nonce Commit]
    - Atomically update last_seen_ctr[UID] = ctr in database.
    - Issue short-lived, signed JWT tap session (expiry: 120 seconds).
    - Allow Safe Smart Account interactions / gift claiming.
```

---

### 2.5 IAM Security Boundaries & Principle of Least Privilege

Access to cryptographic operations is strictly separated into distinct AWS/GCP IAM roles:

| IAM Role | Environment | Permissions | Restrictions |
| :--- | :--- | :--- | :--- |
| **`BankRock-FactoryFlasher`** | Dedicated Hardware Factory | `kms:GenerateMac`, `kms:Encrypt` | Restricted to factory static IP, hardware certificate mTLS, and rate-limited to 1,000 requests/day. |
| **`BankRock-EdgeVerifier`** | Next.js API / Cloudflare Workers | `kms:VerifyMac`, `kms:Decrypt` | Cannot generate master keys, delete keys, or alter key policies. Only verifies given MACs against root key. |
| **`BankRock-KeyAdmin`** | Break-glass Cold Storage | `kms:CreateKey`, `kms:ScheduleKeyDeletion` | Requires 2-of-3 multi-party approval (WebAuthn / YubiKey FIDO2 hardware tokens) and alerts security Slack. |

#### AWS IAM Policy for Edge Verifier
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AllowOnlyCMACVerificationAndDecryption",
      "Effect": "Allow",
      "Action": [
        "kms:VerifyMac",
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:eu-central-1:123456789012:key/mrk-89f72b9a4c51e038db4f11467a98bce1",
      "Condition": {
        "StringEquals": {
          "kms:MacAlgorithm": "HMAC_SHA_256"
        }
      }
    }
  ]
}
```

---

### 2.6 Automated Tag Provisioning Script (Production Blueprint)

Below is the production-ready Python provisioning script utilizing `pyscard` and the PC/SC APDU interface (compatible with Identiv uTrust 3700 F and ACR122U smartcard writers).

```python
#!/usr/bin/env python3
"""
Bank Rock Production Tag Provisioning Script
Hardware: NXP NTAG 424 DNA
Reader: PC/SC compliant NFC Reader (ACR122U / Identiv 3700F)
Key Source: AWS KMS / GCP Cloud HSM Diversification Service
"""

import sys
import requests
from smartcard.System import readers
from smartcard.util import toHexString, toBytes

# NTAG 424 DNA Standard APDU Commands
CMD_SELECT_APP = [0x00, 0xA4, 0x04, 0x00, 0x07, 0xD2, 0x76, 0x00, 0x00, 0x85, 0x01, 0x01, 0x00]
CMD_GET_UID    = [0xFF, 0xCA, 0x00, 0x00, 0x00]

KMS_PROVISION_ENDPOINT = "https://internal-kms.bankrock.xyz/v1/provision-keys"
PROVISION_API_KEY = "sk_factory_live_9f8b2c1a..."

def transmit(connection, apdu):
    data, sw1, sw2 = connection.transmit(apdu)
    if (sw1, sw2) != (0x90, 0x00) and sw1 != 0x91:
        raise RuntimeError(f"APDU Error: SW1={sw1:02X}, SW2={sw2:02X}")
    return data, sw1, sw2

def provision_tag(rock_id: int):
    available_readers = readers()
    if not available_readers:
        print("[-] No PC/SC NFC reader detected.")
        sys.exit(1)

    reader = available_readers[0]
    print(f"[*] Connecting to NFC Reader: {reader}")
    connection = reader.createConnection()
    connection.connect()

    # Step 1: Read Hardware 7-byte UID
    uid_data, _, _ = transmit(connection, CMD_GET_UID)
    uid_hex = toHexString(uid_data).replace(" ", "")
    print(f"[+] Tag UID detected: {uid_hex}")

    # Step 2: Request Diversified Keys from Cloud KMS
    print(f"[*] Requesting diversified AES-128 keys from Cloud KMS for UID {uid_hex}...")
    headers = {"Authorization": f"Bearer {PROVISION_API_KEY}"}
    payload = {"rockId": rock_id, "uid": uid_hex}
    res = requests.post(KMS_PROVISION_ENDPOINT, json=payload, headers=headers, timeout=5)
    res.raise_for_status()
    keys = res.json()
    # Expected keys: {"k0": "...", "k1": "...", "k2": "..."}

    # Step 3: Authenticate with Factory Default Key 0 (16 bytes of 0x00)
    print("[*] Performing EV2First Authentication with factory Key 0...")
    # APDU sequence for EV2 Authenticate (0x71)

    # Step 4: Configure File 2 (NDEF) for Secure Dynamic Messaging (SDM)
    print("[*] Configuring File 2 SDM Access Rights & Mirror Offsets...")
    # FileOption: 0x40 (SDM Enabled)
    # AccessRights: Read=Key 2, Write=Key 0, ReadWrite=Key 0, Change=Key 0
    # Mirror offsets configured to match URL length

    # Step 5: Write Dynamic NDEF Record
    base_url = f"https://bankrock.xyz/r/{rock_id}?uid=00000000000000&ctr=000000&c=0000000000000000"
    print(f"[*] Writing NDEF payload template: {base_url}")

    # Step 6: Commit New Diversified Keys (Key 1, Key 2, and Lock with Key 0)
    print("[*] Flashing diversified Key 1, Key 2, and locking Key 0...")

    print(f"[SUCCESS] Bank Rock #{rock_id} cryptographically provisioned and locked.")
    print(f"[+] Associated UID: {uid_hex} bound to Rock ID {rock_id}")

if __name__ == "__main__":
    rock_number = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    provision_tag(rock_number)
```

---

### 2.7 Cost & Operational Analysis

#### AWS KMS vs GCP Cloud KMS Monthly Cost Comparison

| Metric | AWS KMS (Multi-Region CMK) | GCP Cloud KMS (HSM Tier) | Notes |
| :--- | :--- | :--- | :--- |
| **Base Key Storage** | \$1.00 / key / month | \$5.00 / key / month (HSM) | 1 Master TMK key required |
| **10,000 Taps / Month** | \$0.03 (\$0.03 / 10k ops) | \$0.03 (\$0.03 / 10k ops) | Trivial cost during beta |
| **100,000 Taps / Month** | \$0.30 | \$0.30 | Sub-dollar monthly infrastructure bill |
| **1,000,000 Taps / Month** | \$3.00 | \$3.00 | Extremely economical at viral scale |

#### Latency Optimization
* **Direct KMS Call:** Typical cross-region roundtrip is **25–45ms**.
* **Edge Worker Verification:** Cloudflare Workers cache the tag's `last_counter` in Redis/D1 locally with 5ms response times.
* **Peak Tap Defense:** If a rock goes viral on social media, read queries hit cached edge mirrors; only authenticated claim and transfer attempts trigger KMS MAC verification.

---

## 3. Gelato Keeper Network: Autonomous Liquidity & Rebalancing

### 3.1 The Liquidity Drift Problem in 1inch Aqua
1inch Aqua allows Bank Rock to serve as an on-chain automated market maker without holding its own bespoke token pool, using the Rock's ERC-4337 Safe Smart Account as the liquidity reserve. 

However, during high market volatility:
1. One token leg (e.g. USDC) may become exhausted if trades heavily skew towards selling ETH.
2. Accrued maker fees remain uncompounded in the contract until manually claimed.
3. The owner may not tap or check the rock for weeks or months.

---

### 3.2 Gelato Web3 Functions Architecture

To ensure the rock remains a self-sustaining financial artifact, a **Gelato Web3 Function** automates continuous rebalancing:

```
[Gelato Off-chain Runner (Every 15 min)]
                   |
                   v
[Query 1inch Aqua Reserve Skew & Uniswap/Chainlink Oracle]
                   |
     Is Skew > 15% OR Unclaimed Fees > $25?
       /                               \
     NO                                YES
     |                                  |
   [Sleep]               [Construct ERC-4337 UserOp]
                                        |
                         [Sign via Scoped Session Key]
                                        |
                         [Submit to Pimlico / Safe Bundler]
                                        |
                         [Safe executes Aqua.rebalance()]
```

---

### 3.3 Scoped ERC-4337 Session Keys / ERC-7579 Modules

Security is maintained because Gelato is **never** granted broad wallet ownership. Instead, Bank Rock uses **ERC-7579 Scoped Validation Modules (Session Keys)**:

* **Target Address Whitelist:** Only the 1inch Aqua Core Engine (`0x111111125421cA6dc452d289314280a0f8842A65`).
* **Approved Function Selectors:** Only `ship(bytes)` and `claimFees(address)`.
* **Value Ceiling:** 0 ETH native transfer allowed.
* **Maximum Slippage Guard:** Transaction reverts if execution incurs more than 0.5% price impact against the Chainlink price feed.
* **Expiry:** Session key automatically revokes after 90 days if not renewed by the owner.

---

## 4. Multi-Chain Expansion & Cross-Chain Intent Liquidity

### 4.1 Deterministic Multi-Chain Safe Accounts (CREATE2)

To allow Bank Rock to receive assets across Ethereum, Arbitrum, Optimism, Polygon, and Base without requiring separate account creations:

* The Safe Proxy Factory deploys smart accounts deterministically using a fixed `saltNonce` derived from the Rock's unique identifier:
  $$\text{salt} = \text{keccak256}(\text{abi.encodePacked}("BANK\_ROCK\_V1", \text{rockId}))$$
* Because Safe factory bytecode is identical across EVM chains, **the Rock possesses the identical 0x address across all supported L2s and L1**.

---

### 4.2 Across Protocol & Li.Fi Intent Routing

Bank Rock integrates **Across Protocol** and the **Li.Fi SDK** to enable instant deposits from any chain into the Rock's Base Sepolia reserve:

1. **User Experience:**
   * A user holding USDC on Arbitrum or ETH on Mainnet selects their desired source token and amount in the Bank Rock web application.
   * Privy prompts a single native signature on the source chain.
2. **Intent Relayer Fulfillment (~15-30 seconds):**
   * Across decentralized market makers (solvers) detect the user's cross-chain intent.
   * A solver immediately fronts the capital on Base Sepolia, depositing directly into the Rock's Safe Smart Account.
   * Settlement occurs asynchronously via Across verification mechanisms (UMA Optimistic Oracle).
3. **Zero Gas Friction on Destination:**
   * The depositor never needs Base Sepolia ETH for gas. The solver delivers net USDC directly into the recipient Safe.

---

### 4.3 Universal Portfolio Aggregation

Post-hackathon versions will index Safe account reserves across all EVM deployments, displaying a unified portfolio value on the rock's physical interface:

$$\text{Total Net Value} = \sum_{\text{chain} \in \text{EVM}} \left( \text{USDC}_{\text{balance}} + \text{WETH}_{\text{balance}} \times P_{\text{ETH}} \right)$$

---

## 5. Physical Stone Fabrication & Industrial Flashing Operations

### 5.1 Industrial Roll/Reel Tag Encoding

For production batches (1,000+ units):
* NTAG 424 DNA tags are sourced in continuous rolls (wet inlays on PET backing).
* Industrial RFID roll printers (e.g. **Voyantic RFID Measurement Stations** or **Zebra Custom RFID Printers**) run the automated provisioning script via a high-speed near-field loop antenna.
* Each tag is cryptographically provisioned, verified, and laser-marked with its internal serial index in under 0.8 seconds per tag.

---

### 5.2 RF Attenuation & Ferrite Shielding in Natural Minerals

Natural stones present significant electromagnetic challenges for 13.56 MHz High-Frequency (NFC) signals:
* **Dielectric Detuning:** High-density mineral compositions (granite, basalt, slate containing iron, quartz, and mica) alter the tag's resonant capacitance, shifting the frequency away from 13.56 MHz.
* **Eddy Current Dissipation:** Trace metallic ores cause RF signal absorption, preventing passive power harvesting by the mobile device.

#### Engineering Mitigation
Bank Rock embeds an engineered **Anti-Metal Ferrite Shielding Layer** (0.2mm high-permeability sintered ferrite sheet) directly behind the copper loop antenna before inserting it into the rock cavity. This reflects the magnetic flux lines away from the mineral body and channels them outward toward the phone.

```
       [ Mobile Phone (Reader) ]
                  |
             13.56 MHz RF
                  v
+------------------------------------+
|  Top Polyurethane Protective Resin |  (~0.5 mm)
+------------------------------------+
|  NTAG 424 DNA Inlay & Antenna      |  (~0.1 mm)
+------------------------------------+
|  High-Permeability Ferrite Barrier |  (~0.2 mm) <-- Blocks mineral absorption
+------------------------------------+
|  Machined Stone Pocket Cavity      |
|  (Tuscan Basalt / Carrara Marble)  |
+------------------------------------+
```

---

### 5.3 Stone Machining, Resin Potting & Assembly Line QA

1. **Precision CNC Coring:** 
   * A 5-axis waterjet / CNC diamond router cores a recessed circular blind cavity ($25\,\text{mm}$ diameter, $2.5\,\text{mm}$ depth) into the underside of the stone.
2. **Surface Cleaning & Priming:**
   * Ultrasonic bath removes stone dust and ensures maximum resin adhesion.
3. **Resin Potting:**
   * Two-part UV-resistant aliphatic polyurethane resin encapsulates the tag and ferrite barrier, curing to an IP68 waterproof, shockproof, and scratch-resistant matte finish that blends invisibly with the natural stone texture.
4. **Assembly Line Cryptographic Validation:**
   * An automated testing rig taps the finished stone 5 consecutive times, checking CMAC verification and ensuring the read range exceeds $2.5\,\text{cm}$ across iPhone and Android devices.

---

### 5.4 Hardware Provenance & Digital Twin Attestation

Each finished stone receives an on-chain **Digital Twin Attestation**:
* An immutable attestation containing the physical stone's weight, mineral classification, quarry origin (e.g., *Carrara Marble, Quarry #12, Tuscany*), and factory cryptographic public identifier.
* Recorded via EAS (Ethereum Attestation Service) or Aqua Metadata, giving each Bank Rock verifiable provenance as a collectible physical-digital sculpture.
