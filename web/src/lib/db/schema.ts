import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const rockEvents = sqliteTable('rock_events', {
  id: text('id').primaryKey(),
  rockId: text('rock_id').notNull(),
  eventType: text('event_type').notNull(), // 'AWAKEN', 'TRADE', 'TRANSFER'
  txHash: text('tx_hash').notNull(),
  amountUsdc: real('amount_usdc'),
  amountWeth: real('amount_weth'),
  timestamp: integer('timestamp').notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
});

export const subscribers = sqliteTable('subscribers', {
  email: text('email').primaryKey(),
  topics: text('topics', { mode: 'json' }).$type<string[]>(),
  createdAt: integer('created_at').notNull().default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`),
});
