import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, exportJWK, generateKeyPair, type JWK } from "jose";

const APP_ID = "test-privy-app-id";

/**
 * The verifier's failure paths, with the JWKS mocked: no network call is made, and a test never
 * depends on auth.privy.io being reachable.
 */
async function loadVerifier(publicJwk: JWK | null) {
  process.env.NEXT_PUBLIC_PRIVY_APP_ID = APP_ID;
  vi.resetModules();
  const mod = await import("./privy");
  if (publicJwk) {
    const { createLocalJWKSet } = await import("jose");
    mod.__setPrivyJwksForTesting(
      APP_ID,
      createLocalJWKSet({ keys: [publicJwk] }) as unknown as Parameters<
        typeof mod.__setPrivyJwksForTesting
      >[1],
    );
  }
  return mod;
}

let privateKey: CryptoKey;
let publicJwk: JWK;

beforeEach(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey as CryptoKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), alg: "ES256", use: "sig" };
});

afterEach(() => {
  vi.resetModules();
});

function token(claims: { iss?: string; aud?: string; sub?: string; expSeconds?: number }) {
  const builder = new SignJWT({})
    .setProtectedHeader({ alg: "ES256" })
    .setIssuedAt()
    .setSubject(claims.sub ?? "did:privy:test-user")
    .setIssuer(claims.iss ?? "privy.io")
    .setAudience(claims.aud ?? APP_ID)
    .setExpirationTime(claims.expSeconds ?? Math.floor(Date.now() / 1000) + 3600);
  return builder.sign(privateKey);
}

describe("verifyPrivyToken", () => {
  it("is UNAVAILABLE when the app id is unset (D-017 — never 'allow')", async () => {
    delete process.env.NEXT_PUBLIC_PRIVY_APP_ID;
    vi.resetModules();
    const mod = await import("./privy");
    const result = await mod.verifyPrivyToken("anything");
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toBe("Sign-in is not configured");
    }
  });

  it("rejects a missing token", async () => {
    const mod = await loadVerifier(publicJwk);
    const result = await mod.verifyPrivyToken(null);
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("accepts a well-formed token and returns the DID", async () => {
    const mod = await loadVerifier(publicJwk);
    const result = await mod.verifyPrivyToken(await token({}));
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") {
      expect(result.value.did).toBe("did:privy:test-user");
    }
  });

  it("rejects a token issued by someone else", async () => {
    const mod = await loadVerifier(publicJwk);
    const result = await mod.verifyPrivyToken(await token({ iss: "evil.example" }));
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects a token minted for a different app id", async () => {
    const mod = await loadVerifier(publicJwk);
    const result = await mod.verifyPrivyToken(await token({ aud: "another-app" }));
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects an expired token", async () => {
    const mod = await loadVerifier(publicJwk);
    const expired = await token({ expSeconds: Math.floor(Date.now() / 1000) - 10 });
    const result = await mod.verifyPrivyToken(expired);
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects a token signed by an unknown key", async () => {
    const mod = await loadVerifier(publicJwk);
    const other = await generateKeyPair("ES256", { extractable: true });
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256" })
      .setIssuedAt()
      .setSubject("did:privy:attacker")
      .setIssuer("privy.io")
      .setAudience(APP_ID)
      .setExpirationTime(Math.floor(Date.now() / 1000) + 3600)
      .sign(other.privateKey as CryptoKey);
    const result = await mod.verifyPrivyToken(forged);
    expect(result.state).toBe("UNAVAILABLE");
  });

  it("rejects garbage", async () => {
    const mod = await loadVerifier(publicJwk);
    expect((await mod.verifyPrivyToken("not-a-jwt")).state).toBe("UNAVAILABLE");
  });
});

describe("bearerToken", () => {
  it("reads the Authorization header, and only the Bearer form", async () => {
    const mod = await loadVerifier(null);
    const withHeader = (value?: string) =>
      new Request("https://bank-rock.com/api/alerts", {
        headers: value ? { authorization: value } : {},
      });
    expect(mod.bearerToken(withHeader("Bearer abc"))).toBe("abc");
    expect(mod.bearerToken(withHeader("bearer abc"))).toBe("abc");
    expect(mod.bearerToken(withHeader("Basic abc"))).toBeNull();
    expect(mod.bearerToken(withHeader("Bearer   "))).toBeNull();
    expect(mod.bearerToken(withHeader())).toBeNull();
  });
});

describe("privyJwksUrl", () => {
  it("points at the app's JWKS document", async () => {
    const mod = await loadVerifier(null);
    expect(mod.privyJwksUrl(APP_ID)).toBe(
      `https://auth.privy.io/api/v1/apps/${APP_ID}/jwks.json`,
    );
  });
});
