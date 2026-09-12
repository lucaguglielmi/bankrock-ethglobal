CREATE TABLE `rock_events` (
	`id` text PRIMARY KEY NOT NULL,
	`rock_id` text NOT NULL,
	`event_type` text NOT NULL,
	`tx_hash` text NOT NULL,
	`amount_usdc` real,
	`amount_weth` real,
	`timestamp` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscribers` (
	`email` text PRIMARY KEY NOT NULL,
	`topics` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
