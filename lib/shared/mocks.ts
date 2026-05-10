/**
 * Mock factories for parallel-session development.
 *
 * Each parallel session has cross-session dependencies that won't exist until
 * other sessions land. These factories let each session develop and test in
 * isolation.
 *
 * Owned by: Foundation. Sessions may add new factories here ONLY by raising
 * with the human conductor (it's a shared file).
 *
 * Conventions:
 * - All factories accept a `Partial<T>` override so callers can specialize.
 * - Generated IDs use a deterministic counter prefix per type (mock-lead-001).
 *   This makes tests reproducible.
 * - Dates default to "now" but can be overridden.
 */

import mitt, { type Emitter } from "mitt";
import type {
  ActivationNudge,
  ActivityEvent,
  ApprovalRequest,
  BlogDraft,
  BookedMeeting,
  ChannelVariant,
  CompanyContext,
  ComposioMcpConfig,
  Connection,
  ContentOutline,
  Department,
  EnrichedLead,
  GtmMetric,
  Lead,
  OutreachDraft,
  OutreachStrategy,
  Persona,
  PersonaId,
  PrepBrief,
  QualifiedLead,
  TopicResearchBrief,
  TrialSignal,
  VoiceSample,
  WorkflowDAG,
  WorkflowNode,
  WorkflowRun,
  WorkflowState,
} from "./types";

// ============================================================================
//  Mock past runs — drives the recent-runs list, runs drawer, and run-detail
//  page in NEXT_PUBLIC_USE_MOCKS=1 mode. `app/api/mock/runs/route.ts` mirrors
//  this fixture for server-side fetches; edit here, not there.
// ============================================================================

export interface MockPastRun {
  id: string;
  title: string | null;
  prompt: string;
  state: WorkflowState;
  startedAt: string; // ISO
  completedAt: string | null;
  /**
   * Plan baked into the fixture so the run-detail page can render the DAG on
   * cold reload — `workflow_planned` is bus-only and never replayed for past
   * runs, and the mock driver doesn't fire for `mock-past-run-` ids either,
   * so without this the canvas dead-ends on the "Waiting for Conductor…"
   * placeholder. Optional because rows constructed inline from a fresh
   * `workflow_started` event don't have one yet.
   */
  plan?: WorkflowDAG;
  /**
   * Concrete leads this run was processing. Fixtures use `makeMaterializedMockDAG(leads)`
   * to bake denormalized lead names into each task's input — that's what the
   * node-detail popover reads to answer "what is this worker working on?".
   * Without this, the popover falls back to role descriptions only.
   */
  leads?: Lead[];
}

// Curated, realistic-feeling demo leads. Names + companies are recognizable
// enough that a non-technical founder can scan a fanout list and see real
// work items rather than `lead-001` / `lead-002`.
const __DEMO_LEAD_SEEDS: Array<Pick<Lead, "name" | "email" | "company"> & { rawMessage: string }> = [
  {
    name: "Dale Smith",
    email: "dale@acme.io",
    company: "Acme",
    rawMessage: "Saw you on HN — looking for outreach automation that doesn't feel spammy.",
  },
  {
    name: "Sarah Chen",
    email: "sarah.chen@vellum.dev",
    company: "Vellum",
    rawMessage: "We just raised seed and need to ramp outbound. Demo possible this week?",
  },
  {
    name: "Maya Patel",
    email: "maya@northwind.co",
    company: "Northwind",
    rawMessage: "How does the founder-led GTM angle work for B2B fintech?",
  },
  {
    name: "Tom Lin",
    email: "tom@stagebridge.app",
    company: "Stagebridge",
    rawMessage: "Y Combinator W26 founder here. Curious about the pricing.",
  },
  {
    name: "Alex Wu",
    email: "alex@joindrift.io",
    company: "Drift",
    rawMessage: "Comparing you to Apollo and 11x. What's the differentiation?",
  },
];

/**
 * Build N curated mock leads (max 5). Each call returns a fresh array with
 * deterministic ids so fixtures persist across reloads.
 */
export function makeDemoLeads(count: number): Lead[] {
  const n = Math.min(Math.max(count, 1), __DEMO_LEAD_SEEDS.length);
  return __DEMO_LEAD_SEEDS.slice(0, n).map((seed, idx) => ({
    id: `mock-lead-${String(idx + 1).padStart(3, "0")}`,
    email: seed.email,
    name: seed.name,
    company: seed.company,
    source: "inbound_form",
    rawMessage: seed.rawMessage,
    createdAt: new Date(__MOCK_NOW),
  }));
}

const __MOCK_NOW = Date.now();
const __HOUR = 3_600_000;
const __DAY = 86_400_000;
const __isoAgo = (ms: number) => new Date(__MOCK_NOW - ms).toISOString();

// Sales-pipeline fixtures get materialized DAGs so the popover can resolve
// each task to a concrete lead label (Dale Smith @ Acme, etc.). CS/Insight
// pipelines stay on templates for now — they'd need their own materialized
// factories matching their persona chains.
const __DEMO_LEADS_5 = makeDemoLeads(5);
const __DEMO_LEADS_1 = makeDemoLeads(1);

export const MOCK_PAST_RUNS: MockPastRun[] = [
  {
    id: "mock-run-founder-led-gtm",
    title: "Ship founder-led GTM blog",
    prompt:
      "Anvil hit 1k WAU. Plan and ship a 2k-word blog on founder-led GTM in the AI era, optimized for Perplexity citations. Cross-post to r/SaaS, LinkedIn, and our static-site repo.",
    state: "done",
    startedAt: __isoAgo(2 * __HOUR),
    completedAt: __isoAgo(2 * __HOUR - 18 * 60_000),
    plan: makeMockWorkflowDAG(),
  },
  {
    id: "mock-run-onboarding-post",
    title: "LLM-native onboarding post",
    prompt:
      "Draft a blog on what we learned about LLM-native onboarding from our first 100 trials. Voice: peer-to-peer, no hype.",
    state: "done",
    startedAt: __isoAgo(__DAY),
    completedAt: __isoAgo(__DAY - 6 * 60_000),
    plan: makeMockWorkflowDAG(),
  },
  {
    id: "mock-run-geo-audit",
    title: "GEO audit + topic gaps",
    prompt:
      "Audit our existing site at anvil.co/blog. Tell me which 3 topics we're missing relative to our top-citing competitors, then draft the highest-priority one.",
    state: "done",
    startedAt: __isoAgo(2 * __DAY),
    completedAt: __isoAgo(2 * __DAY - 12 * 60_000),
    plan: makeMockWorkflowDAG(),
  },
  {
    id: "mock-run-content-sprint",
    title: "Weekly content sprint",
    prompt:
      "It's Monday. Plan and queue 3 blog posts for the week, each with a Reddit + LinkedIn cross-post variant.",
    state: "failed",
    startedAt: __isoAgo(3 * __DAY),
    completedAt: __isoAgo(3 * __DAY - 4 * 60_000),
    plan: makeMockWorkflowDAG(),
  },
];

// ============================================================================
//  ID generation
// ============================================================================

const counters = new Map<string, number>();

function nextId(prefix: string): string {
  const n = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, n);
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

/** Reset deterministic ID counters. Useful between tests. */
export function resetMockIds() {
  counters.clear();
}

// ============================================================================
//  Lead pipeline factories
// ============================================================================

export function makeMockLead(overrides: Partial<Lead> = {}): Lead {
  const id = overrides.id ?? nextId("mock-lead");
  return {
    id,
    email: `${id}@example.com`,
    name: "Jordan Example",
    company: "Acme Inc.",
    source: "inbound_form",
    rawMessage: "Saw your launch on HN — would love a demo. Building a B2B SaaS in fintech.",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockEnrichedLead(
  overrides: Partial<EnrichedLead> = {},
): EnrichedLead {
  return {
    id: nextId("mock-enriched"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    linkedinUrl: "https://linkedin.com/in/jordan-example",
    companyDomain: "acme.example",
    companySize: 25,
    companyIndustry: "Fintech",
    personRole: "CTO",
    personSeniority: "CXO",
    intentSignals: [
      "Recently raised seed round",
      "Hiring for senior backend engineers",
    ],
    techStack: ["TypeScript", "Postgres", "AWS"],
    recentSocial: [
      {
        platform: "Twitter",
        content: "Excited to announce our seed round!",
        url: "https://x.com/example/status/1",
      },
    ],
    enrichedAt: new Date(),
    ...overrides,
  };
}

export function makeMockQualifiedLead(
  overrides: Partial<QualifiedLead> = {},
): QualifiedLead {
  return {
    id: nextId("mock-qualified"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    tier: "hot",
    fitScore: 85,
    fitReasons: [
      "ICP match: B2B SaaS, 10–50 employees",
      "Founder-led GTM (matches our user)",
    ],
    intentScore: 78,
    intentReasons: ["Saw HN launch", "Initiated demo request"],
    recommendedAction: "book_call",
    qualifiedAt: new Date(),
    ...overrides,
  };
}

export function makeMockOutreachStrategy(
  overrides: Partial<OutreachStrategy> = {},
): OutreachStrategy {
  return {
    id: nextId("mock-strategy"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    tier: "hot",
    angle: "Lead with the founder-led GTM case study",
    toneGuide: "Direct, peer-to-peer, no corporate jargon",
    callToAction: "book_call",
    customHooks: ["They just raised — likely scaling sales next"],
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockOutreachDraft(
  overrides: Partial<OutreachDraft> = {},
): OutreachDraft {
  return {
    id: nextId("mock-draft"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    channel: "email",
    subject: "Demo for Acme",
    body: "Hi Jordan,\n\nSaw your HN post — congrats on the seed.\n\n[draft body...]",
    approvalStatus: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockBookedMeeting(
  overrides: Partial<BookedMeeting> = {},
): BookedMeeting {
  return {
    id: nextId("mock-meeting"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    startsAt: new Date(Date.now() + 86400_000),
    durationMin: 30,
    meetingLink: "https://meet.google.com/mock-meeting",
    attendees: ["founder@gmaestro.example", "jordan@acme.example"],
    bookedAt: new Date(),
    ...overrides,
  };
}

export function makeMockPrepBrief(
  overrides: Partial<PrepBrief> = {},
): PrepBrief {
  return {
    id: nextId("mock-brief"),
    meetingId: overrides.meetingId ?? nextId("mock-meeting"),
    notionPageUrl: "https://www.notion.so/mock-brief",
    leadSummary: "Jordan, CTO at Acme Inc. (fintech, 25 employees, just raised).",
    companyContext: "B2B SaaS for invoice automation. Series A coming.",
    likelyUseCase: "Founder-led GTM scaling — hiring engineers, no sales.",
    similarPriorEmails: ["[founder voice sample 1]", "[founder voice sample 2]"],
    talkingPoints: [
      "Anchor on the founder-led GTM angle",
      "Mention the YC W26 reference customer",
    ],
    questionsToAsk: [
      "Who's running outbound today?",
      "What's the biggest GTM bottleneck this quarter?",
    ],
    potentialObjections: [
      "Concerned about brand voice in AI outreach",
      "Already evaluating Apollo / 11x",
    ],
    recommendedNextSteps: [
      "Trial offer with white-glove voice setup",
      "30-day pilot with weekly check-ins",
    ],
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockTrialSignal(
  overrides: Partial<TrialSignal> = {},
): TrialSignal {
  return {
    id: nextId("mock-trial"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    signupAt: new Date(Date.now() - 3600_000),
    invitedTeammates: 0,
    featuresUsed: ["onboarding-step-1"],
    stalledAtStep: "connect-first-tool",
    stripeStatus: "trialing",
    trialEndsAt: new Date(Date.now() + 13 * 86400_000),
    ...overrides,
  };
}

export function makeMockActivationNudge(
  overrides: Partial<ActivationNudge> = {},
): ActivationNudge {
  return {
    id: nextId("mock-nudge"),
    leadId: overrides.leadId ?? nextId("mock-lead"),
    channel: "email",
    subject: "Stuck on connecting your first tool?",
    body: "Hey — saw you started a trial. Need a hand connecting Gmail?",
    approvalStatus: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
//  Approval / workflow factories
// ============================================================================

export function makeMockApprovalRequest(
  overrides: Partial<ApprovalRequest> = {},
): ApprovalRequest {
  return {
    id: nextId("mock-approval"),
    workflowRunId: overrides.workflowRunId ?? nextId("mock-run"),
    artifactType: "BlogDraft",
    artifactId: nextId("mock-blog"),
    blastRadius: "external",
    reason:
      "Publishing a post under the company's name. Founder picks destinations at this gate.",
    proposedAction: {
      title: "Why founder-led GTM beats AI cold email in 2026",
      slug: "founder-led-gtm-beats-ai-cold-email",
      excerpt: "AI cold email has hit a ceiling. Here's what wins instead.",
      bodyMarkdown: "[draft body…]",
    },
    status: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockWorkflowRun(
  overrides: Partial<WorkflowRun> = {},
): WorkflowRun {
  return {
    id: nextId("mock-run"),
    prompt:
      "I'm a YC W26 founder. 47 demo requests came in this week from our HN launch. Process them.",
    state: "running",
    plan: makeMockWorkflowDAG(),
    startedAt: new Date(),
    ...overrides,
  };
}

export function makeMockWorkflowNode(
  overrides: Partial<WorkflowNode> = {},
): WorkflowNode {
  return {
    id: nextId("mock-node"),
    workflowRunId: overrides.workflowRunId ?? nextId("mock-run"),
    layer: "specialist",
    persona: "researcher",
    status: "running",
    startedAt: new Date(),
    ...overrides,
  };
}

export function makeMockWorkflowDAG(): WorkflowDAG {
  // Blog pipeline (G-stack for blogs):
  //   3 parallel researchers (LinkedIn / X / Reddit)
  //   → synthesizer (combines bundles, ideates topics)
  //   → blog-writer (drafts in founder voice)
  //   → blog-designer (wraps in self-contained HTML)
  // Approval lands on the designer artifact; deploy-via-GitHub or
  // ticket-via-Jira/Linear/Notion fires post-approval in the dispatcher.
  return {
    tasks: [
      {
        id: "researcher",
        specialistId: "researcher",
        input: { topic: "founder-led GTM in the AI era" },
        passOutput: ["recommendedTopic", "candidates", "competitorScan"],
      },
      {
        id: "strategist",
        specialistId: "strategist",
        input: { topic: "founder-led GTM in the AI era" },
        dependsOn: ["researcher"],
        passOutput: ["title", "thesis", "sections", "geoSignals"],
      },
      {
        id: "writer",
        specialistId: "writer",
        input: { topic: "founder-led GTM in the AI era" },
        dependsOn: ["strategist"],
        passOutput: ["id", "title", "slug", "bodyMarkdown"],
      },
      {
        id: "geo-editor",
        specialistId: "geo-editor",
        input: {},
        dependsOn: ["writer"],
        passOutput: ["id", "bodyMarkdown", "geoNotes", "factDensityRatio"],
      },
    ],
  };
}

/**
 * Like {@link makeMockWorkflowDAG} but expands the fanout templates into one
 * concrete task per lead, with the lead denormalized into each task's input.
 * The node-detail popover reads `task.input.lead` to render plain-English
 * "Working on: Dale Smith @ Acme" labels — without this the popover would
 * see `${each}` template tokens and fall back to the role description.
 *
 * Mirror of the live workflow function's expansion in `lib/state/workflows.ts`,
 * intentionally kept compatible: same task-id shape (`<persona>-<leadId>`),
 * same per-lead `dependsOn` chain.
 */
/**
 * Legacy GTM-flavored materialized DAG. Kept compiling for any pre-pivot mock
 * fixtures that still reference it. New content-domain fixtures should use
 * `makeMockWorkflowDAG()` directly (the content workflow is single-blog by
 * default; multi-topic fanout doesn't need denormalized lead labels).
 */
export function makeMaterializedMockDAG(_leads: Lead[]): WorkflowDAG {
  // No-op pass-through to the canonical content-flavored mock so dashboards
  // calling this in NEXT_PUBLIC_USE_MOCKS=1 mode still render something
  // sensible. The `_leads` arg is ignored.
  return makeMockWorkflowDAG();
}

export function makeMockActivityEvent(
  overrides: Partial<ActivityEvent> = {},
): ActivityEvent {
  return {
    id: nextId("mock-event"),
    workflowRunId: overrides.workflowRunId ?? nextId("mock-run"),
    nodeId: "researcher-1",
    type: "persona_started",
    payload: { input: { leadId: "mock-lead-001" } },
    timestamp: new Date(),
    ...overrides,
  };
}

// ============================================================================
//  Voice / connection factories
// ============================================================================

export function makeMockVoiceSample(
  overrides: Partial<VoiceSample> = {},
): VoiceSample {
  return {
    id: nextId("mock-voice"),
    userId: "default",
    category: "cold_email_intro",
    body:
      "Hey — quick one. Saw you raised. Most founders we work with are hiring engineers AND running their own GTM right now. If that sounds familiar, mind if I send a 90-second demo?",
    context: "to a CXO at an early-stage B2B SaaS",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockCompanyContext(
  overrides: Partial<CompanyContext> = {},
): CompanyContext {
  return {
    userId: "default",
    companyOverview:
      "Anvil — YC W26 devtools startup, ~24 employees, US-based, recently fundraised.",
    keyFacts: [
      "YC W26",
      "Devtools",
      "~24 employees",
      "US-based",
      "Recent Series Seed",
    ],
    icps: [
      {
        name: "B2B SaaS pre-Series A",
        priority: "hot",
        description: "Founder-led GTM, no AE/SDR yet, hiring engineers",
        industry: ["B2B SaaS"],
        companySizeRange: "5-30",
        seniority: ["Founder", "CEO"],
      },
      {
        name: "Technical founder, recent fundraise",
        priority: "warm",
        description: "Just raised seed, ramping outbound",
        industry: ["B2B SaaS", "Devtools"],
        companySizeRange: "10-50",
        seniority: ["Founder", "CTO"],
      },
      {
        name: "PLG SaaS with stalled trials",
        priority: "warm",
        description:
          "Self-serve product, low activation rate, looking for nudge automation",
        industry: ["B2B SaaS"],
        companySizeRange: "20-100",
        seniority: ["Founder", "VP"],
      },
    ],
    gtmObjectives: [
      {
        metric: "demos_booked",
        target: 50,
        label: "Q1 demos booked",
        since: "2026-01-01T00:00:00Z",
      },
      {
        metric: "qualified_hot_leads",
        target: 100,
        label: "Q1 hot leads",
        since: "2026-01-01T00:00:00Z",
      },
      {
        metric: "outreach_sent",
        target: 200,
        label: "Q1 outreach sent",
        since: "2026-01-01T00:00:00Z",
      },
    ],
    updatedAt: new Date(),
    ...overrides,
  };
}

export function makeMockGtmLiveCounts(): Record<GtmMetric, number> {
  return {
    demos_booked: 12,
    qualified_hot_leads: 38,
    outreach_sent: 87,
  };
}

export function makeMockConnection(
  overrides: Partial<Connection> = {},
): Connection {
  return {
    id: nextId("mock-conn"),
    userId: "default",
    toolkit: "GMAIL",
    connectedAccountId: "ca_mock_123",
    status: "connected",
    createdAt: new Date(),
    connectedAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
//  MCP / orchestration factories
// ============================================================================

export function makeMockMcpConfig(): ComposioMcpConfig {
  return {
    type: "http",
    url: "https://mcp.composio.dev/mock-user",
    headers: { "X-API-Key": "mock-key" },
  };
}

/**
 * Mock implementation of runPersona() for parallel-session development.
 * Returns a typed mock artifact based on personaId after a 100–500ms delay.
 */
export function makeMockPersonaRuntime() {
  return async function runPersona<TIn, TOut>(
    personaId: PersonaId,
    input: TIn,
  ): Promise<TOut> {
    const delayMs = 100 + Math.random() * 400;
    await new Promise((r) => setTimeout(r, delayMs));

    void input;
    switch (personaId) {
      case "researcher":
        return makeMockTopicResearchBrief() as unknown as TOut;
      case "strategist":
        return makeMockContentOutline() as unknown as TOut;
      case "writer":
        return makeMockBlogDraft() as unknown as TOut;
      case "geo-editor":
        return makeMockBlogDraft({
          geoNotes: ["Tightened opening to direct-answer", "Added FAQ schema"],
          factDensityRatio: 0.7,
        }) as unknown as TOut;
      case "formatter":
        return makeMockChannelVariant() as unknown as TOut;
      case "pipeline-reporter":
        return {
          summary:
            "Shipped 1 blog post (1,420 words, 7 GEO signals applied). Live on GitHub PR + r/SaaS + LinkedIn.",
          metrics: {
            wordCount: 1420,
            geoSignalsApplied: 7,
            channelsPublished: 3,
            channelsFailed: 0,
            channelsPending: 0,
          },
        } as unknown as TOut;
      case "slack-digest":
        return {
          digestText:
            "*New post live*: \"Why founder-led GTM beats AI cold email in 2026\"\n• Published to: GitHub PR, r/SaaS, LinkedIn",
          channel: "#content",
          messageTs: "pending-mock",
        } as unknown as TOut;
      case "feedback-tagger":
        return { themes: ["audience:asks-followup"], sentiment: "pos" } as unknown as TOut;
      case "theme-synthesizer":
        return {
          themes: ["topic:pricing-model", "audience:asks-followup"],
          notionPageUrl: "https://www.notion.so/gmaestro-content-themes-mock",
        } as unknown as TOut;
      case "linear-filer":
        return {
          issueId: "LIN-content-1",
          issueUrl: "https://linear.app/gmaestro/issue/LIN-content-1",
        } as unknown as TOut;
      default:
        return { ok: true, personaId, input } as unknown as TOut;
    }
  };
}

/**
 * Mock event bus for Session 2 to use until Session 3's globalThis bus lands.
 * Same mitt-based shape so Session 2 can swap the import 1-for-1.
 */
export function makeMockEventBus(): Emitter<Record<string, unknown>> {
  return mitt<Record<string, unknown>>();
}

/**
 * Mock persona registry for parallel-session dashboard rendering.
 * Returns plausible Persona objects for all 10 content-domain personas.
 */
export function makeMockPersonaRegistry(): Persona[] {
  const ids: PersonaId[] = [
    "researcher",
    "strategist",
    "writer",
    "geo-editor",
    "formatter",
    "pipeline-reporter",
    "slack-digest",
    "feedback-tagger",
    "theme-synthesizer",
    "linear-filer",
  ];
  const deptOf: Record<PersonaId, Department> = {
    researcher: "content",
    strategist: "content",
    writer: "content",
    "geo-editor": "content",
    formatter: "content",
    "pipeline-reporter": "distribution",
    "slack-digest": "distribution",
    "feedback-tagger": "insight",
    "theme-synthesizer": "insight",
    "linear-filer": "insight",
  };
  return ids.map((id) => ({
    id,
    layer: "specialist",
    department: deptOf[id],
    systemPromptPath: `lib/personas/prompts/${id}.md`,
    allowedActions: [],
    modelTier: id === "feedback-tagger" ? "haiku" : "sonnet",
    maxConcurrency: 10,
  }));
}

/**
 * Mock event stream generator for Session 3's dashboard testing.
 * Yields a series of events matching a typical demo workflow shape.
 */
export async function* makeMockEventStream(
  workflowRunId = "mock-run-001",
): AsyncGenerator<ActivityEvent> {
  const events: Array<Omit<ActivityEvent, "id" | "timestamp">> = [
    {
      workflowRunId,
      nodeId: "conductor",
      type: "persona_started",
      payload: { layer: "conductor" },
    },
    {
      workflowRunId,
      nodeId: "content-mgr",
      type: "persona_started",
      payload: { layer: "manager", department: "content" },
    },
    {
      workflowRunId,
      nodeId: "researcher",
      type: "persona_started",
      payload: { specialistId: "researcher" },
    },
    {
      workflowRunId,
      nodeId: "researcher",
      type: "tool_called",
      payload: { tool: "REDDIT_SEARCH_POSTS" },
    },
    {
      workflowRunId,
      nodeId: "researcher",
      type: "artifact_created",
      payload: { artifactType: "TopicResearchBrief", artifactId: "mock-tbrief-001" },
    },
    {
      workflowRunId,
      nodeId: "researcher",
      type: "persona_completed",
      payload: {},
    },
  ];
  for (const evt of events) {
    yield { id: nextId("mock-event"), timestamp: new Date(), ...evt };
    await new Promise((r) => setTimeout(r, 200));
  }
}

// ============================================================================
//  Content-domain factories (post-pivot)
// ============================================================================

export function makeMockTopicResearchBrief(
  overrides: Partial<TopicResearchBrief> = {},
): TopicResearchBrief {
  return {
    id: nextId("mock-tbrief"),
    topic: "founder-led GTM in the AI era",
    candidates: [
      {
        title: "Why founder-led GTM beats AI cold email in 2026",
        angle: "AI cold email has hit a ceiling — but blogs are the opposite",
        rationale:
          "Multiple Reddit threads on r/SaaS reveal founders frustrated with cold-email response rates dropping below 1%; meanwhile content-driven inbound is up 3× YoY. Strong contrarian wedge.",
        citations: [
          {
            source: "reddit",
            url: "https://reddit.com/r/SaaS/comments/abc/cold_email_dead",
            title: "Cold email response rates fell off a cliff this year",
            excerpt: "We went from 4% to <1% response in 6 months…",
          },
        ],
      },
    ],
    recommendedTopic: "Why founder-led GTM beats AI cold email in 2026",
    competitorScan: [
      {
        url: "https://lavender.ai/blog/cold-email-trends-2026",
        summary:
          "Argues for better cold email tooling. Misses the structural shift to content-led growth — that's our wedge.",
      },
    ],
    citationFootprint:
      "Perplexity currently cites Lavender, Apollo, and Outreach blogs for 'best cold email practices'. Anvil is not in the cited set.",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockContentOutline(
  overrides: Partial<ContentOutline> = {},
): ContentOutline {
  return {
    id: nextId("mock-outline"),
    title: "Why founder-led GTM beats AI cold email in 2026",
    thesis:
      "Founders who delegate cold email lose deals; founders who delegate blogs win them. The asymmetry is structural.",
    audience: "Pre-Series A founders running their own GTM",
    sections: [
      {
        heading: "What changed: the cold-email response cliff",
        keyPoints: [
          "Response rates dropped from 4% to <1% in 12 months",
          "Buyers now treat cold email as adversarial",
        ],
      },
      {
        heading: "Why blogs are the opposite signal",
        keyPoints: [
          "Inbound from content scales without burning trust",
          "AI search (Perplexity / ChatGPT) compounds blog reach",
        ],
      },
      {
        heading: "The founder-in-loop blueprint",
        keyPoints: [
          "Delegate research + drafting + distribution",
          "Keep approval gates on every irreversible publish",
        ],
      },
    ],
    targetKeywords: [
      "AI cold email decline 2026",
      "founder-led content marketing",
      "GEO for early-stage SaaS",
    ],
    geoSignals: [
      "Lead with 60-word direct answer to 'is cold email dead?'",
      "Cite the r/SaaS thread in section 1",
      "Include 1 stat per 150 words minimum",
      "End with founder-voice quote in section 3",
    ],
    estimatedWordCount: 1500,
    approvalStatus: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockBlogDraft(
  overrides: Partial<BlogDraft> = {},
): BlogDraft {
  return {
    id: nextId("mock-blog"),
    title: "Why founder-led GTM beats AI cold email in 2026",
    slug: "founder-led-gtm-beats-ai-cold-email",
    excerpt:
      "AI cold email has hit a 1% response ceiling. Here's what's working instead — and how founders should rebuild their GTM around it.",
    bodyMarkdown:
      "## What changed\n\nCold email response rates dropped from 4% to <1% in twelve months. Buyers now treat unsolicited email as adversarial.\n\n…",
    tags: ["founder-led-gtm", "content-marketing", "geo"],
    citations: [
      {
        source: "reddit",
        url: "https://reddit.com/r/SaaS/comments/abc",
        title: "Cold email response rates fell off a cliff",
      },
    ],
    geoNotes: [
      "Tightened opening to direct-answer in first 60 words",
      "Pulled stat into blockquote callout",
      "Recommended FAQPage schema at publish",
    ],
    factDensityRatio: 0.7,
    approvalStatus: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

export function makeMockChannelVariant(
  overrides: Partial<ChannelVariant> = {},
): ChannelVariant {
  return {
    id: nextId("mock-cv"),
    blogDraftId: overrides.blogDraftId ?? nextId("mock-blog"),
    target: "github",
    content:
      "---\ntitle: Why founder-led GTM beats AI cold email in 2026\nslug: founder-led-gtm-beats-ai-cold-email\n---\n\n## What changed\n\nCold email response rates dropped…",
    metadata: {
      repo: "anvil-co/anvil-site",
      branch: "content/founder-led-gtm",
      path: "content/blog/founder-led-gtm-beats-ai-cold-email.mdx",
      prTitle: "Add post: Why founder-led GTM beats AI cold email in 2026",
      prBody: "AI cold email has hit a 1% response ceiling. Here's what's working instead.",
    },
    approvalStatus: "pending",
    createdAt: new Date(),
    ...overrides,
  };
}

