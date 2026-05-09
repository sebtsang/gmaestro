CREATE TABLE `activation_nudges` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`loom_script` text,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`node_id` text,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`link` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `approval_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`artifact_id` text NOT NULL,
	`blast_radius` text NOT NULL,
	`reason` text NOT NULL,
	`proposed_action` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`founder_notes` text,
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `booked_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`starts_at` integer NOT NULL,
	`duration_min` integer NOT NULL,
	`meeting_link` text NOT NULL,
	`attendees` text NOT NULL,
	`booked_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`toolkit` text NOT NULL,
	`connected_account_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`connected_at` integer
);
--> statement-breakpoint
CREATE TABLE `enriched_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`linkedin_url` text,
	`company_domain` text,
	`company_size` integer,
	`company_industry` text,
	`person_role` text,
	`person_seniority` text,
	`intent_signals` text NOT NULL,
	`tech_stack` text,
	`recent_social` text,
	`enriched_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `founder_voice_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`approval_id` text NOT NULL,
	`persona_id` text NOT NULL,
	`original_draft` text NOT NULL,
	`edited_draft` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`approval_id`) REFERENCES `approval_requests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`source` text NOT NULL,
	`raw_message` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `outreach_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`channel` text NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`founder_edits` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `outreach_strategies` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`tier` text NOT NULL,
	`angle` text NOT NULL,
	`tone_guide` text NOT NULL,
	`call_to_action` text NOT NULL,
	`custom_hooks` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `prep_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`notion_page_url` text NOT NULL,
	`lead_summary` text NOT NULL,
	`company_context` text NOT NULL,
	`likely_use_case` text NOT NULL,
	`similar_prior_emails` text NOT NULL,
	`talking_points` text NOT NULL,
	`questions_to_ask` text NOT NULL,
	`potential_objections` text NOT NULL,
	`recommended_next_steps` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`meeting_id`) REFERENCES `booked_meetings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `qualified_leads` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`tier` text NOT NULL,
	`fit_score` real NOT NULL,
	`fit_reasons` text NOT NULL,
	`intent_score` real NOT NULL,
	`intent_reasons` text NOT NULL,
	`recommended_action` text NOT NULL,
	`qualified_at` integer NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trial_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`signup_at` integer NOT NULL,
	`invited_teammates` integer DEFAULT 0 NOT NULL,
	`features_used` text NOT NULL,
	`stalled_at_step` text,
	`stripe_status` text NOT NULL,
	`trial_ends_at` integer,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `voice_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`category` text NOT NULL,
	`body` text NOT NULL,
	`context` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workflow_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`workflow_run_id` text NOT NULL,
	`layer` text NOT NULL,
	`persona` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`input_artifact_ids` text,
	`output_artifact_ids` text,
	`error_message` text,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`workflow_run_id`) REFERENCES `workflow_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workflow_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt` text NOT NULL,
	`state` text DEFAULT 'planning' NOT NULL,
	`plan` text,
	`error_message` text,
	`started_at` integer NOT NULL,
	`completed_at` integer
);
