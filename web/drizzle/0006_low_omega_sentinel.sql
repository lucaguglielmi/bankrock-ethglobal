CREATE TABLE `relayer_spend` (
	`day` text PRIMARY KEY NOT NULL,
	`wei` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `pending_userops` ADD `creator_did` text;