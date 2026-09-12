CREATE TABLE `indexer_cursors` (
	`id` text PRIMARY KEY NOT NULL,
	`last_block` text NOT NULL,
	`updated_at` integer NOT NULL
);
