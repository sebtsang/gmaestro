CREATE TABLE `company_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`company_name` text,
	`one_liner` text,
	`product_description` text,
	`icp` text,
	`positioning` text,
	`voice_tone` text,
	`value_props` text,
	`competitors` text,
	`source_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
