/**
 * Privy Earn configuration — server-only (spec 20 Part 4, spec 16 #38–#40).
 *
 * Three values, all fail-closed (D-017): the public app id the client already boots with, the
 * app secret that authenticates this server to Privy, and the id of the one vault this
 * deployment offers. Any of them missing makes every earn surface UNAVAILABLE, naming the
 * variable and nothing else. There is no default vault and no default secret.
 *
 * `PRIVY_APP_SECRET` is read here and nowhere else — a spec 20 check greps for that — and it has
 * no `NEXT_PUBLIC_` twin: it never reaches a bundle. The client signs its own requests with the
 * user's key; the secret only proves to Privy which app is forwarding them.
 */

import { env, optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import { DEFAULT_PRIVY_EARN_API_BASE, PRIVY_API_ORIGIN } from "@/lib/earn/shared";

export const EARN_ENV = {
  appSecret: "PRIVY_APP_SECRET",
  vaultId: "PRIVY_EARN_VAULT_ID",
  /** Optional escape hatch should Privy move the earn family off `/api/v1`. */
  earnApiBase: "PRIVY_EARN_API_BASE",
} as const;

export interface EarnConfig {
  appId: string;
  appSecret: string;
  vaultId: string;
  /** Base for the earn endpoints; published to the client so it signs the same URL. */
  earnApiBase: string;
  /** Base for users, wallets and actions — always Privy's origin. */
  apiOrigin: string;
}

const HTTPS_URL = /^https:\/\/[^\s/]+(\/[^\s]*)?$/;

export function earnConfig(): Capability<EarnConfig> {
  const appId = env.privyAppId.trim();
  if (appId === "") {
    return unavailable("Sign-in is not configured");
  }
  const appSecret = optionalEnv(EARN_ENV.appSecret);
  if (!appSecret) {
    return unavailable(`${EARN_ENV.appSecret} is not configured`);
  }
  const vaultId = optionalEnv(EARN_ENV.vaultId);
  if (!vaultId) {
    return unavailable(`${EARN_ENV.vaultId} is not configured`);
  }
  const earnApiBase = optionalEnv(EARN_ENV.earnApiBase) ?? DEFAULT_PRIVY_EARN_API_BASE;
  if (!HTTPS_URL.test(earnApiBase)) {
    return unavailable(`${EARN_ENV.earnApiBase} is not an https URL`);
  }
  return real({
    appId,
    appSecret,
    vaultId,
    earnApiBase: earnApiBase.replace(/\/+$/, ""),
    apiOrigin: PRIVY_API_ORIGIN,
  });
}
