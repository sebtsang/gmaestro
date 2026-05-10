CREATE TABLE `company_context` (
	`user_id` text PRIMARY KEY NOT NULL,
	`company_overview` text NOT NULL,
	`key_facts` text NOT NULL,
	`icps` text NOT NULL,
	`gtm_objectives` text NOT NULL,
	`updated_at` integer NOT NULL
);
