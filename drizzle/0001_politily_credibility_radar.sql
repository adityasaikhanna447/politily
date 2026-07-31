ALTER TABLE `sources` ADD COLUMN `bias_lean` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD COLUMN `verification_method` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD COLUMN `language` text DEFAULT 'English' NOT NULL;--> statement-breakpoint
ALTER TABLE `sources` ADD COLUMN `source_lane` text DEFAULT 'portal' NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD COLUMN `sentiment_score` integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD COLUMN `scoring_breakdown_json` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `stories` ADD COLUMN `verification_method` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_sources` ADD COLUMN `bias_lean` text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_sources` ADD COLUMN `verification_method` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `story_sources` ADD COLUMN `source_lane` text DEFAULT 'portal' NOT NULL;
