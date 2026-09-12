import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const rockEvents = sqliteTable('rock_events', {
  id: text('id').primaryKey(),
  rockId: text('rock_id').notNull(),
  eventType: text('event_type').notNull(), // 'AWAKEN', 'TRADE', 'TRANSFER'
  txHash: text('tx_hash').notNull().unique(), // Added unique constraint for idempotency
  amountUsdc: real('amount_usdc'),
  amountWeth: real('amount_weth'),
  timestamp: integer('timestamp').notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
});

export const rocks = sqliteTable('rocks', {
  id: text('id').primaryKey(),
  ownerAddress: text('owner_address'),
  vanityName: text('vanity_name').unique(),
  socialHandle: text('social_handle'),
  socialPlatform: text('social_platform'),
  createdAt: integer('created_at').notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
});

export const subscribers = sqliteTable('subscribers', {
  email: text('email').primaryKey(),
  topics: text('topics', { mode: 'json' }).$type<string[]>(),
  createdAt: integer('created_at').notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
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

export const faucetClaims = sqliteTable('faucet_claims', {
  walletAddress: text('wallet_address').primaryKey(),
  lastClaimTimestamp: integer('last_claim_timestamp').notNull(),
});
