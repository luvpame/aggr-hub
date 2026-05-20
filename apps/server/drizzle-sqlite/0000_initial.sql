PRAGMA foreign_keys = ON;--> statement-breakpoint
CREATE TABLE `feeds` (
  `id` text PRIMARY KEY NOT NULL,
  `url` text NOT NULL,
  `title` text,
  `site_url` text,
  `feed_type` text DEFAULT 'rss' NOT NULL,
  `description` text,
  `icon_url` text,
  `last_fetched_at` integer,
  `last_etag` text,
  `last_modified` text,
  `fetch_interval_minutes` integer DEFAULT 60 NOT NULL,
  `is_active` integer DEFAULT 1 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `feeds_url_unique` ON `feeds` (`url`);--> statement-breakpoint
CREATE TABLE `entries` (
  `id` text PRIMARY KEY NOT NULL,
  `feed_id` text NOT NULL,
  `title` text,
  `url` text,
  `content_html` text,
  `content_text` text,
  `author` text,
  `published_at` integer,
  `is_read` integer DEFAULT 0 NOT NULL,
  `is_favorite` integer DEFAULT 0 NOT NULL,
  `is_read_later` integer DEFAULT 0 NOT NULL,
  `guid` text NOT NULL,
  `og_image_url` text,
  `summary` text,
  `detailed_summary` text,
  `summary_status` text DEFAULT 'pending' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `entries_feed_guid_unique` ON `entries` (`feed_id`, `guid`);
