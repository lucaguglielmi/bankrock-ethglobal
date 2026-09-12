import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const nowMs = sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`;

export const rockEvents = sqliteTable('rock_events', {
  id: text('id').primaryKey(),
  rockId: text('rock_id').notNull(),
  eventType: text('event_type').notNull(), // 'AWAKEN', 'TRADE', 'TRANSFER'
  txHash: text('tx_hash').notNull().unique(), // Added unique constraint for idempotency
  amountUsdc: real('amount_usdc'),
  amountWeth: real('amount_weth'),
  timestamp: integer('timestamp').notNull().default(nowMs),
});

export const rocks = sqliteTable('rocks', {
  id: text('id').primaryKey(),
  ownerAddress: text('owner_address'),
  vanityName: text('vanity_name').unique(),
  socialHandle: text('social_handle'),
  socialPlatform: text('social_platform'),
  createdAt: integer('created_at').notNull().default(nowMs),
});

export const subscribers = sqliteTable('subscribers', {
  email: text('email').primaryKey(),
  topics: text('topics', { mode: 'json' }).$type<string[]>(),
  createdAt: integer('created_at').notNull().default(nowMs),
});

export const yieldSnapshots = sqliteTable('yield_snapshots', {
  id: text('id').primaryKey(),
  rockId: text('rock_id').notNull(),
  timestamp: integer('timestamp').notNull(),
  tvlUsdc: real('tvl_usdc').notNull(),
  feesEarnedUsdc: real('fees_earned_usdc').notNull(),
});

export const nfcTags = sqliteTable('nfc_tags', {
  uid: text('uid').primaryKey(), // Physical tag ID
  rockId: text('rock_id').notNull(),
  lastCounter: integer('last_counter').notNull(),
});

/**
 * Durable, atomic NTAG 424 DNA read-counter store (D-018, spec 15 Phase 4 item 4).
 *
 * The NFC verifier owns the read/write path and uses raw D1 statements so the counter check is a
 * single conditional UPDATE. The table is declared here so it is created by a migration and has
 * one owner for its shape.
 */
export const nfcCounters = sqliteTable('nfc_counters', {
  uid: text('uid').primaryKey(),
  counter: integer('counter').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** Per-address faucet claims (SA-4, X-8). */
export const faucetClaims = sqliteTable('faucet_claims', {
  walletAddress: text('wallet_address').primaryKey(),
  lastClaimTimestamp: integer('last_claim_timestamp').notNull(),
});

/**
 * Per-IP faucet claims (X-8 — per-address limiting alone is defeated by fresh addresses).
 * The client IP is stored as a SHA-256 hash: it is a rate-limit key, not a user record.
 */
export const faucetIpClaims = sqliteTable('faucet_ip_claims', {
  ipHash: text('ip_hash').primaryKey(),
  lastClaimTimestamp: integer('last_claim_timestamp').notNull(),
  claimCount: integer('claim_count').notNull().default(0),
});

/**
 * Durable rate-limit buckets (SA-11). An in-memory Map on Workers is per-isolate and therefore
 * ineffective; buckets live here so every isolate sees the same counter.
 */
export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: integer('window_start').notNull(),
  count: integer('count').notNull(),
});

/**
 * Alert preferences (SA-5). Owned by the Privy DID that wrote them; a rock's preferences are
 * readable and writable only by that subject. Stored here rather than in memory because an
 * in-memory Map silently loses every preference on the next isolate (R-4).
 *
 * Delivery itself remains UNAVAILABLE (spec 15, Part 6): preferences persist, nothing dispatches.
 */
export const alertPreferences = sqliteTable('alert_preferences', {
  rockId: text('rock_id').primaryKey(),
  ownerDid: text('owner_did').notNull(),
  email: text('email'),
  pushEnabled: integer('push_enabled', { mode: 'boolean' }).notNull().default(false),
  topics: text('topics', { mode: 'json' }).$type<Record<string, boolean>>(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Shop contact requests — "Claim an OG Rock" and "Become a Sponsor" (S-6).
 * A success state may not be shown for a request that was not persisted here.
 */
export const contactRequests = sqliteTable(
  'contact_requests',
  {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(), // 'og_rock' | 'sponsor'
    name: text('name').notNull(),
    email: text('email').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('contact_requests_created_at_idx').on(table.createdAt)],
);
