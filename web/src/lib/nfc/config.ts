/**
 * NFC key material, read from the environment.
 *
 * D-017 / D-018: this fails closed. With `NXP_MASTER_KEY` unset there is no
 * default key, no development bypass and no code path that can return
 * `verified: true`.
 *
 * Environment variables read here:
 *   NXP_MASTER_KEY            required, 32 hex characters (16 bytes)
 *   NXP_KEY_DIVERSIFY         optional, "true" enables AN10922 diversification
 *                             of the SDMFileRead key (default: off)
 *   NXP_KEY_DIVERSIFY_APP_ID  optional, application id for the diversification
 *                             input (default: "BankRock")
 */

import { DEFAULT_DIVERSIFY_APP_ID, type SdmKeyConfig } from "./sdm";

export const AES128_KEY_HEX_LENGTH = 32;

export type KeyConfigResolution =
  | { ok: true; config: SdmKeyConfig }
  | { ok: false; reason: "unconfigured" };

const HEX_PATTERN = /^[0-9a-fA-F]+$/;

export function isHex(value: string, byteLength?: number): boolean {
  if (value.length === 0 || value.length % 2 !== 0) return false;
  if (byteLength !== undefined && value.length !== byteLength * 2) return false;
  return HEX_PATTERN.test(value);
}

/**
 * Resolve the SDM key configuration, or report `unconfigured`.
 *
 * An unset, wrong-length or non-hex `NXP_MASTER_KEY` is `unconfigured`. It is
 * never substituted with zeros or any other default.
 */
export function loadSdmKeyConfig(): KeyConfigResolution {
  const raw = process.env.NXP_MASTER_KEY;
  if (!raw || !isHex(raw, 16)) {
    return { ok: false, reason: "unconfigured" };
  }

  return {
    ok: true,
    config: {
      masterKey: Buffer.from(raw, "hex"),
      diversify: process.env.NXP_KEY_DIVERSIFY === "true",
      diversifyAppId: process.env.NXP_KEY_DIVERSIFY_APP_ID || DEFAULT_DIVERSIFY_APP_ID,
    },
  };
}
