/**
 * Alert preferences (N-9, SA-5, privacy).
 *
 *  - preferences live in D1, not in a per-isolate `Map`. The old store lost every preference on
 *    the next isolate while telling the user it had saved them (R-4);
 *  - a rock's preferences belong to the Privy DID that first wrote them. Anyone else reading or
 *    writing them gets a refusal — the previous route let any anonymous caller read back the
 *    owner's stored email address for any rockId (SA-5);
 *  - with no database, saving is UNAVAILABLE. A success state is never shown for something that
 *    was not persisted.
 *
 * Delivery remains UNAVAILABLE by decision (spec 15, Part 6): preferences persist, nothing
 * dispatches. There is no event-to-delivery pipeline and this module does not pretend otherwise.
 */

import { eq } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { alertPreferences } from "@/lib/db/schema";
import { real, unavailable, type Capability } from "@/lib/demo";
import { logger } from "@/lib/telemetry";

/** A plain object type, not an interface: Drizzle's json column needs the implicit index signature. */
export type AlertTopicsConfig = {
  loss_warning: boolean;
  dangerous_trade: boolean;
  profit_milestone: boolean;
  custody_transfer: boolean;
  gas_depletion: boolean;
  genesis_drop: boolean;
};

export const DEFAULT_ALERT_TOPICS: AlertTopicsConfig = {
  loss_warning: true,
  dangerous_trade: true,
  profit_milestone: true,
  custody_transfer: true,
  gas_depletion: false,
  genesis_drop: true,
};

export interface UserAlertPreferences {
  rockId: string;
  email: string;
  pushEnabled: boolean;
  topics: AlertTopicsConfig;
  updatedAt: string;
}

function coerceTopics(stored: Record<string, boolean> | null | undefined): AlertTopicsConfig {
  return { ...DEFAULT_ALERT_TOPICS, ...(stored ?? {}) };
}

/** Reads the preferences owned by `ownerDid`. Returns REAL with `null` when none are stored. */
export async function getAlertPreferences(
  rockId: string | number,
  ownerDid: string,
): Promise<Capability<UserAlertPreferences | null>> {
  const db = getDb();
  if (!db) return unavailable(NO_DATABASE_REASON);

  const key = String(rockId);
  const row = await db
    .select()
    .from(alertPreferences)
    .where(eq(alertPreferences.rockId, key))
    .get();

  if (!row) return real(null);
  if (row.ownerDid !== ownerDid) {
    return unavailable(`Alert preferences for rock ${key} belong to another account`);
  }

  return real({
    rockId: row.rockId,
    email: row.email ?? "",
    pushEnabled: row.pushEnabled,
    topics: coerceTopics(row.topics),
    updatedAt: new Date(row.updatedAt).toISOString(),
  });
}

/** Writes preferences. The first writer claims the rock; later writes must be the same DID. */
export async function saveAlertPreferences(
  rockId: string | number,
  ownerDid: string,
  email: string,
  pushEnabled: boolean,
  topics: Partial<AlertTopicsConfig>,
): Promise<Capability<UserAlertPreferences>> {
  const db = getDb();
  if (!db) return unavailable(NO_DATABASE_REASON);

  const key = String(rockId);
  const existing = await db
    .select()
    .from(alertPreferences)
    .where(eq(alertPreferences.rockId, key))
    .get();

  if (existing && existing.ownerDid !== ownerDid) {
    return unavailable(`Alert preferences for rock ${key} belong to another account`);
  }

  const merged: AlertTopicsConfig = { ...coerceTopics(existing?.topics), ...topics };
  const updatedAt = Date.now();
  const normalisedEmail = email.trim().toLowerCase();

  await db
    .insert(alertPreferences)
    .values({
      rockId: key,
      ownerDid,
      email: normalisedEmail || null,
      pushEnabled,
      topics: merged,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: alertPreferences.rockId,
      set: { email: normalisedEmail || null, pushEnabled, topics: merged, updatedAt },
    });

  logger.info("Saved alert preferences", {
    action: "ALERT_PREFERENCES_SAVED",
    rockId: key,
    email: normalisedEmail || "none",
    pushEnabled,
    activeTopicsCount: Object.values(merged).filter(Boolean).length,
  });

  return real({
    rockId: key,
    email: normalisedEmail,
    pushEnabled,
    topics: merged,
    updatedAt: new Date(updatedAt).toISOString(),
  });
}
