/**
 * GMaestro shared type contracts — content / blog / GEO + SEO domain.
 *
 * Pivoted 2026-05-09 from GTM (sales / CS / RevOps) to content. Architecture
 * is unchanged — Conductor → Managers → Specialists, Pattern B (deterministic
 * fetch → pure-LLM synth), post-approval deterministic dispatch — only the
 * domain types changed.
 *
 * Owned by: Foundation. Sessions raise type changes with the human conductor.
 */

// ============================================================================
//  Personas — exactly 10. 5 in Content, 2 in Distribution, 3 in Insight.
//  DO NOT add new personas without updating registry, scopes, prompts, and
//  CLAUDE.md.
// ============================================================================

export type PersonaId =
  // Content department (5)
  | "researcher"        // topic + competitor + GEO citation research (Pattern B)
  | "strategist"        // angle + outline + keyword + GEO signal strategy
  | "writer"            // long-form blog draft (markdown)
  | "geo-editor"        // applies GEO/SEO signals: fact density, direct-answer leads, citations, schema recs
  | "formatter"         // emits per-channel variants (MDX, HTML, Notion blocks, Reddit, LinkedIn, X)
  // Distribution department (2)
  | "pipeline-reporter" // content-performance summary
  | "slack-digest"      // content-update Slack digest
  // Insight department (3)
  | "feedback-tagger"   // tags content performance signals (viral / flop / mixed)
  | "theme-synthesizer" // clusters topic trends into Notion content backlog
  | "linear-filer";     // files content tasks into Linear

export type Department = "content" | "distribution" | "insight";
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
//  Toolkits — destinations for the post-approval channels picker
// ============================================================================

export type ToolkitId =
  | "github"     // PR-with-markdown to a static-site repo
  | "wordpress"  // CMS publish (Composio slug TBD)
  | "ghost"      // CMS publish (Composio slug TBD)
  | "notion"     // Notion-as-blog (database row insert)
  | "reddit"     // self-post / link-post
  | "linkedin"   // native UGC post (official Posts API)
  | "twitter";   // single tweet / chained thread

export const ALL_TOOLKIT_IDS: readonly ToolkitId[] = [
  "github",
  "wordpress",
  "ghost",
  "notion",
  "reddit",
  "linkedin",
  "twitter",
] as const;

// ============================================================================
//  Run input — the 3-input form replaces the freeform prompt for v1.
//  Founder gives us (a) a company URL for voice + product context,
//  (b) a docs URL for the topic source, (c) a single destination.
// ============================================================================

/** Single-destination output target the founder picks at run-start. */
export type Destination = "blog-html" | "reddit" | "x-thread";

export const ALL_DESTINATIONS: readonly Destination[] = [
  "blog-html",
  "reddit",
  "x-thread",
] as const;

export interface RunWorkflowInput {
  /** Company website URL — Pattern B fetch reads /, /about, /blog for voice + product. */
  companyUrl: string;
  /** Technical doc URL the blog will be written from (HTML page or raw markdown). */
  docsUrl: string;
  /** Single output target. The Formatter persona uses this to shape its output. */
  destination: Destination;
}

/**
 * Voice fingerprint extracted from the company's existing blog. Computed by
 * `lib/personas/researcher/company-fetch.ts` and threaded into the Strategist
 * + Writer prompts so the generated post matches the company's actual voice.
 *
 * Each field is mechanical to extract — see the plan file for the 10 rules.
 */
export interface VoiceFingerprint {
  /** Words-per-sentence: { mean, stdev } across 5+ source posts. High stdev (>8) = aggressive variation. */
  sentenceLength: { mean: number; stdev: number };
  /** Pronoun mode: dominant pronoun across source posts. Lock one — never mix. */
  pronounMode: "we" | "i" | "neutral";
  /** First-100-words modal hook pattern. */
  hookPattern: "anomaly" | "contrarian" | "stat-led" | "announcement";
  /** Modal H2 heading style. */
  headingStyle: "topical" | "question" | "named-concept";
  /** Average code blocks per post. <1 = prose-only company; 3+ = code-heavy. */
  codeBlocksPerPost: number;
  /** Opinion-marker density (per 1k words). 0 = neutral; 5+ = highly opinionated. */
  opinionDensity: number;
  /** Words flagged as banned by scanning source posts (none of the marketing-verb set appeared). */
  bannedWords: string[];
  /** Modal closing pattern. */
  closingPattern: "single-line-punch" | "wrapping-up" | "cta-only";
  /** Numeric claims per 1k words. <2 = narrative-led; 4+ = stat-anchored. */
  statDensity: number;
  /** Words ÷ H2 count target. Norm is 300–400. */
  wordsPerSection: number;
  /** Raw voice samples (most recent 3 blog posts, full text). Threaded as Writer few-shots. */
  samples: string[];
  /** Company self-description scraped from /about or homepage. */
  productDescription?: string;
  /** Company name as detected on the page. */
  companyName?: string;
}

// ============================================================================
//  Content artifacts — produced by the content workflow
// ============================================================================

export type CitationSource =
  | "reddit"
  | "twitter"
  | "linkedin"
  | "blog"
  | "docs"
  | "perplexity"
  | "hackernews"
  | "other";

export interface SourceCitation {
  source: CitationSource;
  url: string;
  title?: string;
  excerpt?: string;
}

export interface TopicCandidate {
  title: string;
  angle: string;
  rationale: string;
  citations: SourceCitation[];
}

export interface TopicResearchBrief {
  id: string;
  /** The seed topic / theme the founder asked about. */
  topic: string;
  candidates: TopicCandidate[];
  /** The candidate the researcher recommends. May be overridden at outline approval. */
  recommendedTopic: string;
  /** Competitor blogs we scanned for differentiation gaps. */
  competitorScan: Array<{ url: string; summary: string }>;
  /** Existing AI-search citation footprint for the company (Perplexity output). */
  citationFootprint?: string;
  createdAt: Date;
}

export interface OutlineSection {
  heading: string;
  keyPoints: string[];
  sourcesToCite?: SourceCitation[];
}

export interface ContentOutline {
  id: string;
  topicResearchBriefId?: string;
  title: string;
  /** One-sentence thesis the post argues. */
  thesis: string;
  /** Who this is written for ("pre-Series A founders running their own GTM"). */
  audience: string;
  sections: OutlineSection[];
  targetKeywords: string[];
  /** GEO-specific signals to weave in (e.g. "lead with direct answer in first 60 words"). */
  geoSignals: string[];
  estimatedWordCount: number;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
}

export interface BlogDraft {
  id: string;
  outlineId?: string;
  title: string;
  slug: string;
  excerpt: string;
  /** Full post body in markdown. The Formatter persona converts this per channel. */
  bodyMarkdown: string;
  tags: string[];
  citations: SourceCitation[];
  /** GEO-Editor's notes on what was changed for AI-search optimization. */
  geoNotes?: string[];
  /** Stats per 100 words — GEO-Editor's signal density measurement. */
  factDensityRatio?: number;
  /**
   * Set at approval time by the founder — which destinations to publish to.
   * The Formatter persona reads this to fan out one variant per target.
   * Only valid in the approval payload, not in the persona's emitted draft.
   */
  targets?: ToolkitId[];
  approvalStatus: ApprovalStatus;
  founderEdits?: string | null;
  createdAt: Date;
}

export interface ChannelVariant {
  id: string;
  blogDraftId: string;
  target: ToolkitId;
  /**
   * Channel-native rendered content:
   *   github     → markdown / MDX with frontmatter
   *   wordpress  → HTML body
   *   ghost      → HTML body
   *   notion     → JSON-stringified Notion block array
   *   reddit     → discussion-flavored markdown
   *   linkedin   → plain text (≤3000 chars) or carousel slide JSON
   *   twitter    → single tweet OR newline-separated thread
   */
  content: string;
  /**
   * Per-target metadata. Free-form because each target has different
   * publish-call args. Examples:
   *   github     → { repo, branch, path, frontmatter, prTitle, prBody }
   *   wordpress  → { categories, tags, excerpt, status }
   *   notion     → { databaseId, properties }
   *   reddit     → { subreddit, kind: "self" | "link", flair }
   *   linkedin   → { visibility, articleStyle }
   *   twitter    → { kind: "single" | "thread" }
   */
  metadata: Record<string, unknown>;
  approvalStatus: ApprovalStatus;
  createdAt: Date;
}

export interface PublishedArtifact {
  id: string;
  channelVariantId: string;
  target: ToolkitId;
  /** External URL of the published item (PR URL, Reddit post URL, etc.). */
  externalUrl?: string;
  /** External id (PR number, Reddit post id, LinkedIn URN, …). */
  externalId: string;
  publishedAt: Date;
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
  | "TopicResearchBrief" // low-friction; founder confirms direction
  | "ContentOutline"     // founder picks angle / scope before drafting
  | "BlogDraft"          // BIG GATE — carries the channels picker (`targets`)
  | "ChannelVariant"     // per-channel preview; bulk-approve via /api/approvals/bulk
  | "PublishedArtifact"; // post-publish receipt for the timeline

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
  /** Computed at read-time from the run's prompt (3-input form). Used by
   * the approval preview to show "as it would appear on yoursite.com". */
  companyUrl?: string | null;
}
//  Workflow / orchestration — DAG shape unchanged

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
 *   personalization (writer, formatter).
 * - "batch": N items → 1 LLM call processing the whole array, internally
 *   issuing parallel Composio tool calls via COMPOSIO_MULTI_EXECUTE_TOOL.
 *   Use for read/synth personas where cross-item reasoning is fine. The
 *   dispatcher unrolls the output back into per-instance chainOutputs.
 */
export type TaskMode = "fanout" | "batch";

/**
 * Names of work-item collections the workflow function exposes to Managers.
 * Manager emits a template task with `fanoutOver: "topics"` or `"channels"`
 * and the workflow function expands it into one materialized task per item.
 *
 * - "topics"   — multiple topics in flight (used for "draft 4 blogs this week").
 * - "channels" — set at approval time by the founder via the BlogDraft channels
 *                picker. The Formatter expands one task per ticked target.
 */
export type FanoutSource = "topics" | "channels";

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
   * "all_done": run regardless of upstream status.
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

//  Activity events (streamed to dashboard via SSE) — unchanged

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

//  Voice memory — unchanged shape (now blog-flavored samples)

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

//  Composio connection state — unchanged

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

//  MCP config — unchanged

export interface ComposioMcpConfig {
  type: "http";
  url: string;
  headers: Record<string, string>;
}


//  Company context — singleton row per founder, surfaces on the dashboard.
//  Founder edits via the dialog OR LLM synthesis proposes updates the founder
//  reviews/saves. Live counts on objectives are computed at read time from
//  existing tables (no snapshot history).
// ============================================================================

export type IcpPriority = "hot" | "warm" | "cold";

export interface ICPProfile {
  name: string;
  priority: IcpPriority;
  description: string;
  industry: string[];
  companySizeRange?: string;
  seniority: string[];
}

/** Metrics with a clean DB source. Add new entries only when a counter exists. */
export type GtmMetric =
  | "demos_booked"
  | "qualified_hot_leads"
  | "outreach_sent";

export interface GtmObjective {
  metric: GtmMetric;
  target: number;
  label: string;
  /** ISO date string. Live count filters >= this. Omit for all-time. */
  since?: string;
}

export interface CompanyContext {
  userId: string;
  companyOverview: string;
  keyFacts: string[];
  icps: ICPProfile[];
  gtmObjectives: GtmObjective[];
  updatedAt: Date;
}


// ============================================================================
//  LEGACY GTM types — kept for DB schema + pre-pivot routes that still
//  reference them. NOT in any active union (PersonaId, ApprovalArtifactType,
//  FanoutSource). New orchestration code must not produce these.
//
//  Will be deleted once the DB schema migration lands.
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
  to?: string | null;
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
