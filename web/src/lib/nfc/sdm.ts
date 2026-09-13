/**
 * NTAG 424 DNA Secure Dynamic Messaging (SDM) verification.
 *
 * References
 * ----------
 * - NXP AN12196, "NTAG 424 DNA and NTAG 424 DNA TagTamper features and hints",
 *   section "Secure Dynamic Messaging" - encrypted PICCData layout, the SV1/SV2
 *   session vectors, the CMAC truncation rule, and the worked SDM example
 *   (`picc_data=EF963FF7828658A599F3041510671E88&cmac=94EED9EE65337086`).
 * - NXP NT4H2421Gx datasheet (NTAG 424 DNA) - PICCDataTag encoding and the
 *   little-endian SDMReadCtr.
 * - NXP AN10922, "Symmetric key diversifications", section on AES-128
 *   diversification - D = 0x01 || DivInput, K = CMAC(master, D).
 * - RFC 4493 - AES-CMAC (implemented in ./crypto).
 *
 * Fixes the defects recorded as F-3 in specs/15-exit-demo-mode.md: the UID is
 * read at offset 1 (after the PICCDataTag byte), the SDMReadCtr is 3 bytes
 * little-endian (not `readUInt32LE`), and the CMAC is computed with the real
 * NXP session key derivation rather than over an invented message.
 */

import { timingSafeEqual } from "node:crypto";

import { AES_BLOCK_SIZE, aesCbcDecrypt, aesCmac, aesEncryptBlock } from "./crypto";

/** Length of the encrypted PICCData blob, in bytes. */
export const PICC_DATA_LENGTH = 16;
/** Length of the truncated SDM CMAC carried in the URL, in bytes. */
export const SDM_MAC_LENGTH = 8;
/** UID length of an NTAG 424 DNA, in bytes. */
export const UID_LENGTH = 7;
/** SDMReadCtr length, in bytes. */
export const READ_COUNTER_LENGTH = 3;

/** PICCDataTag bit 7 - the UID is mirrored into the PICCData. */
const PICC_TAG_UID_MIRROR = 0x80;
/** PICCDataTag bit 6 - the SDMReadCtr is mirrored into the PICCData. */
const PICC_TAG_COUNTER_MIRROR = 0x40;
/** PICCDataTag bits 5..4 are RFU and must be zero. */
const PICC_TAG_RFU = 0x30;
/** PICCDataTag bits 3..0 - UID length in bytes. */
const PICC_TAG_UID_LENGTH = 0x0f;

/** AN10922 AES-128 diversification prefix. */
const DIVERSIFICATION_PREFIX = 0x01;
/** Default application identifier mixed into the AN10922 diversification input. */
export const DEFAULT_DIVERSIFY_APP_ID = "BankRock";

/** SV1 header - session key for SDMENCFileData (AN12196). */
const SV1_HEADER = Buffer.from([0xc3, 0x3c, 0x00, 0x01, 0x00, 0x80]);
/** SV2 header - session key for the SDM file-read CMAC (AN12196). */
const SV2_HEADER = Buffer.from([0x3c, 0xc3, 0x00, 0x01, 0x00, 0x80]);

export interface SdmKeyConfig {
  /** Batch master key (`NXP_MASTER_KEY`), 16 bytes. */
  masterKey: Buffer;
  /**
   * Key used to decrypt the PICCData (SDMMetaRead). Defaults to the master key.
   * It is never diversified: the UID that diversification needs is only
   * recoverable *after* this decryption.
   */
  metaReadKey?: Buffer;
  /**
   * Key used for the SDM file-read CMAC (SDMFileRead). Defaults to the master
   * key, or to the AN10922 diversification of it when `diversify` is set.
   */
  fileReadKey?: Buffer;
  /**
   * Derive the SDMFileRead key per tag with AN10922 AES-128 diversification.
   * Off by default; the batch master key is used directly.
   */
  diversify?: boolean;
  /** Application identifier for the diversification input. */
  diversifyAppId?: string;
}

export interface PiccData {
  /** Raw PICCDataTag byte. */
  tag: number;
  uidMirrored: boolean;
  counterMirrored: boolean;
  /** 7-byte UID, exactly as it appears inside the PICCData. */
  uid: Buffer;
  /** SDMReadCtr as an integer (the 3 bytes are little-endian). */
  readCounter: number;
  /** SDMReadCtr as the 3 raw little-endian bytes; the session vectors use these. */
  readCounterBytes: Buffer;
  /** Random padding that follows the mirrored data inside the 16-byte block. */
  padding: Buffer;
}

export interface SdmSessionKeys {
  /** K_SesSDMFileReadENC - decrypts SDMENCFileData. */
  encKey: Buffer;
  /** K_SesSDMFileReadMAC - keys the SDM CMAC. */
  macKey: Buffer;
}

export type SdmFailureReason =
  | "unexpected_picc_tag"
  | "invalid_cmac";

export interface SdmVerifySuccess {
  ok: true;
  uid: Buffer;
  readCounter: number;
  picc: PiccData;
  /** Decrypted SDMENCFileData, when `encFileData` was supplied. */
  fileData?: Buffer;
}

export interface SdmVerifyFailure {
  ok: false;
  reason: SdmFailureReason;
}

export type SdmVerifyResult = SdmVerifySuccess | SdmVerifyFailure;

export interface SdmVerifyInput {
  /** Encrypted PICCData - the `e` / `picc_data` URL parameter, 16 bytes. */
  piccData: Buffer;
  /** Truncated SDM CMAC - the `c` / `cmac` URL parameter, 8 bytes. */
  cmac: Buffer;
  /**
   * SDMENCFileData exactly as it appeared in the URL (the `enc` parameter),
   * as an ASCII string. It is both decrypted and, per the NXP NDEF template,
   * used verbatim as the CMAC input (the bytes between SDMMACInputOffset and
   * SDMMACOffset are the hex characters of this field).
   */
  encFileData?: string;
  /**
   * Explicit CMAC input, overriding the rule above. Supply this for SDM
   * configurations whose SDMMACInputOffset covers something other than the
   * encrypted file data.
   */
  macInput?: Buffer;
  keys: SdmKeyConfig;
}

/**
 * AN10922 AES-128 key diversification.
 *
 * Diversification input implemented here, exactly:
 *
 *     D = 0x01 || utf8(appId) || UID
 *
 * with `appId` defaulting to the 8-byte ASCII string "BankRock" and `UID` the
 * 7-byte tag UID, so D is 16 bytes. The diversified key is the standard
 * AES-CMAC of D under the master key.
 */
export function diversifyKey(
  masterKey: Buffer,
  uid: Buffer,
  appId: string = DEFAULT_DIVERSIFY_APP_ID,
): Buffer {
  if (uid.length !== UID_LENGTH) {
    throw new Error(`UID must be ${UID_LENGTH} bytes, got ${uid.length}`);
  }
  const divInput = Buffer.concat([
    Buffer.from([DIVERSIFICATION_PREFIX]),
    Buffer.from(appId, "utf8"),
    uid,
  ]);
  return aesCmac(masterKey, divInput);
}

/**
 * Decrypt the encrypted PICCData with AES-128-CBC, zero IV, no padding, and
 * parse the mirrored fields.
 *
 * Layout (AN12196 / NT4H2421Gx), 16 bytes total:
 *   [0]      PICCDataTag
 *   [1..7]   UID (when bit 7 of the tag is set and the low nibble is 7)
 *   [8..10]  SDMReadCtr, little-endian (when bit 6 of the tag is set)
 *   [11..15] random padding
 */
export function decryptPiccData(metaReadKey: Buffer, encrypted: Buffer): PiccData | null {
  if (encrypted.length !== PICC_DATA_LENGTH) {
    throw new Error(`PICCData must be ${PICC_DATA_LENGTH} bytes, got ${encrypted.length}`);
  }

  const plain = aesCbcDecrypt(metaReadKey, encrypted);
  return parsePiccData(plain);
}

/** Parse decrypted PICCData. Returns `null` for an unexpected PICCDataTag. */
export function parsePiccData(plain: Buffer): PiccData | null {
  if (plain.length !== PICC_DATA_LENGTH) {
    throw new Error(`PICCData must be ${PICC_DATA_LENGTH} bytes, got ${plain.length}`);
  }

  const tag = plain[0];
  const uidMirrored = (tag & PICC_TAG_UID_MIRROR) !== 0;
  const counterMirrored = (tag & PICC_TAG_COUNTER_MIRROR) !== 0;
  const uidLength = tag & PICC_TAG_UID_LENGTH;

  // This deployment provisions tags with UID + SDMReadCtr mirroring and a
  // 7-byte UID, so the only acceptable tag byte is 0xC7. Anything else means
  // the wrong key, a forged `e`, or a tag configuration we do not support.
  if (!uidMirrored || !counterMirrored) return null;
  if ((tag & PICC_TAG_RFU) !== 0) return null;
  if (uidLength !== UID_LENGTH) return null;

  const uid = Buffer.from(plain.subarray(1, 1 + UID_LENGTH));
  const readCounterBytes = Buffer.from(
    plain.subarray(1 + UID_LENGTH, 1 + UID_LENGTH + READ_COUNTER_LENGTH),
  );
  const readCounter =
    readCounterBytes[0] | (readCounterBytes[1] << 8) | (readCounterBytes[2] << 16);
  const padding = Buffer.from(plain.subarray(1 + UID_LENGTH + READ_COUNTER_LENGTH));

  return { tag, uidMirrored, counterMirrored, uid, readCounter, readCounterBytes, padding };
}

/**
 * NXP SDM session key derivation.
 *
 *   SV1 = C3 3C 00 01 00 80 || UID(7) || SDMReadCtr(3, LE)
 *   SV2 = 3C C3 00 01 00 80 || UID(7) || SDMReadCtr(3, LE)
 *   K_SesSDMFileReadENC = CMAC(K_SDMFileRead, SV1)
 *   K_SesSDMFileReadMAC = CMAC(K_SDMFileRead, SV2)
 */
export function deriveSessionKeys(
  fileReadKey: Buffer,
  uid: Buffer,
  readCounterBytes: Buffer,
): SdmSessionKeys {
  if (uid.length !== UID_LENGTH) {
    throw new Error(`UID must be ${UID_LENGTH} bytes, got ${uid.length}`);
  }
  if (readCounterBytes.length !== READ_COUNTER_LENGTH) {
    throw new Error(
      `SDMReadCtr must be ${READ_COUNTER_LENGTH} bytes, got ${readCounterBytes.length}`,
    );
  }
  const sv1 = Buffer.concat([SV1_HEADER, uid, readCounterBytes]);
  const sv2 = Buffer.concat([SV2_HEADER, uid, readCounterBytes]);
  return {
    encKey: aesCmac(fileReadKey, sv1),
    macKey: aesCmac(fileReadKey, sv2),
  };
}

/**
 * NXP SDM MAC truncation: keep the bytes at odd indices of the full 16-byte
 * CMAC (1, 3, 5, 7, 9, 11, 13, 15).
 */
export function truncateMac(fullMac: Buffer): Buffer {
  if (fullMac.length !== AES_BLOCK_SIZE) {
    throw new Error(`CMAC must be ${AES_BLOCK_SIZE} bytes, got ${fullMac.length}`);
  }
  const out = Buffer.alloc(SDM_MAC_LENGTH);
  for (let i = 0; i < SDM_MAC_LENGTH; i++) {
    out[i] = fullMac[i * 2 + 1];
  }
  return out;
}

/** Compute the 8-byte SDM MAC over `macInput` under the session MAC key. */
export function computeSdmMac(sessionMacKey: Buffer, macInput: Buffer): Buffer {
  return truncateMac(aesCmac(sessionMacKey, macInput));
}

/**
 * Decrypt SDMENCFileData.
 *
 * IV = AES-ECB(K_SesSDMFileReadENC, SDMReadCtr(3, LE) || 00 * 13)
 * plaintext = AES-128-CBC-decrypt(K_SesSDMFileReadENC, ciphertext, IV)
 */
export function decryptSdmFileData(
  sessionEncKey: Buffer,
  readCounterBytes: Buffer,
  ciphertext: Buffer,
): Buffer {
  const ivInput = Buffer.alloc(AES_BLOCK_SIZE, 0);
  readCounterBytes.copy(ivInput, 0);
  const iv = aesEncryptBlock(sessionEncKey, ivInput);
  return aesCbcDecrypt(sessionEncKey, ciphertext, iv);
}

function constantTimeEquals(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Full SDM verification: decrypt the PICCData, derive the session keys, compute
 * the SDM MAC and compare it against the tag's `c` parameter in constant time.
 *
 * The work performed is the same for every input that reaches this function:
 * one AES-CBC block decryption, three CMACs and one comparison. There is no
 * input-dependent branch that does more or less cryptographic work.
 */
export function verifySdm(input: SdmVerifyInput): SdmVerifyResult {
  const { piccData, cmac, keys } = input;

  if (piccData.length !== PICC_DATA_LENGTH) {
    throw new Error(`PICCData must be ${PICC_DATA_LENGTH} bytes, got ${piccData.length}`);
  }
  if (cmac.length !== SDM_MAC_LENGTH) {
    throw new Error(`SDM CMAC must be ${SDM_MAC_LENGTH} bytes, got ${cmac.length}`);
  }

  const metaReadKey = keys.metaReadKey ?? keys.masterKey;
  const picc = decryptPiccData(metaReadKey, piccData);
  if (picc === null) {
    return { ok: false, reason: "unexpected_picc_tag" };
  }

  const fileReadKey =
    keys.fileReadKey ??
    (keys.diversify
      ? diversifyKey(keys.masterKey, picc.uid, keys.diversifyAppId ?? DEFAULT_DIVERSIFY_APP_ID)
      : keys.masterKey);

  const session = deriveSessionKeys(fileReadKey, picc.uid, picc.readCounterBytes);

  // Without SDMENCFileData and without an explicit SDMMACInputOffset the MAC
  // input is empty (AN12196). With encrypted file data the NXP NDEF template
  // puts the MAC input offset immediately before the CMAC, so the input is the
  // literal ASCII of the `enc` field.
  const macInput =
    input.macInput ??
    (input.encFileData !== undefined ? Buffer.from(input.encFileData, "ascii") : Buffer.alloc(0));

  const expected = computeSdmMac(session.macKey, macInput);
  if (!constantTimeEquals(expected, cmac)) {
    return { ok: false, reason: "invalid_cmac" };
  }

  let fileData: Buffer | undefined;
  if (input.encFileData !== undefined && input.encFileData.length > 0) {
    const ciphertext = Buffer.from(input.encFileData, "hex");
    if (ciphertext.length > 0 && ciphertext.length % AES_BLOCK_SIZE === 0) {
      fileData = decryptSdmFileData(session.encKey, picc.readCounterBytes, ciphertext);
    }
  }

  return { ok: true, uid: picc.uid, readCounter: picc.readCounter, picc, fileData };
}
