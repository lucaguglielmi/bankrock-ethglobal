CREATE TABLE `faucet_claims` (
	`wallet_address` text PRIMARY KEY NOT NULL,
	`last_claim_timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nfc_tags` (
	`uid` text PRIMARY KEY NOT NULL,
	`rock_id` text NOT NULL,
	`last_counter` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `yield_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`rock_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`tvl_usdc` real NOT NULL,
	`fees_earned_usdc` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rock_events_tx_hash_unique` ON `rock_events` (`tx_hash`);