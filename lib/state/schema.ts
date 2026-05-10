/**
 * Drizzle SQLite schema for GMaestro local state.
 *
 * One file per table is overkill for hackathon scope; everything lives here.
 * Field names mirror lib/shared/types.ts as 1:1 as practical (camelCase in TS,
 * snake_case in DB).
 *
 * Owned by: Foundation. Frozen after initial scaffold; new fields added by
 * the human conductor on `main`, not by parallel sessions.
 */

import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// ----- helpers -----

const id = () => text("id").primaryKey();
const ts = (name: string) =>
  integer(name, { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const optTs = (name: string) => integer(name, { mode: "timestamp_ms" });

// ----- Composio connections -----
//
// Intentionally NOT mirrored locally. Composio is the source of truth for
// connection state — see `lib/tools/connections.ts` for the live read path.
// The previous local `connections` table caused a class of bugs (casing
// duplicates, stale rows surviving reconnects, status-enum drift) and was
// removed via the 0002_drop_connections migration.

// ----- leads & sales pipeline -----

export const leads = sqliteTable("leads", {
  id: id(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  company: text("company"),
  source: text("source", {
    enum: ["inbound_form", "trial_signup", "manual_import"],
  }).notNull(),
  rawMessage: text("raw_message"),
  createdAt: ts("created_at"),
});

export const enrichedLeads = sqliteTable("enriched_leads", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  linkedinUrl: text("linkedin_url"),
  companyDomain: text("company_domain"),
  companySize: integer("company_size"),
  companyIndustry: text("company_industry"),
  personRole: text("person_role"),
  personSeniority: text("person_seniority", {
    enum: ["IC", "Manager", "Director", "VP", "CXO", "Founder"],
  }),
  intentSignals: text("intent_signals", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  techStack: text("tech_stack", { mode: "json" }).$type<string[]>(),
  recentSocial: text("recent_social", { mode: "json" }).$type<
    Array<{ platform: string; content: string; url: string }>
  >(),
  enrichedAt: ts("enriched_at"),
});

export const qualifiedLeads = sqliteTable("qualified_leads", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tier: text("tier", {
    enum: ["hot", "warm", "cold", "disqualified"],
  }).notNull(),
  fitScore: real("fit_score").notNull(),
  fitReasons: text("fit_reasons", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  intentScore: real("intent_score").notNull(),
  intentReasons: text("intent_reasons", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  recommendedAction: text("recommended_action", {
    enum: ["book_call", "email_sequence", "self_serve", "reject"],
  }).notNull(),
  qualifiedAt: ts("qualified_at"),
});

export const outreachStrategies = sqliteTable("outreach_strategies", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  tier: text("tier", { enum: ["hot", "warm", "cold"] }).notNull(),
  angle: text("angle").notNull(),
  toneGuide: text("tone_guide").notNull(),
  callToAction: text("call_to_action", {
    enum: ["book_call", "free_trial", "demo_video"],
  }).notNull(),
  customHooks: text("custom_hooks", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  createdAt: ts("created_at"),
});

export const outreachDrafts = sqliteTable("outreach_drafts", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["email", "linkedin"] }).notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  approvalStatus: text("approval_status", {
    enum: ["pending", "approved", "edited", "rejected"],
  })
    .notNull()
    .default("pending"),
  founderEdits: text("founder_edits"),
  createdAt: ts("created_at"),
  sentAt: optTs("sent_at"),
});

export const bookedMeetings = sqliteTable("booked_meetings", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
  durationMin: integer("duration_min").notNull(),
  meetingLink: text("meeting_link").notNull(),
  attendees: text("attendees", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  bookedAt: ts("booked_at"),
});

export const prepBriefs = sqliteTable("prep_briefs", {
  id: id(),
  meetingId: text("meeting_id")
    .notNull()
    .references(() => bookedMeetings.id, { onDelete: "cascade" }),
  notionPageUrl: text("notion_page_url").notNull(),
  leadSummary: text("lead_summary").notNull(),
  companyContext: text("company_context").notNull(),
  likelyUseCase: text("likely_use_case").notNull(),
  similarPriorEmails: text("similar_prior_emails", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  talkingPoints: text("talking_points", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  questionsToAsk: text("questions_to_ask", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  potentialObjections: text("potential_objections", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  recommendedNextSteps: text("recommended_next_steps", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  createdAt: ts("created_at"),
});

// ----- CS / activation -----

export const trialSignals = sqliteTable("trial_signals", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  signupAt: integer("signup_at", { mode: "timestamp_ms" }).notNull(),
  invitedTeammates: integer("invited_teammates").notNull().default(0),
  featuresUsed: text("features_used", { mode: "json" })
    .notNull()
    .$type<string[]>(),
  stalledAtStep: text("stalled_at_step"),
  stripeStatus: text("stripe_status", {
    enum: ["trialing", "active", "churned"],
  }).notNull(),
  trialEndsAt: optTs("trial_ends_at"),
});

export const activationNudges = sqliteTable("activation_nudges", {
  id: id(),
  leadId: text("lead_id")
    .notNull()
    .references(() => leads.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["email", "in_app"] }).notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  loomScript: text("loom_script"),
  approvalStatus: text("approval_status", {
    enum: ["pending", "approved", "edited", "rejected"],
  })
    .notNull()
    .default("pending"),
  createdAt: ts("created_at"),
});

// ----- approvals -----

export const approvalRequests = sqliteTable("approval_requests", {
  id: id(),
  workflowRunId: text("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  artifactType: text("artifact_type", {
    enum: [
      "TopicResearchBrief",
      "ContentOutline",
      "BlogDraft",
      "ChannelVariant",
      "PublishedArtifact",
    ],
  }).notNull(),
  artifactId: text("artifact_id").notNull(),
  blastRadius: text("blast_radius", {
    enum: ["internal", "external", "irreversible"],
  }).notNull(),
  reason: text("reason").notNull(),
  proposedAction: text("proposed_action", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  status: text("status", {
    enum: [
      "pending",
      "approved",
      "edited",
      "rejected",
      "changes_requested",
      "expired",
    ],
  })
    .notNull()
    .default("pending"),
  founderNotes: text("founder_notes"),
  createdAt: ts("created_at"),
  resolvedAt: optTs("resolved_at"),
});

// ----- workflow / orchestration -----

export const workflowRuns = sqliteTable("workflow_runs", {
  id: id(),
  prompt: text("prompt").notNull(),
  /** Short LLM-generated label (4–6 words). Null until the title job lands. */
  title: text("title"),
  state: text("state", {
    enum: ["planning", "running", "awaiting_approval", "done", "failed"],
  })
    .notNull()
    .default("planning"),
  plan: text("plan", { mode: "json" }).$type<unknown>(),
  errorMessage: text("error_message"),
  startedAt: ts("started_at"),
  completedAt: optTs("completed_at"),
});

export const workflowNodes = sqliteTable("workflow_nodes", {
  id: id(),
  workflowRunId: text("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  layer: text("layer", {
    enum: ["conductor", "manager", "specialist"],
  }).notNull(),
  persona: text("persona").notNull(),
  status: text("status", {
    enum: [
      "pending",
      "running",
      "awaiting_approval",
      "done",
      "failed",
      "skipped",
    ],
  })
    .notNull()
    .default("pending"),
  inputArtifactIds: text("input_artifact_ids", { mode: "json" }).$type<
    string[]
  >(),
  outputArtifactIds: text("output_artifact_ids", { mode: "json" }).$type<
    string[]
  >(),
  errorMessage: text("error_message"),
  skippedReason: text("skipped_reason"),
  startedAt: optTs("started_at"),
  completedAt: optTs("completed_at"),
});

export const activityEvents = sqliteTable("activity_events", {
  id: id(),
  workflowRunId: text("workflow_run_id")
    .notNull()
    .references(() => workflowRuns.id, { onDelete: "cascade" }),
  nodeId: text("node_id"),
  type: text("type", {
    enum: [
      "persona_started",
      "tool_called",
      "artifact_created",
      "approval_requested",
      "approval_resolved",
      "persona_completed",
      "workflow_done",
    ],
  }).notNull(),
  payload: text("payload", { mode: "json" })
    .notNull()
    .$type<Record<string, unknown>>(),
  link: text("link"),
  timestamp: ts("timestamp"),
});

// ----- voice memory -----

export const voiceSamples = sqliteTable("voice_samples", {
  id: id(),
  userId: text("user_id").notNull(),
  category: text("category").notNull(), // e.g., "cold_email_intro", "discovery_followup"
  body: text("body").notNull(),
  context: text("context"), // e.g., "to a CTO at a Series A B2B SaaS"
  createdAt: ts("created_at"),
});

export const founderVoiceEdits = sqliteTable("founder_voice_edits", {
  id: id(),
  userId: text("user_id").notNull(),
  approvalId: text("approval_id")
    .notNull()
    .references(() => approvalRequests.id, { onDelete: "cascade" }),
  personaId: text("persona_id").notNull(),
  originalDraft: text("original_draft").notNull(),
  editedDraft: text("edited_draft").notNull(),
  capturedAt: ts("captured_at"),
});

// ----- type exports for downstream code -----

export type Lead = typeof leads.$inferSelect;
export type LeadInsert = typeof leads.$inferInsert;
export type EnrichedLead = typeof enrichedLeads.$inferSelect;
export type EnrichedLeadInsert = typeof enrichedLeads.$inferInsert;
export type QualifiedLead = typeof qualifiedLeads.$inferSelect;
export type QualifiedLeadInsert = typeof qualifiedLeads.$inferInsert;
export type OutreachStrategy = typeof outreachStrategies.$inferSelect;
export type OutreachDraft = typeof outreachDrafts.$inferSelect;
export type OutreachDraftInsert = typeof outreachDrafts.$inferInsert;
export type BookedMeeting = typeof bookedMeetings.$inferSelect;
export type PrepBrief = typeof prepBriefs.$inferSelect;
export type TrialSignal = typeof trialSignals.$inferSelect;
export type ActivationNudge = typeof activationNudges.$inferSelect;
export type ApprovalRequest = typeof approvalRequests.$inferSelect;
export type ApprovalRequestInsert = typeof approvalRequests.$inferInsert;
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type WorkflowNode = typeof workflowNodes.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type VoiceSample = typeof voiceSamples.$inferSelect;
export type FounderVoiceEdit = typeof founderVoiceEdits.$inferSelect;
