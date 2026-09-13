/**
 * The single D1 access point (D-016).
 *
 * The next-on-pages adapter is removed; the deployment adapter is `@opennextjs/cloudflare`, so
 * the binding is reached through `getCloudflareContext()`. The adapters are not interchangeable,
 * and mixing them is why every D1 read failed in production (R-2, R-3, R-4).
 *
 * This module never throws and never throws at import time. When there is no `DB` binding it
 * returns `null`, and the caller renders UNAVAILABLE (D-013) - it never falls back to an
 * in-memory Map that resets per isolate.
 */

import { drizzle, type AnyD1Database, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

export * as schema from "./schema";

/**
 * Structural type for the D1 binding.
 *
 * `@cloudflare/workers-types` is not a dependency of this project, so the `D1Database` global
 * does not exist here. This captures what the code actually uses; the Drizzle driver receives it
 * through one cast, in one place.
 */
export interface D1Binding {
  prepare(query: string): unknown;
}

export type Db = DrizzleD1Database<typeof schema>;

interface MaybeEnv {
  DB?: D1Binding;
  [key: string]: unknown;
}

function envFromContext(): MaybeEnv | null {
  try {
    const ctx = getCloudflareContext() as unknown as { env?: MaybeEnv } | undefined;
    return ctx?.env ?? null;
  } catch {
    // No Cloudflare context: `next dev` without wrangler, a unit test, or a static render.
    return null;
  }
}

async function envFromContextAsync(): Promise<MaybeEnv | null> {
  try {
    const ctx = (await getCloudflareContext({ async: true })) as unknown as {
      env?: MaybeEnv;
    } | undefined;
    return ctx?.env ?? null;
  } catch {
    return null;
  }
}

function wrap(binding: D1Binding | undefined | null): Db | null {
  if (!binding) return null;
  return drizzle(binding as unknown as AnyD1Database, { schema });
}

/**
 * The Drizzle client for the request's D1 binding, or `null` when there is none.
 *
 * `env` is optional and exists only so a caller that already holds the Cloudflare env (for
 * example a route that also needs another binding) can pass it instead of a second lookup.
 */
export function getDb(env?: MaybeEnv | null): Db | null {
  return wrap((env ?? envFromContext())?.DB);
}

/**
 * Async variant. Next requires the async form of `getCloudflareContext` where the context is not
 * on the global scope yet - static routes and the top level of a route module.
 */
export async function getDbAsync(): Promise<Db | null> {
  return wrap((await envFromContextAsync())?.DB);
}

/** The raw D1 binding, for callers that issue their own prepared statements. */
export function getD1(): D1Binding | null {
  return envFromContext()?.DB ?? null;
}

export async function getD1Async(): Promise<D1Binding | null> {
  return (await envFromContextAsync())?.DB ?? null;
}

/** The standard reason string for a database-backed capability with no database. */
export const NO_DATABASE_REASON =
  "The application database is not reachable from this deployment (no D1 binding)";
