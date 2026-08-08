CREATE TABLE IF NOT EXISTS `email_digests` (
  `id` text PRIMARY KEY NOT NULL,
  `digest_key` text NOT NULL,
  `slot` text NOT NULL,
  `sent_at` text NOT NULL,
  `start_iso` text NOT NULL,
  `end_iso` text NOT NULL,
  `issue_count` integer DEFAULT 0 NOT NULL,
  `story_count` integer DEFAULT 0 NOT NULL,
  `message` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `email_digests_digest_key_unique` ON `email_digests` (`digest_key`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `email_digests_sent_at_idx` ON `email_digests` (`sent_at` DESC);
