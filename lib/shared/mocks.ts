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
} from "./types";

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
        id: "researcher-1",
        specialistId: "researcher",
        input: { leadId: "mock-lead-001" },
      },
      {
        id: "qualifier-1",
        specialistId: "qualifier",
        input: { leadId: "mock-lead-001" },
        dependsOn: ["researcher-1"],
      },
      {
        id: "strategist-1",
        specialistId: "strategist",
        input: { tier: "hot" },
        dependsOn: ["qualifier-1"],
      },
      {
        id: "writer-1",
        specialistId: "writer",
        input: { leadId: "mock-lead-001", strategyId: "strategist-1" },
        dependsOn: ["strategist-1"],
      },
    ],
  };
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
