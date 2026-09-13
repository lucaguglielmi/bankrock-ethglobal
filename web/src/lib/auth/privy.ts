/**
 * Privy access-token verification for owner-only routes (SA-5).
 *
 * The browser sends the Privy access token as `Authorization: Bearer <token>`. It is a JWT signed
 * with ES256 by the app's key pair; the public keys are published at
 * `https://auth.privy.io/api/v1/apps/{appId}/jwks.json`. Verification is local - one cached JWKS
 * fetch, no per-request call to Privy.
 *
 * Fail closed (D-017): when NEXT_PUBLIC_PRIVY_APP_ID is unset there is nothing to verify against,
 * so every request is UNAVAILABLE. A missing app id never means "allow".
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { NextResponse } from "next/server";
import { env, unavailable, real, type Capability } from "@/lib/demo";

export const PRIVY_ISSUER = "privy.io";

export interface PrivyIdentity {
  /** The Privy DID, e.g. `did:privy:clx…`. This is the subject of the token. */
  did: string;
  /** Token issued-at and expiry, in seconds. */
  issuedAt?: number;
  expiresAt?: number;
  /** The session id claim, when present. */
  sessionId?: string;
}

export interface PrivyAuthFailure {
  status: 401 | 503;
  reason: string;
}

type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

let cachedJwks: { appId: string; jwks: JwksResolver } | null = null;

/** The JWKS URL for an app id. Exported so tests can assert the shape without network access. */
export function privyJwksUrl(appId: string): string {
  return `https://auth.privy.io/api/v1/apps/${appId}/jwks.json`;
}

function getJwks(appId: string): JwksResolver {
  if (cachedJwks && cachedJwks.appId === appId) return cachedJwks.jwks;
  const jwks = createRemoteJWKSet(new URL(privyJwksUrl(appId)));
  cachedJwks = { appId, jwks };
  return jwks;
}

/** Test seam: injects a key resolver so the JWKS endpoint is never contacted in unit tests. */
export function __setPrivyJwksForTesting(appId: string, jwks: JwksResolver | null): void {
  cachedJwks = jwks ? { appId, jwks } : null;
}

/** Extracts the bearer token, or null when the header is absent or malformed. */
export function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  return token === "" ? null : token;
}

/**
 * Verifies a Privy access token.
 *
 * Returns REAL with the caller's identity, or UNAVAILABLE with the reason. The reason is safe to
 * return to the client: it never contains the token or any claim value.
 */
export async function verifyPrivyToken(token: string | null): Promise<Capability<PrivyIdentity>> {
  const appId = env.privyAppId.trim();
  if (appId === "") {
    return unavailable("Sign-in is not configured");
  }
  if (!token) {
    return unavailable("Missing Privy access token");
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(appId), {
      issuer: PRIVY_ISSUER,
      audience: appId,
      // Privy signs access tokens with ES256 and publishes a single P-256 key in its JWKS
      // (audit P-8). Pinning it means a future key of another type cannot be used to verify a
      // token this app accepts, whatever the JWKS starts advertising.
      algorithms: ["ES256"],
    });
    return real(identityFromPayload(payload));
  } catch (err) {
    return unavailable(
      `Privy access token rejected: ${err instanceof Error ? err.name : "verification failed"}`,
    );
  }
}

function identityFromPayload(payload: JWTPayload): PrivyIdentity {
  const did = typeof payload.sub === "string" ? payload.sub : "";
  return {
    did,
    issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
    expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    sessionId: typeof payload.sid === "string" ? payload.sid : undefined,
  };
}

/**
 * Route guard. On success returns the identity; on failure returns the response to send.
 *
 * 503 when sign-in is not configured at all (the capability is UNAVAILABLE, not the credential
 * wrong); 401 when a token is missing or invalid.
 */
export async function requirePrivyIdentity(
  req: Request,
): Promise<{ ok: true; identity: PrivyIdentity } | { ok: false; response: NextResponse }> {
  const result = await verifyPrivyToken(bearerToken(req));

  if (result.state === "UNAVAILABLE") {
    const notConfigured = result.reason === "Sign-in is not configured";
    return {
      ok: false,
      response: NextResponse.json(
        { state: "UNAVAILABLE", reason: result.reason },
        { status: notConfigured ? 503 : 401 },
      ),
    };
  }

  if (!result.value.did) {
    return {
      ok: false,
      response: NextResponse.json(
        { state: "UNAVAILABLE", reason: "Privy access token has no subject" },
        { status: 401 },
      ),
    };
  }

  return { ok: true, identity: result.value };
}
