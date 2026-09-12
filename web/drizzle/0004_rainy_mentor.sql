CREATE TABLE `handover_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`rock_id` text NOT NULL,
	`message_hash` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `handover_messages_rock_idx` ON `handover_messages` (`rock_id`);--> statement-breakpoint
CREATE TABLE `pending_userops` (
	`rock_id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`recipient` text,
	`user_op` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tag_bindings` (
	`uid_hash` text PRIMARY KEY NOT NULL,
	`rock_id` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
DROP INDEX `rock_events_tx_hash_unique`;--> statement-breakpoint
ALTER TABLE `rock_events` ADD `log_index` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `rock_events` ADD `block_number` text;--> statement-breakpoint
ALTER TABLE `rock_events` ADD `payload` text;--> statement-breakpoint
CREATE INDEX `rock_events_rock_id_idx` ON `rock_events` (`rock_id`,`timestamp`);