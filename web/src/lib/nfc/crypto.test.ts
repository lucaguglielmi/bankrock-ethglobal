import { describe, expect, it } from "vitest";

import { aesCbcDecrypt, aesCbcEncrypt, aesCmac, aesEncryptBlock, generateCmacSubkeys } from "./crypto";

const hex = (value: string) => Buffer.from(value.replace(/\s/g, ""), "hex");

/**
 * EXTERNAL VECTOR — FIPS 197, Appendix C.1 (AES-128).
 */
describe("aesEncryptBlock", () => {
  it("matches the FIPS 197 C.1 AES-128 known answer", () => {
    const key = hex("000102030405060708090a0b0c0d0e0f");
    const plaintext = hex("00112233445566778899aabbccddeeff");
    expect(aesEncryptBlock(key, plaintext).toString("hex")).toBe("69c4e0d86a7b0430d8cdb78070b4c55a");
  });
});

/**
 * EXTERNAL VECTOR — NIST SP 800-38A, F.2.1 / F.2.2 (CBC-AES128.Encrypt/Decrypt).
 * This pins the AES-CBC primitive that decrypts the PICCData against a published
 * known answer, independently of anything in this codebase.
 */
describe("aesCbcEncrypt / aesCbcDecrypt", () => {
  const key = hex("2b7e151628aed2a6abf7158809cf4f3c");
  const iv = hex("000102030405060708090a0b0c0d0e0f");
  const plaintext = hex(
    "6bc1bee22e409f96e93d7e117393172a" +
      "ae2d8a571e03ac9c9eb76fac45af8e51" +
      "30c81c46a35ce411e5fbc1191a0a52ef" +
      "f69f2445df4f9b17ad2b417be66c3710",
  );
  const ciphertext =
    "7649abac8119b246cee98e9b12e9197d" +
    "5086cb9b507219ee95db113a917678b2" +
    "73bed6b8e3c1743b7116e69e22229516" +
    "3ff1caa1681fac09120eca307586e1a7";

  it("encrypts the SP 800-38A F.2.1 vector", () => {
    expect(aesCbcEncrypt(key, plaintext, iv).toString("hex")).toBe(ciphertext);
  });

  it("decrypts the SP 800-38A F.2.2 vector", () => {
    expect(aesCbcDecrypt(key, hex(ciphertext), iv).toString("hex")).toBe(plaintext.toString("hex"));
  });

  it("rejects a key that is not 16 bytes", () => {
    expect(() => aesCbcEncrypt(hex("00112233"), plaintext, iv)).toThrow(/16 bytes/);
  });

  it("rejects data that is not block aligned", () => {
    expect(() => aesCbcEncrypt(key, hex("001122"), iv)).toThrow(/multiple of 16/);
  });
});

/**
 * EXTERNAL VECTORS — RFC 4493, section 4 "Test Vectors" (AES-128 CMAC).
 */
describe("aesCmac (RFC 4493)", () => {
  const key = hex("2b7e151628aed2a6abf7158809cf4f3c");
  const message = hex(
    "6bc1bee22e409f96e93d7e117393172a" +
      "ae2d8a571e03ac9c9eb76fac45af8e51" +
      "30c81c46a35ce411e5fbc1191a0a52ef" +
      "f69f2445df4f9b17ad2b417be66c3710",
  );

  it("derives the RFC 4493 subkeys", () => {
    const { k1, k2 } = generateCmacSubkeys(key);
    expect(k1.toString("hex")).toBe("fbeed618357133667c85e08f7236a8de");
    expect(k2.toString("hex")).toBe("f7ddac306ae266ccf90bc11ee46d513b");
  });

  it("example 1 — len 0", () => {
    expect(aesCmac(key, Buffer.alloc(0)).toString("hex")).toBe("bb1d6929e95937287fa37d129b756746");
  });

  it("example 2 — len 16", () => {
    expect(aesCmac(key, message.subarray(0, 16)).toString("hex")).toBe(
      "070a16b46b4d4144f79bdd9dd04a287c",
    );
  });

  it("example 3 — len 40", () => {
    expect(aesCmac(key, message.subarray(0, 40)).toString("hex")).toBe(
      "dfa66747de9ae63030ca32611497c827",
    );
  });

  it("example 4 — len 64", () => {
    expect(aesCmac(key, message).toString("hex")).toBe("51f0bebf7e3b9d92fc49741779363cfe");
  });
});
