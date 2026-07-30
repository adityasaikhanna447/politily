CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`scanned_count` integer DEFAULT 0 NOT NULL,
	`created_count` integer DEFAULT 0 NOT NULL,
	`triggered_count` integer DEFAULT 0 NOT NULL,
	`emailed_count` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text NOT NULL,
	`region` text DEFAULT 'global' NOT NULL,
	`category` text DEFAULT 'politics' NOT NULL,
	`priority` integer DEFAULT 50 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_checked_at` text
);
--> statement-breakpoint
CREATE TABLE `stories` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`url` text NOT NULL,
	`image_url` text,
	`article_excerpt` text,
	`source_name` text NOT NULL,
	`source_type` text DEFAULT 'web' NOT NULL,
	`source_country` text DEFAULT '' NOT NULL,
	`language` text DEFAULT '' NOT NULL,
	`published_at` text,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`novelty_score` integer DEFAULT 0 NOT NULL,
	`political_weight` integer DEFAULT 0 NOT NULL,
	`geopolitical_relevance` integer DEFAULT 0 NOT NULL,
	`viral_potential` integer DEFAULT 0 NOT NULL,
	`total_score` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'watching' NOT NULL,
	`brief_json` text,
	`script_text` text,
	`email_sent_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stories_fingerprint_unique` ON `stories` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `story_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`story_id` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`source_name` text NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
