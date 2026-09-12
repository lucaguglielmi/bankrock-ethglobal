import { describe, expect, it } from "vitest";

import { aesCbcEncrypt, aesCmac } from "./crypto";
import {
  DEFAULT_DIVERSIFY_APP_ID,
  computeSdmMac,
  decryptPiccData,
  decryptSdmFileData,
  deriveSessionKeys,
  diversifyKey,
  parsePiccData,
  truncateMac,
  verifySdm,
  type SdmKeyConfig,
} from "./sdm";

const hex = (value: string) => Buffer.from(value.replace(/\s/g, ""), "hex");

/* -------------------------------------------------------------------------- */
/* EXTERNAL VECTOR — NXP AN12196                                               */
/* -------------------------------------------------------------------------- */

/**
 * NXP AN12196, "NTAG 424 DNA and NTAG 424 DNA TagTamper features and hints",
 * Secure Dynamic Messaging section — the worked SDM example whose URL is
 *
 *   https://ntag.nxp.com/424?e=EF963FF7828658A599F3041510671E88&c=94EED9EE65337086
 *
 * (the same pair appears in the document's SDM decryption walkthrough as
 * `picc_data` / `cmac`). The SDMMetaRead and SDMFileRead keys are both the
 * all-zero AES-128 key, the SDM configuration is "PICCData mirror + CMAC" with
 * no SDMENCFileData, so the CMAC input is empty.
 *
 * Every intermediate below was re-derived from the two published hex strings
 * and matches: an 8-byte MAC reproduced from an independently held ciphertext
 * through decryption, session-key derivation and truncation is not something an
 * incorrect implementation produces by accident, so this vector validates the
 * whole composition end to end.
 */
const AN12196 = {
  key: hex("00000000000000000000000000000000"),
  piccData: hex("EF963FF7828658A599F3041510671E88"),
  cmac: hex("94EED9EE65337086"),
  plainPiccData: hex("C704DE5F1EACC0403D0000DA5CF60941"),
  uid: hex("04DE5F1EACC040"),
  readCounterBytes: hex("3D0000"),
  readCounter: 61,
  sv1: hex("C33C0001008004DE5F1EACC0403D0000"),
  sv2: hex("3CC30001008004DE5F1EACC0403D0000"),
  encKey: hex("DF38382B84FB90D2DDDB24E51AAFF7AC"),
  macKey: hex("3FB5F6E3A807A03D5E3570ACE393776F"),
  fullMac: hex("E194C7EE12D9F7EE8A65C8331B704386"),
};

describe("AN12196 PICCData decryption (external vector)", () => {
  it("decrypts to the documented plaintext", () => {
    const picc = decryptPiccData(AN12196.key, AN12196.piccData);
    expect(picc).not.toBeNull();
    const rebuilt = Buffer.concat([
      Buffer.from([picc!.tag]),
      picc!.uid,
      picc!.readCounterBytes,
      picc!.padding,
    ]);
    expect(rebuilt.toString("hex").toUpperCase()).toBe(
      AN12196.plainPiccData.toString("hex").toUpperCase(),
    );
  });

  it("parses the PICCDataTag, the UID at offset 1 and the little-endian counter", () => {
    const picc = decryptPiccData(AN12196.key, AN12196.piccData)!;
    expect(picc.tag).toBe(0xc7);
    expect(picc.uidMirrored).toBe(true);
    expect(picc.counterMirrored).toBe(true);
    // F-3: the old verifier read the UID at offset 0, swallowing the tag byte.
    expect(picc.uid.toString("hex").toUpperCase()).toBe("04DE5F1EACC040");
    // F-3: the old verifier used readUInt32LE over a 3-byte little-endian field.
    expect(picc.readCounterBytes.toString("hex").toUpperCase()).toBe("3D0000");
    expect(picc.readCounter).toBe(61);
  });
});

describe("AN12196 session key derivation (external vector)", () => {
  it("builds SV1/SV2 and derives both session keys", () => {
    const keys = deriveSessionKeys(AN12196.key, AN12196.uid, AN12196.readCounterBytes);
    // The SV shapes are asserted through the keys they produce.
    expect(aesCmac(AN12196.key, AN12196.sv2).toString("hex")).toBe(AN12196.macKey.toString("hex"));
    expect(aesCmac(AN12196.key, AN12196.sv1).toString("hex")).toBe(AN12196.encKey.toString("hex"));
    expect(keys.macKey.toString("hex")).toBe(AN12196.macKey.toString("hex"));
    expect(keys.encKey.toString("hex")).toBe(AN12196.encKey.toString("hex"));
  });

  it("truncates the CMAC to the odd-indexed bytes", () => {
    expect(aesCmac(AN12196.macKey, Buffer.alloc(0)).toString("hex").toUpperCase()).toBe(
      AN12196.fullMac.toString("hex").toUpperCase(),
    );
    expect(truncateMac(AN12196.fullMac).toString("hex").toUpperCase()).toBe("94EED9EE65337086");
    expect(computeSdmMac(AN12196.macKey, Buffer.alloc(0)).toString("hex").toUpperCase()).toBe(
      "94EED9EE65337086",
    );
  });
});

describe("AN12196 full URL verification (external vector)", () => {
  const keys: SdmKeyConfig = { masterKey: AN12196.key };

  it("verifies e + c", () => {
    const result = verifySdm({ piccData: AN12196.piccData, cmac: AN12196.cmac, keys });
    expect(result).toMatchObject({ ok: true, readCounter: 61 });
    if (result.ok) {
      expect(result.uid.toString("hex").toUpperCase()).toBe("04DE5F1EACC040");
    }
  });

  it("rejects a tampered c", () => {
    const tampered = Buffer.from(AN12196.cmac);
    tampered[7] ^= 0x01;
    expect(verifySdm({ piccData: AN12196.piccData, cmac: tampered, keys })).toEqual({
      ok: false,
      reason: "invalid_cmac",
    });
  });

  it("rejects a tampered e", () => {
    const tampered = Buffer.from(AN12196.piccData);
    tampered[0] ^= 0x01;
    const result = verifySdm({ piccData: tampered, cmac: AN12196.cmac, keys });
    expect(result.ok).toBe(false);
    // Flipping a ciphertext bit garbles the whole block, so the PICCDataTag no
    // longer parses. Either rejection is correct; neither is a pass.
    if (!result.ok) {
      expect(["unexpected_picc_tag", "invalid_cmac"]).toContain(result.reason);
    }
  });

  it("rejects the wrong key", () => {
    const wrong: SdmKeyConfig = { masterKey: hex("0102030405060708090A0B0C0D0E0F10") };
    const result = verifySdm({ piccData: AN12196.piccData, cmac: AN12196.cmac, keys: wrong });
    expect(result.ok).toBe(false);
  });

  it("rejects an unexpected PICCDataTag byte", () => {
    const key = hex("00112233445566778899AABBCCDDEEFF");
    for (const tag of [0x00, 0x80, 0x40, 0xc6, 0xf7]) {
      const plain = Buffer.concat([
        Buffer.from([tag]),
        hex("04AABBCCDDEE80"),
        hex("070000"),
        hex("0102030405"),
      ]);
      expect(parsePiccData(plain)).toBeNull();
      const e = aesCbcEncrypt(key, plain);
      const result = verifySdm({
        piccData: e,
        cmac: hex("0000000000000000"),
        keys: { masterKey: key },
      });
      expect(result).toEqual({ ok: false, reason: "unexpected_picc_tag" });
    }
  });

  it("accepts only the 0xC7 tag byte for this configuration", () => {
    const plain = Buffer.concat([
      Buffer.from([0xc7]),
      hex("04AABBCCDDEE80"),
      hex("070000"),
      hex("0102030405"),
    ]);
    expect(parsePiccData(plain)).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* SELF-GENERATED VECTORS                                                      */
/* -------------------------------------------------------------------------- */

/**
 * SELF-GENERATED. The primitives underneath are pinned to published vectors in
 * crypto.test.ts (FIPS 197 C.1, NIST SP 800-38A F.2, RFC 4493 section 4) and
 * the SDM composition is pinned to AN12196 above, but the (e, c) pairs below
 * were produced by running that same composition forward. They are regression
 * vectors, not an independent check. A physical-tag test must confirm the
 * provisioning assumptions they encode: PICCDataTag 0xC7, an undiversified
 * SDMMetaRead key, and an empty SDM MAC input.
 */
const SELF = {
  masterKey: hex("00112233445566778899AABBCCDDEEFF"),
  uid: hex("04AABBCCDDEE80"),
  padding: hex("0102030405"),
  taps: [
    { counter: 1, e: "0EF4967F1130F8EC3522829C83002B2C", c: "13D146EE5C4C752A" },
    { counter: 7, e: "93083B95301463100F2B03A5932F162C", c: "40AD826F047B6987" },
    { counter: 61, e: "39635DF2379BD73D2541165D5C2CDB60", c: "2E2C891486C1EE90" },
    { counter: 16777215, e: "D914C12B3D4C34C2B920F80234B0E1DB", c: "CA801899F873045D" },
  ],
};

/** Build an (e, c) pair the way a provisioned tag would. Test-only. */
export function forgeTap(
  key: Buffer,
  uid: Buffer,
  counter: number,
  options: { padding?: Buffer; fileReadKey?: Buffer; encFileData?: string; tag?: number } = {},
): { e: string; c: string } {
  const counterBytes = Buffer.from([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]);
  const plain = Buffer.concat([
    Buffer.from([options.tag ?? 0xc7]),
    uid,
    counterBytes,
    options.padding ?? hex("0102030405"),
  ]);
  const e = aesCbcEncrypt(key, plain);
  const session = deriveSessionKeys(options.fileReadKey ?? key, uid, counterBytes);
  const macInput =
    options.encFileData !== undefined ? Buffer.from(options.encFileData, "ascii") : Buffer.alloc(0);
  return {
    e: e.toString("hex").toUpperCase(),
    c: computeSdmMac(session.macKey, macInput).toString("hex").toUpperCase(),
  };
}

describe("self-generated SDM regression vectors", () => {
  const keys: SdmKeyConfig = { masterKey: SELF.masterKey };

  it.each(SELF.taps)("verifies counter $counter", ({ counter, e, c }) => {
    expect(forgeTap(SELF.masterKey, SELF.uid, counter, { padding: SELF.padding })).toEqual({ e, c });

    const result = verifySdm({ piccData: hex(e), cmac: hex(c), keys });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.readCounter).toBe(counter);
      expect(result.uid.toString("hex").toUpperCase()).toBe("04AABBCCDDEE80");
    }
  });

  it("rejects a c borrowed from a different counter", () => {
    const [first, second] = SELF.taps;
    expect(verifySdm({ piccData: hex(first.e), cmac: hex(second.c), keys })).toEqual({
      ok: false,
      reason: "invalid_cmac",
    });
  });
});

describe("AN10922 key diversification", () => {
  it("derives K = CMAC(master, 0x01 || 'BankRock' || UID)", () => {
    const expected = aesCmac(
      SELF.masterKey,
      Buffer.concat([Buffer.from([0x01]), Buffer.from(DEFAULT_DIVERSIFY_APP_ID, "utf8"), SELF.uid]),
    );
    const derived = diversifyKey(SELF.masterKey, SELF.uid);
    expect(derived.toString("hex").toUpperCase()).toBe(expected.toString("hex").toUpperCase());
    // SELF-GENERATED regression value.
    expect(derived.toString("hex").toUpperCase()).toBe("7CF46334DE054FF8A016F28375873BE5");
  });

  it("verifies a tap whose SDMFileRead key is diversified", () => {
    const fileReadKey = diversifyKey(SELF.masterKey, SELF.uid);
    const tap = forgeTap(SELF.masterKey, SELF.uid, 7, { padding: SELF.padding, fileReadKey });
    // SELF-GENERATED regression value.
    expect(tap.c).toBe("C1DE643CC8A93CB5");

    expect(
      verifySdm({
        piccData: hex(tap.e),
        cmac: hex(tap.c),
        keys: { masterKey: SELF.masterKey, diversify: true },
      }).ok,
    ).toBe(true);

    // The same URL must fail when diversification is off.
    expect(
      verifySdm({
        piccData: hex(tap.e),
        cmac: hex(tap.c),
        keys: { masterKey: SELF.masterKey },
      }),
    ).toEqual({ ok: false, reason: "invalid_cmac" });
  });

  it("uses a different app id when configured", () => {
    expect(diversifyKey(SELF.masterKey, SELF.uid, "Other").toString("hex")).not.toBe(
      diversifyKey(SELF.masterKey, SELF.uid).toString("hex"),
    );
  });
});

describe("SDMENCFileData", () => {
  it("MACs over the literal enc parameter and decrypts the file data", () => {
    const counter = 9;
    const counterBytes = hex("090000");
    const session = deriveSessionKeys(SELF.masterKey, SELF.uid, counterBytes);
    const plaintext = Buffer.from("bankrock-sdm-fd!", "ascii");
    const ivInput = Buffer.alloc(16, 0);
    counterBytes.copy(ivInput, 0);
    const iv = aesCbcEncrypt(session.encKey, ivInput);
    const ciphertext = aesCbcEncrypt(session.encKey, plaintext, iv).toString("hex").toUpperCase();

    const tap = forgeTap(SELF.masterKey, SELF.uid, counter, {
      padding: SELF.padding,
      encFileData: ciphertext,
    });

    const result = verifySdm({
      piccData: hex(tap.e),
      cmac: hex(tap.c),
      encFileData: ciphertext,
      keys: { masterKey: SELF.masterKey },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileData?.toString("ascii")).toBe("bankrock-sdm-fd!");
    }
    expect(decryptSdmFileData(session.encKey, counterBytes, hex(ciphertext)).toString("ascii")).toBe(
      "bankrock-sdm-fd!",
    );
  });

  it("rejects when enc is altered, because it is the MAC input", () => {
    const encFileData = "00112233445566778899AABBCCDDEEFF";
    const tap = forgeTap(SELF.masterKey, SELF.uid, 9, {
      padding: SELF.padding,
      encFileData,
    });
    expect(
      verifySdm({
        piccData: hex(tap.e),
        cmac: hex(tap.c),
        encFileData: "00112233445566778899AABBCCDDEEF0",
        keys: { masterKey: SELF.masterKey },
      }),
    ).toEqual({ ok: false, reason: "invalid_cmac" });
  });
});

describe("input validation", () => {
  const keys: SdmKeyConfig = { masterKey: SELF.masterKey };

  it("rejects a PICCData that is not 16 bytes", () => {
    expect(() => verifySdm({ piccData: hex("0011"), cmac: hex("0011223344556677"), keys })).toThrow(
      /16 bytes/,
    );
  });

  it("rejects a CMAC that is not 8 bytes", () => {
    expect(() => verifySdm({ piccData: AN12196.piccData, cmac: hex("00112233"), keys })).toThrow(
      /8 bytes/,
    );
  });

  it("rejects a UID of the wrong length in the session derivation", () => {
    expect(() => deriveSessionKeys(SELF.masterKey, hex("0011"), hex("010000"))).toThrow(/7 bytes/);
  });
});
