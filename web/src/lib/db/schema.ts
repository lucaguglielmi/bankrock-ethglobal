import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const nowMs = sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`;

/**
 * Indexed registry events - the rock's provenance.
 *
 * `id` is `${txHash}-${logIndex}`, which is the natural key of a log and makes re-indexing
 * idempotent. The previous unique constraint on `tx_hash` alone was wrong: one transaction can
 * emit several events for the same rock - archiving a rock with a pending gift emits
 * `HandoverCancelled` and `RockArchived` together - and the second would have been silently
 * dropped.
 *
 * `event_type` is one of: awakened | handover_initiated | handover_claimed | handover_cancelled |
 * archived | marked_lost | lost_cleared. The old AWAKEN/TRADE/TRANSFER vocabulary is gone with
 * the contract revision that produced it.
 */
export const rockEvents = sqliteTable(
  'rock_events',
  {
    id: text('id').primaryKey(),
    rockId: text('rock_id').notNull(),
    eventType: text('event_type').notNull(),
    txHash: text('tx_hash').notNull(),
    logIndex: integer('log_index').notNull().default(0),
    blockNumber: text('block_number'),
    /** Free-form JSON with the decoded, non-indexed arguments. */
    payload: text('payload', { mode: 'json' }).$type<Record<string, string>>(),
    amountUsdc: real('amount_usdc'),
    amountWeth: real('amount_weth'),
    /** Unix milliseconds, from the block header. Never synthesized. */
    timestamp: integer('timestamp').notNull().default(nowMs),
  },
  (table) => [index('rock_events_rock_id_idx').on(table.rockId, table.timestamp)],
);

/**
 * How far the registry indexer has already scanned (B7).
 *
 * `lib/indexer.ts` mirrors every decoded registry event into `rock_events`, but before this
 * table it never read that mirror back: each poll re-scanned from `REGISTRY_DEPLOY_BLOCK` to the
 * head, in 2,000-block chunks, every fifteen seconds, for every rock anyone was looking at. The
 * cursor makes the scan resumable - after the first pass a poll asks only for the blocks that
 * are new.
 *
 * `id` is the scope, `chain:<chainId>:registry:<address>`, so a redeployed registry or a
 * different chain starts its own cursor instead of inheriting a stranger's progress. `last_block`
 * is TEXT holding a decimal integer, the same shape `rock_events.block_number` uses, and the
 * conditional UPDATE casts it so the cursor can only ever move forward.
 *
 * The indexer owns the read/write path and uses raw D1 statements for that one conditional
 * update; the table is declared here so it is created by a migration and has one owner for its
 * shape (the `nfc_counters` precedent).
 */
export const indexerCursors = sqliteTable('indexer_cursors', {
  id: text('id').primaryKey(),
  lastBlock: text('last_block').notNull(),
  updatedAt: integer('updated_at').notNull(),
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
 * Per-IP faucet claims (X-8 - per-address limiting alone is defeated by fresh addresses).
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
  topics: text('topics', { mode: 'json' }).$type<Record<string, { push: boolean; email: boolean } | boolean>>(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Shop contact requests - "Claim an OG Rock" and "Become a Sponsor" (S-6).
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

/**
 * Tag -> rock binding, maintained off chain (spec 06, R-7).
 *
 * The registry is the authority: `rockIdForUid(uidHash)` is the truth, and archiving releases the
 * tag there. This table is a cache written after a successful awaken and cleared after an
 * archive, so a tap can be routed to the right rock without a chain read on the critical path.
 * It stores `keccak256(uid)`, never the UID: the raw UID is a stable physical identifier and does
 * not belong in a database (SA-2).
 */
export const tagBindings = sqliteTable('tag_bindings', {
  uidHash: text('uid_hash').primaryKey(),
  rockId: text('rock_id').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * Gift messages (Flow E).
 *
 * Only `keccak256(message)` goes on chain. The plaintext lives here so the recipient can read it
 * after claiming, and so the hash on chain can be checked against it.
 */
export const handoverMessages = sqliteTable(
  'handover_messages',
  {
    /** `${rockId}:${messageHash}` - one message per handover attempt. */
    id: text('id').primaryKey(),
    rockId: text('rock_id').notNull(),
    messageHash: text('message_hash').notNull(),
    message: text('message').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('handover_messages_rock_idx').on(table.rockId)],
);

/**
 * UserOperations signed ahead of time and held until the event that needs them.
 *
 * Currently one kind: `swap_owner`, the Safe owner rotation a giver pre-signs when opening a
 * handover, submitted by the claim route once the registry has accepted the recipient's
 * attestation (see lib/rock-account.server.ts). One row per rock: a new handover replaces the
 * previous operation, and cancelling deletes it.
 */
export const pendingUserOps = sqliteTable('pending_userops', {
  rockId: text('rock_id').primaryKey(),
  kind: text('kind').notNull(),
  /**
   * The Privy DID that stored this operation (audit P-5).
   *
   * Only that DID may overwrite or discard it. Without this column any signed-in account could
   * delete another rock's pre-signed Safe owner swap - the recipient would then get the registry
   * claim and never the Rock Account.
   */
  creatorDid: text('creator_did'),
  recipient: text('recipient'),
  /** The serialised, signed UserOperation, exactly as it will be sent to the bundler. */
  userOp: text('user_op', { mode: 'json' }).$type<Record<string, string>>().notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * Web Push subscriptions (spec 14 §4.9 / Phase 2).
 *
 * `endpoint` is the browser push service URL and is unique per device/browser, so it is the
 * natural primary key - the same shape `ON CONFLICT(endpoint) DO UPDATE` used before. `userDid`
 * is the Privy DID that registered the subscription (never a client-supplied `userId`, SA-5): the
 * subscribe and unsubscribe routes require a verified Privy access token and store the identity
 * the token names, not one the caller asserts.
 */
export const pushSubscriptions = sqliteTable('push_subscriptions', {
  endpoint: text('endpoint').primaryKey(),
  rockId: text('rock_id'),
  userDid: text('user_did').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  createdAt: integer('created_at').notNull(),
});

/**
 * What the relayer has spent today (audit P-1).
 *
 * `POST /api/rocks/[id]/claim` broadcasts from a funded key on the strength of an attestation, so
 * the only bound on that spend is a cap someone sets. It is accumulated here, per UTC day, and
 * checked *before* the transaction is sent - a cap consulted afterwards is a report, not a cap.
 *
 * `wei` is TEXT holding a decimal integer: wei does not fit a JS `number`, and SQLite's INTEGER is
 * 64-bit, which a cap above ~9.2 ETH would overflow. The arithmetic is done in SQL with a CAST, so
 * `relayerDailyCapWei()` refuses a cap that does not fit rather than silently wrapping.
 */
export const relayerSpend = sqliteTable('relayer_spend', {
  /** `YYYY-MM-DD`, UTC. */
  day: text('day').primaryKey(),
  wei: text('wei').notNull(),
  updatedAt: integer('updated_at').notNull(),
});
