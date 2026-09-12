/**
 * AES primitives and RFC 4493 AES-CMAC.
 *
 * Uses `node:crypto` only. Cloudflare enables `nodejs_compat` by default for
 * `compatibility_date >= 2026-08-04` and this project is on `2026-09-11`
 * (spec 15, F-4), so `createCipheriv`/`createDecipheriv` are available in the
 * Worker as well as under Node and vitest.
 *
 * Only `aes-128-cbc` is used. A single-block CBC encryption with an all-zero IV
 * is identical to a single-block ECB encryption, and CMAC is defined as the last
 * block of a CBC-MAC, so CBC alone is sufficient for every operation here.
 */

import { createCipheriv, createDecipheriv } from "node:crypto";

export const AES_BLOCK_SIZE = 16;

/** Rb constant for the 128-bit block subkey generation (RFC 4493 §2.3). */
const RB = 0x87;

function zeroIv(): Buffer {
  return Buffer.alloc(AES_BLOCK_SIZE, 0);
}

function assertKey(key: Buffer): void {
  if (key.length !== AES_BLOCK_SIZE) {
    throw new Error(`AES-128 key must be ${AES_BLOCK_SIZE} bytes, got ${key.length}`);
  }
}

function assertBlockAligned(data: Buffer, what: string): void {
  if (data.length === 0 || data.length % AES_BLOCK_SIZE !== 0) {
    throw new Error(`${what} must be a non-zero multiple of ${AES_BLOCK_SIZE} bytes, got ${data.length}`);
  }
}

/** AES-128-CBC encryption with no padding. */
export function aesCbcEncrypt(key: Buffer, data: Buffer, iv: Buffer = zeroIv()): Buffer {
  assertKey(key);
  assertBlockAligned(data, "CBC plaintext");
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  cipher.setAutoPadding(false);
  return Buffer.concat([cipher.update(data), cipher.final()]);
}

/** AES-128-CBC decryption with no padding. */
export function aesCbcDecrypt(key: Buffer, data: Buffer, iv: Buffer = zeroIv()): Buffer {
  assertKey(key);
  assertBlockAligned(data, "CBC ciphertext");
  const decipher = createDecipheriv("aes-128-cbc", key, iv);
  decipher.setAutoPadding(false);
  return Buffer.concat([decipher.update(data), decipher.final()]);
}

/**
 * Raw AES-128 encryption of exactly one block (equivalent to ECB of one block).
 * Used for CMAC subkey generation and for the SDMENCFileData IV.
 */
export function aesEncryptBlock(key: Buffer, block: Buffer): Buffer {
  if (block.length !== AES_BLOCK_SIZE) {
    throw new Error(`AES block must be ${AES_BLOCK_SIZE} bytes, got ${block.length}`);
  }
  return aesCbcEncrypt(key, block, zeroIv());
}

/** Left shift a 16-byte big-endian value by one bit (RFC 4493 §2.3). */
function shiftLeftOneBit(input: Buffer): { out: Buffer; carry: number } {
  const out = Buffer.alloc(input.length);
  let carry = 0;
  for (let i = input.length - 1; i >= 0; i--) {
    const byte = input[i];
    out[i] = ((byte << 1) & 0xff) | carry;
    carry = (byte & 0x80) !== 0 ? 1 : 0;
  }
  return { out, carry };
}

function xorInto(target: Buffer, other: Buffer): void {
  for (let i = 0; i < target.length; i++) {
    target[i] ^= other[i];
  }
}

/** RFC 4493 §2.3 subkey generation. */
export function generateCmacSubkeys(key: Buffer): { k1: Buffer; k2: Buffer } {
  const l = aesEncryptBlock(key, Buffer.alloc(AES_BLOCK_SIZE, 0));

  const first = shiftLeftOneBit(l);
  const k1 = first.out;
  if (first.carry === 1) k1[AES_BLOCK_SIZE - 1] ^= RB;

  const second = shiftLeftOneBit(k1);
  const k2 = second.out;
  if (second.carry === 1) k2[AES_BLOCK_SIZE - 1] ^= RB;

  return { k1, k2 };
}

/**
 * AES-128-CMAC over an arbitrary-length message (RFC 4493 §2.4).
 * Returns the full 16-byte MAC.
 */
export function aesCmac(key: Buffer, message: Buffer): Buffer {
  assertKey(key);
  const { k1, k2 } = generateCmacSubkeys(key);

  const completeBlocks = Math.floor(message.length / AES_BLOCK_SIZE);
  const isWholeBlocks = message.length > 0 && message.length % AES_BLOCK_SIZE === 0;

  let head: Buffer;
  let lastBlock: Buffer;

  if (isWholeBlocks) {
    head = message.subarray(0, (completeBlocks - 1) * AES_BLOCK_SIZE);
    lastBlock = Buffer.from(message.subarray((completeBlocks - 1) * AES_BLOCK_SIZE));
    xorInto(lastBlock, k1);
  } else {
    head = message.subarray(0, completeBlocks * AES_BLOCK_SIZE);
    const remainder = message.subarray(completeBlocks * AES_BLOCK_SIZE);
    lastBlock = Buffer.concat(
      [remainder, Buffer.from([0x80]), Buffer.alloc(AES_BLOCK_SIZE - remainder.length - 1, 0)],
      AES_BLOCK_SIZE,
    );
    xorInto(lastBlock, k2);
  }

  // CMAC is the final block of a CBC-MAC over head || lastBlock with a zero IV.
  const cbc = aesCbcEncrypt(key, Buffer.concat([head, lastBlock]));
  return Buffer.from(cbc.subarray(cbc.length - AES_BLOCK_SIZE));
}
