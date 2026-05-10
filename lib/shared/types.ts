/**
 * GMaestro shared type contracts.
 *
 * Owned by: Foundation. PARALLEL SESSIONS DO NOT MODIFY.
 * If a session needs a new type, raise it with the human conductor.
 *
 * These types intentionally MIRROR the Drizzle schema in lib/state/schema.ts
 * with some hand-tweaks (e.g., camelCase, narrower string literal unions).
 * Drizzle's $inferSelect is the canonical row shape; these are the runtime
 * "domain" shapes used between layers.
 */

// ============================================================================
//  Personas — exactly 13. Health Monitor was dropped per audit (overlapped
//  with Activation). DO NOT add new personas without updating registry, scopes,
//  prompts, and CLAUDE.md.
// ============================================================================

export type PersonaId =
  // Sales department
  | "researcher"
  | "qualifier"
  | "strategist"
  | "writer"
  | "scheduler"
  | "brief-writer"
  // CS department
  | "activation"
  // RevOps department
  | "crm-logger"
  | "pipeline-reporter"
  | "slack-digest"
  // Insight department
  | "feedback-tagger"
  | "theme-synthesizer"
  | "linear-filer";

export type Department = "sales" | "cs" | "revops" | "insight";
export type Layer = "conductor" | "manager" | "specialist";
export type ModelTier = "opus" | "sonnet" | "haiku";

export interface Persona {
  id: PersonaId;
  layer: Layer;
  department: Department;
  systemPromptPath: string;
  /** Composio action names WITHOUT the `mcp__composio__` prefix. */
  allowedActions: string[];
  modelTier: ModelTier;
  maxConcurrency: number;
}

// ============================================================================
//  Lead pipeline artifacts
// ============================================================================

export type LeadSource = "inbound_form" | "trial_signup" | "manual_import";

export interface Lead {
  id: string;
  email: string;
  name: string;
  company?: string | null;
  source: LeadSource;
  rawMessage?: string | null;
  createdAt: Date;
}

export type Seniority = "IC" | "Manager" | "Director" | "VP" | "CXO" | "Founder";

export interface SocialPost {
  platform: string;
  content: string;
  url: string;
}

export interface EnrichedLead {
  id: string;
  leadId: string;
  linkedinUrl?: string | null;
  companyDomain?: string | null;
  companySize?: number | null;
  companyIndustry?: string | null;
  personRole?: string | null;
  personSeniority?: Seniority | null;
  intentSignals: string[];
  techStack?: string[] | null;
  recentSocial?: SocialPost[] | null;
  enrichedAt: Date;
}

export type Tier = "hot" | "warm" | "cold" | "disqualified";
export type RecommendedAction =
  | "book_call"
  | "email_sequence"
  | "self_serve"
  | "reject";

export interface QualifiedLead {
  id: string;
  leadId: string;
  tier: Tier;
  fitScore: number;
  fitReasons: string[];
  intentScore: number;
  intentReasons: string[];
  recommendedAction: RecommendedAction;
  qualifiedAt: Date;
}

export type CallToAction = "book_call" | "free_trial" | "demo_video";

export interface OutreachStrategy {
  id: string;
  leadId: string;
  tier: Exclude<Tier, "disqualified">;
  angle: string;
  toneGuide: string;
  callToAction: CallToAction;
  customHooks: string[];
  createdAt: Date;
}

export type OutreachChannel = "email" | "linkedin";

export interface OutreachDraft {
  id: string;
  leadId: string;
  channel: OutreachChannel;
  subject?: string | null;
  body: string;
  /** Recipient address (email or LinkedIn handle). Carried inline so the
   *  dashboard's post-approval send dispatcher doesn't need to re-look-up
   *  the lead record. Optional for backward compat with older rows. */
  to?: string | null;
  /** One-sentence why-this-draft explanation the writer produces alongside
   *  the email. Shown on the approval card so the founder sees the writer's
   *  reasoning at a glance instead of having to read upstream outputs. */
  rationale?: string | null;
  approvalStatus: ApprovalStatus;
  founderEdits?: string | null;
  createdAt: Date;
  sentAt?: Date | null;
}

export interface BookedMeeting {
  id: string;
  leadId: string;
  startsAt: Date;
  durationMin: number;
  meetingLink: string;
  attendees: string[];
  bookedAt: Date;
}

export interface PrepBrief {
  id: string;
  meetingId: string;
  notionPageUrl: string;
  leadSummary: string;
  companyContext: string;
  likelyUseCase: string;
  similarPriorEmails: string[];
  talkingPoints: string[];
  questionsToAsk: string[];
  potentialObjections: string[];
  recommendedNextSteps: string[];
  createdAt: Date;
}

// ============================================================================
//  Trial / activation artifacts
// ============================================================================

export type StripeStatus = "trialing" | "active" | "churned";

export interface TrialSignal {
  id: string;
  leadId: string;
  signupAt: Date;
  invitedTeammates: number;
  featuresUsed: string[];
  stalledAtStep?: string | null;
  stripeStatus: StripeStatus;
  trialEndsAt?: Date | null;
}

export type ActivationChannel = "email" | "in_app";

export interface ActivationNudge {
  id: string;
  leadId: string;
  channel: ActivationChannel;
  subject?: string | null;
  body: string;
  loomScript?: string | null;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
}

// ============================================================================
//  Approval gate
// ============================================================================

export type ApprovalStatus =
  | "pending"
  | "approved"
  | "edited"
  | "rejected"
  | "changes_requested"
  | "expired";

export type BlastRadius = "internal" | "external" | "irreversible";

export type ApprovalArtifactType =
  | "OutreachDraft"
  | "ActivationNudge"
  | "CRMUpdate"
  | "CustomDeal";

export interface ApprovalRequest {
  id: string;
  workflowRunId: string;
  artifactType: ApprovalArtifactType;
  artifactId: string;
  blastRadius: BlastRadius;
  reason: string;
  proposedAction: Record<string, unknown>;
  status: ApprovalStatus;
  founderNotes?: string | null;
  createdAt: Date;
  resolvedAt?: Date | null;
}

// ============================================================================
//  Workflow / orchestration
// ============================================================================

export type WorkflowState =
  | "planning"
  | "running"
  | "awaiting_approval"
  | "done"
  | "failed";

export type NodeStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "done"
  | "failed"
  | "skipped";

export type TriggerRule = "all_success" | "all_done";

/**
 * Execution mode for a fanout task.
 *
 * - "fanout" (default): N items → N LLM calls dispatched per-instance. Use for
 *   personas where each item needs human-in-loop approval or per-item voice
 *   personalization (writer, scheduler, brief-writer).
 * - "batch": N items → 1 LLM call processing the whole array, internally
 *   issuing parallel Composio tool calls via COMPOSIO_MULTI_EXECUTE_TOOL.
 *   Use for read/synth personas (researcher, qualifier, strategist, crm-logger).
 *   Output must be keyed by the source-item id; the dispatcher unrolls it
 *   back into per-instance chainOutputs so downstream fanout tasks see
 *   `previousOutputs.<persona>__<itemId>` as if N tasks had run.
 */
export type TaskMode = "fanout" | "batch";

/**
 * Names of work-item collections the workflow function exposes to Managers.
 * Manager emits a template task with `fanoutOver: "leads"` and the workflow
 * function expands it into one materialized task per item in the collection.
 */
export type FanoutSource = "leads" | "trial-signals";

/**
 * The structured plan the Conductor returns. Manager sub-agents collectively
 * produce a flat list of (specialistId, input) tasks. Tasks may be templates
 * (with `fanoutOver`) — the workflow function expands those to one task per
 * source item before dispatch.
 */
export interface WorkflowDAG {
  tasks: WorkflowTask[];
  /** Optional: edges between tasks for visualization (artifact dependencies). */
  edges?: Array<{ from: string; to: string; artifactType: string }>;
}

export interface WorkflowTask {
  /** Unique within a single DAG (e.g., "researcher", "writer-3"). */
  id: string;
  specialistId: PersonaId;
  /** Free-form input passed to the specialist; validated by its inputSchema. */
  input: Record<string, unknown>;
  /** Optional dependencies (other task ids that must complete first). */
  dependsOn?: string[];
  /**
   * Whitelist of output keys to make available to downstream tasks via
   * `previousOutputs.<thisTaskId>.<key>`. Omit to expose nothing (default).
   */
  passOutput?: string[];
  /**
   * "all_success" (default): skip this task if any upstream failed/skipped.
   * "all_done": run regardless of upstream status (with whatever outputs exist).
   */
  triggerRule?: TriggerRule;
  /**
   * If set, the workflow function expands this template into one materialized
   * task per item in the named collection. The item id is substituted for
   * `${each}` tokens inside `input`. `dependsOn` references are also rewritten
   * per fanout instance so chains stay isolated.
   */
  fanoutOver?: FanoutSource;
  /**
   * How to execute a fanout. "fanout" (default) = N LLM calls. "batch" = 1
   * LLM call processing all items via COMPOSIO_MULTI_EXECUTE_TOOL. Ignored
   * if `fanoutOver` is unset.
   */
  mode?: TaskMode;
}

export interface WorkflowRun {
  id: string;
  prompt: string;
  state: WorkflowState;
  plan?: WorkflowDAG | null;
  errorMessage?: string | null;
  startedAt: Date;
  completedAt?: Date | null;
}

export interface WorkflowNode {
  id: string;
  workflowRunId: string;
  layer: Layer;
  persona: string;
  status: NodeStatus;
  inputArtifactIds?: string[] | null;
  outputArtifactIds?: string[] | null;
  errorMessage?: string | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
}

// ============================================================================
//  Activity events (streamed to dashboard via SSE)
// ============================================================================

export type ActivityEventType =
  | "persona_started"
  | "tool_called"
  | "artifact_created"
  | "approval_requested"
  | "approval_resolved"
  | "persona_completed"
  | "workflow_done";

export interface ActivityEvent {
  id: string;
  workflowRunId: string;
  nodeId?: string | null;
  type: ActivityEventType;
  payload: Record<string, unknown>;
  link?: string | null;
  timestamp: Date;
}

// ============================================================================
//  Voice memory
// ============================================================================

export interface VoiceSample {
  id: string;
  userId: string;
  category: string;
  body: string;
  context?: string | null;
  createdAt: Date;
}

export interface FounderVoiceEdit {
  id: string;
  userId: string;
  approvalId: string;
  personaId: PersonaId;
  originalDraft: string;
  editedDraft: string;
  capturedAt: Date;
}

// ============================================================================
//  Company profile — single founder-vetted record grounding every persona
//  that reasons about the customer (qualifier, strategist, writer, …).
// ============================================================================

export interface CompanyProfile {
  userId: string;
  companyName: string | null;
  oneLiner: string | null;
  productDescription: string | null;
  icp: string | null;
  positioning: string | null;
  voiceTone: string | null;
  valueProps: string[] | null;
  competitors: string[] | null;
  sourceUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Re-exported from `company-profile-meta` for legacy callers. New code should
 * import from there directly — that's where the rest of the profile metadata
 * (labels, length caps, persona slices) lives.
 */
export { REQUIRED_COMPANY_PROFILE_FIELDS } from "./company-profile-meta";

// ============================================================================
//  Composio connection state
// ============================================================================

export type ConnectionStatus = "pending" | "connected" | "failed" | "revoked";

export interface Connection {
  id: string;
  userId: string;
  toolkit: string;
  connectedAccountId?: string | null;
  status: ConnectionStatus;
  errorMessage?: string | null;
  createdAt: Date;
  connectedAt?: Date | null;
}

// ============================================================================
//  MCP config — what `getMcpConfigForUser` returns (used by Session 1 + 2)
// ============================================================================

export interface ComposioMcpConfig {
  type: "http";
  url: string;
  headers: Record<string, string>;
}
