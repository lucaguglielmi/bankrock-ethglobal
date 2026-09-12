CREATE TABLE `rocks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_address` text,
	`vanity_name` text,
	`social_handle` text,
	`social_platform` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rocks_vanity_name_unique` ON `rocks` (`vanity_name`);