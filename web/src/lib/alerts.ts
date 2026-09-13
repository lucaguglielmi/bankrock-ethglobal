/**
 * Alert preferences (N-9, SA-5, privacy).
 *
 *  - preferences live in D1, not in a per-isolate `Map`. The old store lost every preference on
 *    the next isolate while telling the user it had saved them (R-4);
 *  - a rock's preferences belong to the Privy DID that first wrote them. Anyone else reading or
 *    writing them gets a refusal - the previous route let any anonymous caller read back the
 *    owner's stored email address for any rockId (SA-5);
 *  - with no database, saving is UNAVAILABLE. A success state is never shown for something that
 *    was not persisted;
 *  - every topic carries two channels, browser (`push`) and `email`. The column is JSON, so the
 *    move from one boolean per topic needs no migration: `coerceTopics` reads both shapes and
 *    maps an old `true` to both channels on, an old `false` to both off.
 *
 * Delivery remains UNAVAILABLE by decision (spec 15, Part 6): preferences persist, nothing
 * dispatches. There is no event-to-delivery pipeline and this module does not pretend otherwise.
 */

import { eq } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { alertPreferences } from "@/lib/db/schema";
import { real, unavailable, type Capability } from "@/lib/demo";
import { logger } from "@/lib/telemetry";

export const ALERT_TOPIC_IDS = [
  "loss_warning",
  "dangerous_trade",
  "profit_milestone",
  "custody_transfer",
  "gas_depletion",
  "genesis_drop",
] as const;

export type AlertTopicId = (typeof ALERT_TOPIC_IDS)[number];

export const ALERT_CHANNELS = ["push", "email"] as const;

/** `push` is a browser notification on a device that allowed them; `email` is a message. */
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export type AlertTopicChannels = { push: boolean; email: boolean };

/** A plain object type, not an interface: Drizzle's json column needs the implicit index signature. */
export type AlertTopicsConfig = {
  loss_warning: AlertTopicChannels;
  dangerous_trade: AlertTopicChannels;
  profit_milestone: AlertTopicChannels;
  custody_transfer: AlertTopicChannels;
  gas_depletion: AlertTopicChannels;
  genesis_drop: AlertTopicChannels;
};

export const DEFAULT_ALERT_TOPICS: AlertTopicsConfig = {
  loss_warning: { push: true, email: true },
  dangerous_trade: { push: true, email: true },
  profit_milestone: { push: true, email: true },
  custody_transfer: { push: true, email: true },
  gas_depletion: { push: false, email: false },
  genesis_drop: { push: true, email: true },
};

export interface UserAlertPreferences {
  rockId: string;
  email: string;
  pushEnabled: boolean;
  topics: AlertTopicsConfig;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One topic's stored value in either shape, resolved against its default.
 *
 *  - `true` / `false` (the original one-tick form) → both channels on / both off;
 *  - `{ push, email }` → each boolean kept, a missing or malformed channel falls back to the
 *    default for that topic;
 *  - anything else → the default.
 */
function coerceChannels(value: unknown, fallback: AlertTopicChannels): AlertTopicChannels {
  if (typeof value === "boolean") return { push: value, email: value };
  if (isRecord(value)) {
    return {
      push: typeof value.push === "boolean" ? value.push : fallback.push,
      email: typeof value.email === "boolean" ? value.email : fallback.email,
    };
  }
  return { ...fallback };
}

/**
 * Turns whatever the JSON column holds into the current shape. Old rows with one boolean per topic
 * are mapped channel-for-channel (`true` → both on, `false` → both off), missing topics take their
 * default, and unknown keys are dropped.
 */
export function coerceTopics(stored: unknown): AlertTopicsConfig {
  const source = isRecord(stored) ? stored : {};
  const result = {} as AlertTopicsConfig;
  for (const id of ALERT_TOPIC_IDS) {
    result[id] = coerceChannels(source[id], DEFAULT_ALERT_TOPICS[id]);
  }
  return result;
}

export type TopicsInputResult =
  | { ok: true; topics: Partial<AlertTopicsConfig> }
  | { ok: false; error: string };

/**
 * Validates the `topics` field of a write. Every topic is optional; a topic that is present must be
 * `{ push: boolean, email: boolean }`. Unknown topic keys are ignored, anything else is refused so
 * the caller can answer 400 rather than store a shape `coerceTopics` would have to paper over.
 */
export function parseTopicsInput(input: unknown): TopicsInputResult {
  if (input === undefined || input === null) return { ok: true, topics: {} };
  if (!isRecord(input)) return { ok: false, error: "topics must be an object" };

  const topics: Partial<AlertTopicsConfig> = {};
  for (const id of ALERT_TOPIC_IDS) {
    if (!(id in input)) continue;
    const value = input[id];
    if (
      !isRecord(value) ||
      typeof value.push !== "boolean" ||
      typeof value.email !== "boolean"
    ) {
      return { ok: false, error: `topics.${id} must be { push: boolean, email: boolean }` };
    }
    topics[id] = { push: value.push, email: value.email };
  }
  return { ok: true, topics };
}

/** Number of topics with the given channel on - the figure the save log records. */
function countOn(topics: AlertTopicsConfig, channel: AlertChannel): number {
  return ALERT_TOPIC_IDS.filter((id) => topics[id][channel]).length;
}

/**
 * The schema still declares the column as it was first written, one boolean per topic. The JSON
 * now holds a `{ push, email }` pair per topic and `coerceTopics` reads both, so the mismatch is
 * confined to this one cast at the write boundary.
 */
type StoredTopics = NonNullable<typeof alertPreferences.$inferInsert.topics>;
function toStored(topics: AlertTopicsConfig): StoredTopics {
  return topics as unknown as StoredTopics;
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

/**
 * Writes preferences. The first writer claims the rock; later writes must be the same DID.
 *
 * TEMPORARY - WILL BE FIXED BEFORE MAINNET (security review 2026-09-13, R-3): a Privy DID is not
 * the rock's owner, so any signed-in account can claim the preferences row of any rock before its
 * owner does. Before mainnet, bind writes to the on-chain owner (wallet signature or Privy
 * linked-wallet lookup) and make the ownership check part of the upsert itself
 * (`… ON CONFLICT DO UPDATE … WHERE owner_did = ?`) so two first writers cannot race.
 */
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
      topics: toStored(merged),
      updatedAt,
    })
    .onConflictDoUpdate({
      target: alertPreferences.rockId,
      set: { email: normalisedEmail || null, pushEnabled, topics: toStored(merged), updatedAt },
    });

  logger.info("Saved alert preferences", {
    action: "ALERT_PREFERENCES_SAVED",
    rockId: key,
    email: normalisedEmail || "none",
    pushEnabled,
    pushTopicsCount: countOn(merged, "push"),
    emailTopicsCount: countOn(merged, "email"),
  });

  return real({
    rockId: key,
    email: normalisedEmail,
    pushEnabled,
    topics: merged,
    updatedAt: new Date(updatedAt).toISOString(),
  });
}
