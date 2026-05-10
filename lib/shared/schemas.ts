/**
 * Zod runtime validators matching every type in lib/shared/types.ts.
 *
 * Used everywhere we cross a trust boundary:
 * - API route bodies
 * - LLM-produced JSON (Conductor / Manager structured output)
 * - Persona inputs/outputs
 *
 * Owned by: Foundation. PARALLEL SESSIONS DO NOT MODIFY.
 */

import { z } from "zod";

// ----- enums -----

export const PersonaIdSchema = z.enum([
  "researcher",
  "qualifier",
  "strategist",
  "writer",
  "scheduler",
  "brief-writer",
  "activation",
  "crm-logger",
  "pipeline-reporter",
  "slack-digest",
  "feedback-tagger",
  "theme-synthesizer",
  "linear-filer",
]);

export const DepartmentSchema = z.enum(["sales", "cs", "revops", "insight"]);
export const LayerSchema = z.enum(["conductor", "manager", "specialist"]);
export const ModelTierSchema = z.enum(["opus", "sonnet", "haiku"]);

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
  "OutreachDraft",
  "ActivationNudge",
  "CRMUpdate",
  "CustomDeal",
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
export const FanoutSourceSchema = z.enum(["leads", "trial-signals"]);
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

// ----- entities -----

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

// LLM-only output schemas: id and *At timestamps are infra-side defaults so
// the model only has to produce semantic fields. Without defaults, every
// persona output failed validation because models can't fabricate uuids
// or timestamps reliably.
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

/**
 * Optional cross-lead reasoning surface emitted by the batch qualifier.
 * Indicates groups of leads the qualifier merged or flagged as duplicates
 * (e.g. multiple inbounds from the same company). Surfaced on the dashboard
 * as a small "merged N duplicates" badge on the qualifier stage card.
 */
export const MergedGroupSchema = z.object({
  leadIds: z.array(z.string()).min(2),
  reason: z.string(),
});
export type MergedGroup = z.infer<typeof MergedGroupSchema>;

/**
 * Per-item error row a batch persona emits when an integration fails or a
 * sub-call returns auth-required. Always carries the source-item id so the
 * dispatcher can correlate; downstream sees this as a failed shadow and
 * skip-cascade kicks in for that chain (other chains continue).
 */
export const BatchItemErrorSchema = z.union([
  z.object({ leadId: z.string(), error: z.string() }).passthrough(),
  z.object({ trialSignalId: z.string(), error: z.string() }).passthrough(),
]);

/**
 * Batch envelope: one persona invocation produces an array of items keyed by
 * the source-item id (`leadId` for leads-fanout, `trialSignalId` for trials).
 * The dispatcher uses the keying field to unroll back into per-instance
 * chainOutputs so downstream fanout tasks see the matching upstream item.
 *
 * Each item is EITHER a full success record (matching `item`) OR an error
 * row (just the id + error string). Error rows are the model's honest signal
 * that a sub-call failed — the dispatcher treats those instances as failed
 * (skip-cascade) while letting other instances proceed.
 */
export function makeBatchOutputSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(z.union([item, BatchItemErrorSchema])),
    mergedGroups: z.array(MergedGroupSchema).optional(),
  });
}

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
  // id, createdAt, approvalStatus are infra-side defaults — the LLM only
  // needs to produce content (leadId, channel, subject, body, to, rationale).
  // Defaults here mean a writer that emits just `{ leadId, channel, body }`
  // parses cleanly without forcing the model to fabricate uuids/timestamps.
  id: z
    .string()
    .default(() => `draft_${Math.random().toString(36).slice(2, 10)}`),
  leadId: z.string(),
  channel: OutreachChannelSchema.default("email"),
  subject: z.string().nullable().optional(),
  body: z.string(),
  // Recipient address (so the dashboard's post-approval send dispatcher
  // doesn't have to re-look-up the lead). Optional — writer should produce
  // it but legacy rows may not have it.
  to: z.string().nullable().optional(),
  // Writer's one-sentence "why this draft" — surfaced on the approval card
  // so the founder sees the reasoning at a glance.
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

// ----- workflow / DAG (CRITICAL: this is what the Conductor outputs as JSON) -----

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

export const RunWorkflowRequestSchema = z.object({
  prompt: z.string().min(1).max(10_000),
});

export const ResolveApprovalRequestSchema = z.object({
  status: z.enum(["approved", "edited", "rejected", "changes_requested"]),
  edits: z.string().optional(),
  founderNotes: z.string().optional(),
  /**
   * Optional toolkit slug (e.g. "gmail", "outlook") naming the integration the
   * founder chose to dispatch this approval through. Only honored when
   * status === "approved" or "edited" — rejections never trigger a Composio
   * call. Omit (or pass empty) to mark approved locally without any external
   * action.
   */
  provider: z.string().optional(),
});

/**
 * Bulk approval payload: founder approves a batch of pending approvals from
 * a single workflow run with per-row reject overrides.
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
