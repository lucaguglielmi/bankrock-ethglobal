CREATE TABLE `alert_preferences` (
	`rock_id` text PRIMARY KEY NOT NULL,
	`owner_did` text NOT NULL,
	`email` text,
	`push_enabled` integer DEFAULT false NOT NULL,
	`topics` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `contact_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contact_requests_created_at_idx` ON `contact_requests` (`created_at`);--> statement-breakpoint
CREATE TABLE `faucet_ip_claims` (
	`ip_hash` text PRIMARY KEY NOT NULL,
	`last_claim_timestamp` integer NOT NULL,
	`claim_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `nfc_counters` (
	`uid` text PRIMARY KEY NOT NULL,
	`counter` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
