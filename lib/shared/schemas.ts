/**
 * Zod runtime validators matching every type in lib/shared/types.ts.
 *
 * Used everywhere we cross a trust boundary:
 * - API route bodies
 * - LLM-produced JSON (Conductor / Manager structured output)
 * - Persona inputs/outputs
 *
 * Pivoted 2026-05-09 from GTM to content/blog/GEO domain. Legacy GTM schemas
 * (OutreachDraft, etc.) are retained at the bottom for DB-layer compat but
 * are NOT part of the active ApprovalArtifactType union.
 *
 * Owned by: Foundation. PARALLEL SESSIONS DO NOT MODIFY.
 */

import { z } from "zod";

// ----- enums -----

export const PersonaIdSchema = z.enum([
  // Content
  "researcher",
  "strategist",
  "writer",
  "geo-editor",
  "formatter",
  // Distribution
  "pipeline-reporter",
  "slack-digest",
  // Insight
  "feedback-tagger",
  "theme-synthesizer",
  "linear-filer",
]);

export const DepartmentSchema = z.enum(["content", "distribution", "insight"]);
export const LayerSchema = z.enum(["conductor", "manager", "specialist"]);
export const ModelTierSchema = z.enum(["opus", "sonnet", "haiku"]);

export const ToolkitIdSchema = z.enum([
  "github",
  "wordpress",
  "ghost",
  "notion",
  "reddit",
  "linkedin",
  "twitter",
]);

/** Single output target the founder picks at the run-input form. */
export const DestinationSchema = z.enum(["blog-html", "reddit", "x-thread"]);

/**
 * Voice fingerprint extracted from the company's existing blog posts.
 * Threaded into the Strategist + Writer prompts so the generated post
 * matches the company's actual voice. Computed mechanically — see
 * lib/personas/researcher/company-fetch.ts for the 10 extraction rules.
 */
export const VoiceFingerprintSchema = z.object({
  sentenceLength: z.object({
    mean: z.number(),
    stdev: z.number(),
  }),
  pronounMode: z.enum(["we", "i", "neutral"]),
  hookPattern: z.enum(["anomaly", "contrarian", "stat-led", "announcement"]),
  headingStyle: z.enum(["topical", "question", "named-concept"]),
  codeBlocksPerPost: z.number(),
  opinionDensity: z.number(),
  bannedWords: z.array(z.string()).default([]),
  closingPattern: z.enum(["single-line-punch", "wrapping-up", "cta-only"]),
  statDensity: z.number(),
  wordsPerSection: z.number(),
  samples: z.array(z.string()).default([]),
  productDescription: z.string().optional(),
  companyName: z.string().optional(),
});

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "edited",
  "rejected",
  "changes_requested",
  "expired",
]);

export const BlastRadiusSchema = z.enum([
  "internal",
  "external",
  "irreversible",
]);

export const ApprovalArtifactTypeSchema = z.enum([
  "TopicResearchBrief",
  "ContentOutline",
  "BlogDraft",
  "ChannelVariant",
  "PublishedArtifact",
]);

export const WorkflowStateSchema = z.enum([
  "planning",
  "running",
  "awaiting_approval",
  "done",
  "failed",
]);

export const NodeStatusSchema = z.enum([
  "pending",
  "running",
  "awaiting_approval",
  "done",
  "failed",
  "skipped",
]);

export const TriggerRuleSchema = z.enum(["all_success", "all_done"]);
export const FanoutSourceSchema = z.enum(["topics", "channels"]);
export const TaskModeSchema = z.enum(["fanout", "batch"]);

export const ActivityEventTypeSchema = z.enum([
  "persona_started",
  "tool_called",
  "artifact_created",
  "approval_requested",
  "approval_resolved",
  "persona_completed",
  "workflow_done",
]);

export const ConnectionStatusSchema = z.enum([
  "pending",
  "connected",
  "failed",
  "revoked",
]);

export const CitationSourceSchema = z.enum([
  "reddit",
  "twitter",
  "linkedin",
  "blog",
  "docs",
  "perplexity",
  "hackernews",
  "other",
]);

// ----- Citations + outline pieces (shared across content artifacts) -----

export const SourceCitationSchema = z.object({
  source: CitationSourceSchema,
  url: z.string().url(),
  title: z.string().optional(),
  excerpt: z.string().optional(),
});

export const TopicCandidateSchema = z.object({
  title: z.string(),
  angle: z.string(),
  rationale: z.string(),
  citations: z.array(SourceCitationSchema).default([]),
});

export const OutlineSectionSchema = z.object({
  heading: z.string(),
  keyPoints: z.array(z.string()).default([]),
  sourcesToCite: z.array(SourceCitationSchema).optional(),
});

// ----- Content artifact schemas (LLM outputs) -----
//
// id and *At timestamps are infra-side defaults so the model only has to
// produce semantic fields. Without defaults, every persona output failed
// validation because models can't fabricate uuids or timestamps reliably.

export const TopicResearchBriefSchema = z.object({
  id: z
    .string()
    .default(() => `tbrief_${Math.random().toString(36).slice(2, 10)}`),
  topic: z.string(),
  candidates: z.array(TopicCandidateSchema).default([]),
  recommendedTopic: z.string(),
  competitorScan: z
    .array(z.object({ url: z.string().url(), summary: z.string() }))
    .default([]),
  citationFootprint: z.string().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export const ContentOutlineSchema = z.object({
  id: z
    .string()
    .default(() => `outline_${Math.random().toString(36).slice(2, 10)}`),
  topicResearchBriefId: z.string().optional(),
  title: z.string(),
  thesis: z.string(),
  audience: z.string(),
  sections: z.array(OutlineSectionSchema).min(1),
  targetKeywords: z.array(z.string()).default([]),
  geoSignals: z.array(z.string()).default([]),
  estimatedWordCount: z.number().int().positive().default(1500),
  approvalStatus: ApprovalStatusSchema.default("pending"),
  createdAt: z.coerce.date().default(() => new Date()),
});

export const BlogDraftSchema = z.object({
  id: z
    .string()
    .default(() => `blog_${Math.random().toString(36).slice(2, 10)}`),
  outlineId: z.string().optional(),
  title: z.string(),
  slug: z.string(),
  excerpt: z.string(),
  // Accepts either a single markdown string OR an array of markdown sections
  // that the Writer can emit when long-form output (~2000 words) would
  // otherwise blow past the model's per-response max_tokens budget. The
  // transform joins sections with a blank line so downstream consumers (DB,
  // dashboard, GEO-Editor, Formatter) keep their `bodyMarkdown: string`
  // contract unchanged. Background: the previous failure mode was
  // "Unterminated string in JSON" mid-body when Kimi K2.6 hit its response
  // budget while emitting a single ~13KB JSON-escaped string.
  bodyMarkdown: z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v.join("\n\n") : v)),
  tags: z.array(z.string()).default([]),
  citations: z.array(SourceCitationSchema).default([]),
  geoNotes: z.array(z.string()).optional(),
  factDensityRatio: z.number().nonnegative().optional(),
  /**
   * Set at approval time (founder ticks targets). Not produced by the Writer
   * or GEO-Editor — it's appended to the persisted draft when the BlogDraft
   * approval resolves.
   */
  targets: z.array(ToolkitIdSchema).optional(),
  approvalStatus: ApprovalStatusSchema.default("pending"),
  founderEdits: z.string().nullable().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
});

export const ChannelVariantSchema = z.object({
  id: z
    .string()
    .default(() => `cv_${Math.random().toString(36).slice(2, 10)}`),
  blogDraftId: z.string(),
  target: ToolkitIdSchema,
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  approvalStatus: ApprovalStatusSchema.default("pending"),
  createdAt: z.coerce.date().default(() => new Date()),
});

export const PublishedArtifactSchema = z.object({
  id: z
    .string()
    .default(() => `pub_${Math.random().toString(36).slice(2, 10)}`),
  channelVariantId: z.string(),
  target: ToolkitIdSchema,
  externalUrl: z.string().url().optional(),
  externalId: z.string(),
  publishedAt: z.coerce.date().default(() => new Date()),
});

// ----- Batch envelope helpers (unchanged shape) -----

/**
 * Optional cross-item reasoning surface emitted by a batch persona. For the
 * content domain, the researcher's batch over topic candidates can flag
 * "merged groups" of duplicate or near-duplicate topics.
 */
export const MergedGroupSchema = z.object({
  ids: z.array(z.string()).min(2),
  reason: z.string(),
});
export type MergedGroup = z.infer<typeof MergedGroupSchema>;

/**
 * Per-item error row a batch persona emits when an integration fails or a
 * sub-call returns auth-required. Always carries the source-item id so the
 * dispatcher can correlate.
 */
export const BatchItemErrorSchema = z
  .object({ id: z.string(), error: z.string() })
  .passthrough();

/**
 * Batch envelope: one persona invocation produces an array of items keyed by
 * the source-item id. The dispatcher uses the keying field to unroll back into
 * per-instance chainOutputs so downstream fanout tasks see the matching item.
 */
export function makeBatchOutputSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(z.union([item, BatchItemErrorSchema])),
    mergedGroups: z.array(MergedGroupSchema).optional(),
  });
}

// ----- Approval gate -----

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  artifactType: ApprovalArtifactTypeSchema,
  artifactId: z.string(),
  blastRadius: BlastRadiusSchema,
  reason: z.string(),
  proposedAction: z.record(z.string(), z.unknown()),
  status: ApprovalStatusSchema,
  founderNotes: z.string().nullable().optional(),
  createdAt: z.date(),
  resolvedAt: z.date().nullable().optional(),
});

// ----- Workflow / DAG (CRITICAL: this is what the Conductor outputs as JSON) -----

export const WorkflowTaskSchema = z.object({
  id: z.string(),
  specialistId: PersonaIdSchema,
  input: z.record(z.string(), z.unknown()),
  dependsOn: z.array(z.string()).optional(),
  passOutput: z.array(z.string()).optional(),
  triggerRule: TriggerRuleSchema.optional(),
  fanoutOver: FanoutSourceSchema.optional(),
  mode: TaskModeSchema.optional(),
});

export const WorkflowDAGSchema = z.object({
  tasks: z.array(WorkflowTaskSchema),
  edges: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        artifactType: z.string(),
      }),
    )
    .optional(),
});

export const WorkflowRunSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  state: WorkflowStateSchema,
  plan: WorkflowDAGSchema.nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.date(),
  completedAt: z.date().nullable().optional(),
});

export const WorkflowNodeSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  layer: LayerSchema,
  persona: z.string(),
  status: NodeStatusSchema,
  inputArtifactIds: z.array(z.string()).nullable().optional(),
  outputArtifactIds: z.array(z.string()).nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  startedAt: z.date().nullable().optional(),
  completedAt: z.date().nullable().optional(),
});

export const ActivityEventSchema = z.object({
  id: z.string(),
  workflowRunId: z.string(),
  nodeId: z.string().nullable().optional(),
  type: ActivityEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  link: z.string().nullable().optional(),
  timestamp: z.date(),
});

export const VoiceSampleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  category: z.string(),
  body: z.string(),
  context: z.string().nullable().optional(),
  createdAt: z.date(),
});

export const FounderVoiceEditSchema = z.object({
  id: z.string(),
  userId: z.string(),
  approvalId: z.string(),
  personaId: PersonaIdSchema,
  originalDraft: z.string(),
  editedDraft: z.string(),
  capturedAt: z.date(),
});

export const ConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  toolkit: z.string(),
  connectedAccountId: z.string().nullable().optional(),
  status: ConnectionStatusSchema,
  errorMessage: z.string().nullable().optional(),
  createdAt: z.date(),
  connectedAt: z.date().nullable().optional(),
});

// ----- company context -----

export const IcpPrioritySchema = z.enum(["hot", "warm", "cold"]);

export const ICPProfileSchema = z.object({
  name: z.string().min(1),
  priority: IcpPrioritySchema,
  description: z.string(),
  industry: z.array(z.string()).default([]),
  companySizeRange: z.string().optional(),
  seniority: z.array(z.string()).default([]),
});

export const GtmMetricSchema = z.enum([
  "demos_booked",
  "qualified_hot_leads",
  "outreach_sent",
]);

export const GtmObjectiveSchema = z.object({
  metric: GtmMetricSchema,
  target: z.number().int().positive(),
  label: z.string().min(1),
  since: z.string().datetime().optional(),
});

export const CompanyContextSchema = z.object({
  userId: z.string(),
  companyOverview: z.string(),
  keyFacts: z.array(z.string()).default([]),
  icps: z.array(ICPProfileSchema).default([]),
  gtmObjectives: z.array(GtmObjectiveSchema).default([]),
  updatedAt: z.coerce.date().default(() => new Date()),
});

/** Body shape for PUT /api/context — userId + updatedAt are server-side. */
export const CompanyContextInputSchema = CompanyContextSchema.omit({
  userId: true,
  updatedAt: true,
});

// ----- API request schemas -----

/**
 * The 3-input form payload. Founder gives us a company URL (for voice +
 * product context), a docs URL (the topic source), and a single
 * destination. v1 also accepts a freeform `prompt` for backward compat —
 * if both are present, the structured fields win.
 */
export const RunWorkflowRequestSchema = z.object({
  companyUrl: z.string().url().optional(),
  docsUrl: z.string().url().optional(),
  destination: DestinationSchema.optional(),
  // Backward compat — older callers + the persona harness still send a prompt.
  prompt: z.string().min(1).max(10_000).optional(),
}).refine(
  (v) => (v.companyUrl && v.docsUrl && v.destination) || v.prompt,
  {
    message:
      "must provide either {companyUrl, docsUrl, destination} or a prompt string",
  },
);

export const ResolveApprovalRequestSchema = z.object({
  status: z.enum(["approved", "edited", "rejected", "changes_requested"]),
  edits: z.string().optional(),
  founderNotes: z.string().optional(),
  /**
   * Optional toolkit slug naming the integration the founder chose to dispatch
   * this approval through. Only honored when status === "approved" or "edited".
   * For BlogDraft approvals, the founder picks N targets via `targets` instead.
   */
  provider: z.string().optional(),
  /**
   * For BlogDraft approvals: which destinations to publish to. The dispatcher
   * fans out one ChannelVariant per target. Ignored on non-BlogDraft approvals.
   */
  targets: z.array(ToolkitIdSchema).optional(),
});

/**
 * Bulk approval payload: founder approves a batch of pending approvals from
 * a single workflow run with per-row reject overrides. Used for the
 * post-Formatter "approve all channel variants" flow.
 */
export const BulkResolveApprovalsRequestSchema = z.object({
  decisions: z
    .array(
      z.object({
        approvalId: z.string(),
        status: z.enum(["approved", "rejected"]),
        founderNotes: z.string().optional(),
      }),
    )
    .min(1)
    .max(500),
});

// ============================================================================
//  LEGACY GTM schemas — retained for DB-layer compat (legacy `leads`,
//  `outreach_drafts` tables). NOT part of the active ApprovalArtifactType
//  union. Will be removed once the DB schema migration lands.
// ============================================================================

export const LeadSourceSchema = z.enum([
  "inbound_form",
  "trial_signup",
  "manual_import",
]);

export const SenioritySchema = z.enum([
  "IC",
  "Manager",
  "Director",
  "VP",
  "CXO",
  "Founder",
]);

export const TierSchema = z.enum(["hot", "warm", "cold", "disqualified"]);
export const RecommendedActionSchema = z.enum([
  "book_call",
  "email_sequence",
  "self_serve",
  "reject",
]);
export const CallToActionSchema = z.enum([
  "book_call",
  "free_trial",
  "demo_video",
]);
export const OutreachChannelSchema = z.enum(["email", "linkedin"]);
export const StripeStatusSchema = z.enum(["trialing", "active", "churned"]);
export const ActivationChannelSchema = z.enum(["email", "in_app"]);

export const SocialPostSchema = z.object({
  platform: z.string(),
  content: z.string(),
  url: z.string().url(),
});

export const LeadSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  company: z.string().nullable().optional(),
  source: LeadSourceSchema,
  rawMessage: z.string().nullable().optional(),
  createdAt: z.date(),
});

export const EnrichedLeadSchema = z.object({
  id: z
    .string()
    .default(() => `enr_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  linkedinUrl: z.string().nullable().optional(),
  companyDomain: z.string().nullable().optional(),
  companySize: z.number().int().nullable().optional(),
  companyIndustry: z.string().nullable().optional(),
  personRole: z.string().nullable().optional(),
  personSeniority: SenioritySchema.nullable().optional(),
  intentSignals: z.array(z.string()).default([]),
  techStack: z.array(z.string()).nullable().optional(),
  recentSocial: z.array(SocialPostSchema).nullable().optional(),
  enrichedAt: z.coerce.date().default(() => new Date()),
});

export const QualifiedLeadSchema = z.object({
  id: z
    .string()
    .default(() => `qual_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  tier: TierSchema,
  fitScore: z.number().min(0).max(100),
  fitReasons: z.array(z.string()).default([]),
  intentScore: z.number().min(0).max(100),
  intentReasons: z.array(z.string()).default([]),
  recommendedAction: RecommendedActionSchema,
  qualifiedAt: z.coerce.date().default(() => new Date()),
});

export const OutreachStrategySchema = z.object({
  id: z
    .string()
    .default(() => `strat_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  tier: z.enum(["hot", "warm", "cold"]),
  angle: z.string(),
  toneGuide: z.string(),
  callToAction: CallToActionSchema,
  customHooks: z.array(z.string()).default([]),
  createdAt: z.coerce.date().default(() => new Date()),
});

export const OutreachDraftSchema = z.object({
  id: z
    .string()
    .default(() => `draft_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  channel: OutreachChannelSchema.default("email"),
  subject: z.string().nullable().optional(),
  body: z.string(),
  to: z.string().nullable().optional(),
  rationale: z.string().nullable().optional(),
  approvalStatus: ApprovalStatusSchema.default("pending"),
  founderEdits: z.string().nullable().optional(),
  createdAt: z.coerce.date().default(() => new Date()),
  sentAt: z.coerce.date().nullable().optional(),
});

export const BookedMeetingSchema = z.object({
  id: z
    .string()
    .default(() => `meet_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  startsAt: z.coerce.date(),
  durationMin: z.number().int().positive().default(30),
  meetingLink: z.string().url(),
  attendees: z.array(z.string()).default([]),
  bookedAt: z.coerce.date().default(() => new Date()),
});

export const PrepBriefSchema = z.object({
  id: z
    .string()
    .default(() => `brief_${Math.random().toString(36).slice(2, 10)}`),
  meetingId: z.string(),
  notionPageUrl: z.string().url(),
  leadSummary: z.string(),
  companyContext: z.string(),
  likelyUseCase: z.string(),
  similarPriorEmails: z.array(z.string()).default([]),
  talkingPoints: z.array(z.string()).default([]),
  questionsToAsk: z.array(z.string()).default([]),
  potentialObjections: z.array(z.string()).default([]),
  recommendedNextSteps: z.array(z.string()).default([]),
  createdAt: z.coerce.date().default(() => new Date()),
});

export const TrialSignalSchema = z.object({
  id: z.string(),
  leadId: z.string(),
  signupAt: z.date(),
  invitedTeammates: z.number().int().nonnegative(),
  featuresUsed: z.array(z.string()),
  stalledAtStep: z.string().nullable().optional(),
  stripeStatus: StripeStatusSchema,
  trialEndsAt: z.date().nullable().optional(),
});

export const ActivationNudgeSchema = z.object({
  id: z
    .string()
    .default(() => `act_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  channel: ActivationChannelSchema,
  subject: z.string().nullable().optional(),
  body: z.string(),
  loomScript: z.string().nullable().optional(),
  approvalStatus: ApprovalStatusSchema.default("pending"),
  createdAt: z.coerce.date().default(() => new Date()),
});
