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
  BookedMeeting,
  ComposioMcpConfig,
  Connection,
  EnrichedLead,
  Lead,
  OutreachDraft,
  OutreachStrategy,
  Persona,
  PersonaId,
  PrepBrief,
  QualifiedLead,
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
    id: "mock-run-yc-launch",
    title: "Process YC HN launch leads",
    prompt:
      "I'm a YC W26 founder. 5 demo requests came in this week from our HN launch. I have 3 hours before cofounder offsite. Process them.",
    state: "done",
    startedAt: __isoAgo(2 * __HOUR),
    completedAt: __isoAgo(2 * __HOUR - 18 * 60_000),
    leads: __DEMO_LEADS_5,
    plan: makeMaterializedMockDAG(__DEMO_LEADS_5),
  },
  {
    id: "mock-run-acme-inbound",
    title: "Process inbound from Acme",
    prompt: "Process this one inbound lead from acme.com",
    state: "done",
    startedAt: __isoAgo(__DAY),
    completedAt: __isoAgo(__DAY - 6 * 60_000),
    leads: __DEMO_LEADS_1,
    plan: makeMaterializedMockDAG(__DEMO_LEADS_1),
  },
  {
    id: "mock-run-trial-checkin",
    title: "Activation check on 12 trials",
    prompt: "Daily activation check on 12 trial users.",
    state: "done",
    startedAt: __isoAgo(2 * __DAY),
    completedAt: __isoAgo(2 * __DAY - 12 * 60_000),
    plan: makeMockWorkflowDAG(),
  },
  {
    id: "mock-run-bug-feedback",
    title: "Bug report → Linear + DM",
    prompt:
      "Customer just reported a bug in our Slack — file it in Linear and update them with the fix ETA.",
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
    artifactType: "OutreachDraft",
    artifactId: nextId("mock-draft"),
    blastRadius: "external",
    reason: "Sending a personalized email to a real prospect outside the team.",
    proposedAction: {
      tool: "gmail.send",
      to: "jordan@acme.example",
      subject: "Demo for Acme",
      body: "[draft body…]",
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
  return {
    tasks: [
      {
        id: "researcher",
        specialistId: "researcher",
        input: { leadId: "${each}" },
        fanoutOver: "leads",
        passOutput: ["id", "leadId", "personRole", "companyIndustry"],
      },
      {
        id: "qualifier",
        specialistId: "qualifier",
        input: { leadId: "${each}" },
        fanoutOver: "leads",
        dependsOn: ["researcher"],
        passOutput: ["id", "tier", "fitScore", "recommendedAction"],
      },
      {
        id: "strategist",
        specialistId: "strategist",
        input: { leadId: "${each}" },
        fanoutOver: "leads",
        dependsOn: ["qualifier"],
        passOutput: ["id", "tier", "angle", "callToAction"],
      },
      {
        id: "writer",
        specialistId: "writer",
        input: { leadId: "${each}" },
        fanoutOver: "leads",
        dependsOn: ["strategist"],
        passOutput: ["id", "subject", "body", "channel"],
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
export function makeMaterializedMockDAG(leads: Lead[]): WorkflowDAG {
  if (leads.length === 0) return { tasks: [] };
  const personas = ["researcher", "qualifier", "strategist", "writer"] as const;
  const passOutput: Record<(typeof personas)[number], string[]> = {
    researcher: ["id", "leadId", "personRole", "companyIndustry"],
    qualifier: ["id", "tier", "fitScore", "recommendedAction"],
    strategist: ["id", "tier", "angle", "callToAction"],
    writer: ["id", "subject", "body", "channel"],
  };
  const tasks: WorkflowDAG["tasks"] = [];
  for (const lead of leads) {
    let prevId: string | null = null;
    for (const p of personas) {
      const id = `${p}-${lead.id}`;
      tasks.push({
        id,
        specialistId: p,
        input: {
          lead: {
            id: lead.id,
            name: lead.name,
            email: lead.email,
            company: lead.company,
          },
        },
        ...(prevId ? { dependsOn: [prevId] } : {}),
        passOutput: passOutput[p],
      });
      prevId = id;
    }
  }
  return { tasks };
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
 * Mock implementation of Session 2's runPersona() for Session 1 to use until
 * the real one lands.
 *
 * Returns a typed mock artifact based on personaId after a 100–500ms delay
 * (simulating LLM latency).
 */
export function makeMockPersonaRuntime() {
  return async function runPersona<TIn, TOut>(
    personaId: PersonaId,
    input: TIn,
  ): Promise<TOut> {
    const delayMs = 100 + Math.random() * 400;
    await new Promise((r) => setTimeout(r, delayMs));

    switch (personaId) {
      case "researcher":
        return makeMockEnrichedLead({
          leadId: (input as { leadId?: string }).leadId,
        }) as unknown as TOut;
      case "qualifier":
        return makeMockQualifiedLead({
          leadId: (input as { leadId?: string }).leadId,
        }) as unknown as TOut;
      case "strategist":
        return makeMockOutreachStrategy() as unknown as TOut;
      case "writer":
        return makeMockOutreachDraft() as unknown as TOut;
      case "scheduler":
        return makeMockBookedMeeting() as unknown as TOut;
      case "brief-writer":
        return makeMockPrepBrief() as unknown as TOut;
      case "activation":
        return makeMockActivationNudge() as unknown as TOut;
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
 * Mock persona registry for Session 1/3 to render DAG without needing
 * Session 2's full registry. Returns plausible Persona objects for all 13.
 */
export function makeMockPersonaRegistry(): Persona[] {
  const ids: PersonaId[] = [
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
  ];
  const deptOf: Record<PersonaId, "sales" | "cs" | "revops" | "insight"> = {
    researcher: "sales",
    qualifier: "sales",
    strategist: "sales",
    writer: "sales",
    scheduler: "sales",
    "brief-writer": "sales",
    activation: "cs",
    "crm-logger": "revops",
    "pipeline-reporter": "revops",
    "slack-digest": "revops",
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
      nodeId: "sales-mgr",
      type: "persona_started",
      payload: { layer: "manager", department: "sales" },
    },
    {
      workflowRunId,
      nodeId: "researcher-1",
      type: "persona_started",
      payload: { specialistId: "researcher" },
    },
    {
      workflowRunId,
      nodeId: "researcher-1",
      type: "tool_called",
      payload: { tool: "LINKEDIN_GET_PROFILE" },
    },
    {
      workflowRunId,
      nodeId: "researcher-1",
      type: "artifact_created",
      payload: { artifactType: "EnrichedLead", artifactId: "mock-enriched-001" },
    },
    {
      workflowRunId,
      nodeId: "researcher-1",
      type: "persona_completed",
      payload: {},
    },
  ];
  for (const evt of events) {
    yield { id: nextId("mock-event"), timestamp: new Date(), ...evt };
    await new Promise((r) => setTimeout(r, 200));
  }
}

