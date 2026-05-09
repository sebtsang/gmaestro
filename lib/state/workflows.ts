import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { runConductor } from "@/lib/orchestrator/conductor";
import {
  runPersona,
  runPersonaBatch,
  type BatchItemEnvelope,
  type BatchResult,
} from "@/lib/personas/runtime";
import { fetchResearcherBundle } from "@/lib/personas/researcher/fetch";
import { PERSONA_REGISTRY } from "@/lib/personas/registry";
import { getDispatchConcurrency } from "@/lib/shared/env";
import { makeMockPersonaRuntime } from "@/lib/shared/mocks";
import { emitEvent } from "@/lib/state/activity";
import {
  fanoutItems,
  loadWorkContext,
  type WorkContext,
} from "./work-context";
import { raiseApproval } from "./approvals";
import type {
  ApprovalArtifactType,
  BlastRadius,
  FanoutSource,
  PersonaId,
  TaskMode,
  WorkflowDAG,
  WorkflowTask,
} from "@/lib/shared/types";
import { db, schema } from "./db";

const mockPersonaImpl = makeMockPersonaRuntime();

function shouldUseMockPersonas(): boolean {
  // Only mock when explicitly opted in. Same reasoning as shouldUseMockConductor:
  // an empty ANTHROPIC_API_KEY no longer implies "no LLM available" because
  // the Claude Code OAuth path (Keychain) is a valid auth source the Agent
  // SDK can use without the env var.
  return process.env.GMAESTRO_MOCK_PERSONAS === "1";
}

function mockArtifactType(personaId: PersonaId): string | null {
  switch (personaId) {
    case "researcher": return "EnrichedLead";
    case "qualifier": return "QualifiedLead";
    case "strategist": return "OutreachStrategy";
    case "writer": return "OutreachDraft";
    case "scheduler": return "BookedMeeting";
    case "brief-writer": return "PrepBrief";
    case "activation": return "ActivationNudge";
    default: return null;
  }
}

async function runPersonaWithFallback(
  personaId: PersonaId,
  input: Record<string, unknown> & { workflowRunId?: string; nodeId?: string },
  founderId: string,
): Promise<Record<string, unknown>> {
  if (shouldUseMockPersonas()) {
    const wfId = input.workflowRunId ?? "ad-hoc";
    const ndId = input.nodeId ?? personaId;
    await emitEvent(wfId, ndId, "persona_started", { personaId, input });
    const out = (await mockPersonaImpl<Record<string, unknown>, unknown>(
      personaId,
      input,
    )) as Record<string, unknown> | null;
    const artifactType = mockArtifactType(personaId);
    if (artifactType) {
      const artifactId =
        (out as { id?: string } | null)?.id ?? `${personaId}-${ndId}`;
      await emitEvent(wfId, ndId, "artifact_created", {
        personaId,
        artifactType,
        artifactId,
      });
    }
    await emitEvent(wfId, ndId, "persona_completed", {
      personaId,
      output: (out ?? {}) as Record<string, unknown>,
    });
    return out ?? {};
  }
  return (await runPersona(personaId, input, founderId)) as Record<
    string,
    unknown
  >;
}

function nodeRowId(workflowRunId: string, taskId: string): string {
  return `${workflowRunId}:${taskId}`;
}

function isIntegrationNotConnectedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { code?: unknown; message?: unknown };
  if (maybe.code === "INTEGRATION_NOT_CONNECTED") return true;
  if (typeof maybe.message === "string") {
    return /integration[_ ]not[_ ]connected/i.test(maybe.message);
  }
  return false;
}

function errorToMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

export async function createRun(prompt: string): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.workflowRuns).values({
    id,
    prompt,
    state: "planning",
  });
  return id;
}

async function markRunRunning(workflowRunId: string): Promise<void> {
  await db
    .update(schema.workflowRuns)
    .set({ state: "running" })
    .where(eq(schema.workflowRuns.id, workflowRunId));
}

async function markRunDone(workflowRunId: string): Promise<void> {
  await db
    .update(schema.workflowRuns)
    .set({ state: "done", completedAt: new Date() })
    .where(eq(schema.workflowRuns.id, workflowRunId));
}

export async function markRunFailed(
  workflowRunId: string,
  err: unknown,
): Promise<void> {
  await db
    .update(schema.workflowRuns)
    .set({
      state: "failed",
      errorMessage: errorToMessage(err),
      completedAt: new Date(),
    })
    .where(eq(schema.workflowRuns.id, workflowRunId));
}

async function persistPlan(
  workflowRunId: string,
  templateDag: WorkflowDAG,
  materializedTasks: WorkflowTask[],
): Promise<void> {
  await db
    .update(schema.workflowRuns)
    .set({ plan: { tasks: materializedTasks, edges: templateDag.edges } })
    .where(eq(schema.workflowRuns.id, workflowRunId));

  if (materializedTasks.length === 0) return;

  await db.insert(schema.workflowNodes).values(
    materializedTasks.map((task) => ({
      id: nodeRowId(workflowRunId, task.id),
      workflowRunId,
      layer: "specialist" as const,
      persona: task.specialistId,
      status: "pending" as const,
    })),
  );
}

async function markNodeRunning(nodeId: string): Promise<void> {
  await db
    .update(schema.workflowNodes)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(schema.workflowNodes.id, nodeId));
}

async function markNodeDone(nodeId: string): Promise<void> {
  await db
    .update(schema.workflowNodes)
    .set({ status: "done", completedAt: new Date() })
    .where(eq(schema.workflowNodes.id, nodeId));
}

async function markNodeFailed(nodeId: string, err: unknown): Promise<void> {
  await db
    .update(schema.workflowNodes)
    .set({
      status: "failed",
      errorMessage: errorToMessage(err),
      completedAt: new Date(),
    })
    .where(eq(schema.workflowNodes.id, nodeId));
}

async function markNodeSkipped(nodeId: string, reason: string): Promise<void> {
  await db
    .update(schema.workflowNodes)
    .set({
      status: "skipped",
      skippedReason: reason,
      completedAt: new Date(),
    })
    .where(eq(schema.workflowNodes.id, nodeId));
}

// ============================================================================
//  Plan expansion: Manager emits template tasks, workflow function materializes
// ============================================================================

/**
 * Materialized task carries an in-memory `batchGroup` annotation so the
 * dispatcher can collapse N shadow tasks into one runPersonaBatch call.
 * Stripped on persist by Zod's default 'strip' behavior.
 */
type MaterializedTask = WorkflowTask & {
  batchGroup?: string;
};

function expandPlan(dag: WorkflowDAG, ctx: WorkContext): MaterializedTask[] {
  const fanoutSourceById = new Map<string, FanoutSource>();
  for (const t of dag.tasks) {
    if (t.fanoutOver) fanoutSourceById.set(t.id, t.fanoutOver);
  }

  const out: MaterializedTask[] = [];
  for (const t of dag.tasks) {
    if (t.fanoutOver) {
      const items = fanoutItems(t.fanoutOver, ctx);
      // Resolve effective mode: explicit `mode` wins; else fall back to
      // "batch" if the persona has batch schemas registered AND the item
      // count is >5 (small fanouts don't benefit from batching overhead),
      // else "fanout".
      const effectiveMode = resolveEffectiveMode(
        t.mode,
        t.specialistId,
        items.length,
      );
      for (const item of items) {
        out.push(
          materializeFanoutTask(t, item, fanoutSourceById, effectiveMode),
        );
      }
    } else {
      out.push(rewriteNonFanoutDeps(t, ctx, fanoutSourceById));
    }
  }
  return out;
}

function resolveEffectiveMode(
  declared: TaskMode | undefined,
  personaId: PersonaId,
  itemCount: number,
): TaskMode {
  if (declared === "batch" || declared === "fanout") return declared;
  const persona = PERSONA_REGISTRY[personaId];
  if (persona?.batchInputSchema && persona?.batchOutputSchema && itemCount > 5) {
    return "batch";
  }
  return "fanout";
}

function materializeFanoutTask(
  template: WorkflowTask,
  item: { id: string; fields: Record<string, unknown> },
  fanoutSourceById: Map<string, FanoutSource>,
  effectiveMode: TaskMode,
): MaterializedTask {
  // For batch mode the persona has no batch schemas → fall through to fanout
  // (logged once at dispatch time). Otherwise, set batchGroup so the
  // dispatcher coalesces all shadows of this template into one LLM call.
  const personaSupportsBatch =
    effectiveMode === "batch" &&
    !!PERSONA_REGISTRY[template.specialistId]?.batchInputSchema;
  return {
    ...template,
    id: `${template.id}__${item.id}`,
    input: {
      ...substituteEach(template.input, item.id),
      // Splat the source-record fields into the task input so personas can
      // act on the lead/trial without an extra round-trip — they have no tool
      // to query our local store from inside an Agent SDK query.
      item: item.fields,
    },
    dependsOn: (template.dependsOn ?? []).map((depId) =>
      fanoutSourceById.has(depId) ? `${depId}__${item.id}` : depId,
    ),
    fanoutOver: undefined,
    mode: personaSupportsBatch ? "batch" : "fanout",
    batchGroup: personaSupportsBatch ? template.id : undefined,
  };
}

function rewriteNonFanoutDeps(
  task: WorkflowTask,
  ctx: WorkContext,
  fanoutSourceById: Map<string, FanoutSource>,
): WorkflowTask {
  const dependsOn: string[] = [];
  for (const depId of task.dependsOn ?? []) {
    const source = fanoutSourceById.get(depId);
    if (source) {
      // Non-fanout task depending on a fanout template = wait for ALL instances.
      for (const item of fanoutItems(source, ctx)) {
        dependsOn.push(`${depId}__${item.id}`);
      }
    } else {
      dependsOn.push(depId);
    }
  }
  // If the task input names a single leadId / trialSignalId, splat the source
  // record's fields under `item` so the persona has the full lead context
  // without needing to call a tool. Conductors that hand-roll N tasks instead
  // of using fanoutOver: "leads" otherwise leave personas with only an id.
  const input = injectItemContext(task.input, ctx);
  return { ...task, dependsOn, input };
}

/**
 * The writer's `to` field is non-creative — it's a deterministic copy of
 * `input.item.email`. Open-weights models sometimes paraphrase or fabricate
 * it (e.g. "lead004@anvil.example" instead of the real address). We always
 * trust the lead record over the model. Same logic for `leadId` since
 * that's also infrastructure-side.
 */
function enforceWriterRecipientFromInput(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const itemRaw = input.item;
  const item =
    itemRaw && typeof itemRaw === "object" && !Array.isArray(itemRaw)
      ? (itemRaw as Record<string, unknown>)
      : {};
  const realEmail = typeof item.email === "string" ? item.email : null;
  const realLeadId =
    typeof input.leadId === "string"
      ? input.leadId
      : typeof item.leadId === "string"
        ? (item.leadId as string)
        : null;
  if (!realEmail && !realLeadId) return output;
  return {
    ...output,
    ...(realEmail ? { to: realEmail } : {}),
    ...(realLeadId ? { leadId: realLeadId } : {}),
  };
}

/**
 * Map the qualifier's prompt-side recommendedAction value onto the
 * narrower DB enum. The two diverged historically (the prompt uses
 * funnel-step language, the DB uses dispatcher-step language) and the
 * cleanest hackathon fix is a deterministic mapping rather than a
 * schema migration.
 */
function mapRecommendedActionForDb(
  raw: unknown,
): "book_call" | "email_sequence" | "self_serve" | "reject" {
  if (raw === "book_call") return "book_call";
  if (raw === "free_trial") return "self_serve";
  if (raw === "demo_video") return "email_sequence";
  if (raw === "nurture") return "email_sequence";
  if (raw === "disqualify") return "reject";
  if (
    raw === "email_sequence" ||
    raw === "self_serve" ||
    raw === "reject"
  ) {
    return raw;
  }
  return "email_sequence";
}

/**
 * Stable id used as the primary key when persisting a persona's artifact
 * to its dedicated table. Prefers the LLM's own `id`/`draftId` (so re-runs
 * upsert into the same row) and falls back to a deterministic
 * `<personaId>-<runPrefix>-<leadIdSuffix>` string when the model omits one.
 */
function artifactIdFromOutput(
  personaId: PersonaId,
  workflowRunId: string,
  output: Record<string, unknown>,
): string {
  if (typeof output.id === "string" && output.id.length > 0) return output.id;
  if (typeof output.draftId === "string" && output.draftId.length > 0)
    return output.draftId;
  const leadId = typeof output.leadId === "string" ? output.leadId : "";
  return `${personaId}-${workflowRunId.slice(0, 8)}-${leadId.slice(-8)}`;
}

/**
 * Pulls the lead/trial-signal record fields out of a materialized task's
 * input so we can embed them in the approval row's proposed_action under
 * `_leadContext`. Returns undefined when the task isn't keyed off a known
 * source record (e.g. workflow-level personas like slack-digest).
 */
function getLeadContextFromInput(
  input: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const item = input.item;
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return item as Record<string, unknown>;
  }
  return undefined;
}

/**
 * Researcher Pattern B: pre-LLM Composio fetch for the single-task path.
 * Pulls email/name/company off `input.item` and runs LinkedIn + Apollo
 * lookups in parallel, returning a typed bundle for the prompt to read.
 */
async function fetchResearcherBundleForInput(
  input: Record<string, unknown>,
  userId: string,
) {
  const itemRaw = input.item;
  const item =
    itemRaw && typeof itemRaw === "object" && !Array.isArray(itemRaw)
      ? (itemRaw as Record<string, unknown>)
      : {};
  return fetchResearcherBundle(userId, {
    email: typeof item.email === "string" ? item.email : undefined,
    name: typeof item.name === "string" ? item.name : undefined,
    company: typeof item.company === "string" ? item.company : undefined,
  });
}

/**
 * Researcher Pattern B: pre-LLM Composio fetch for the batch path. Each
 * envelope in the batch gets its own bundle fetched concurrently before
 * the synthesizer LLM runs.
 */
async function enrichEnvelopesWithResearcherBundle(
  envelopes: BatchItemEnvelope[],
  userId: string,
): Promise<BatchItemEnvelope[]> {
  return Promise.all(
    envelopes.map(async (env) => {
      const payload = env.payload;
      const bundle = await fetchResearcherBundle(userId, {
        email: typeof payload.email === "string" ? payload.email : undefined,
        name: typeof payload.name === "string" ? payload.name : undefined,
        company:
          typeof payload.company === "string" ? payload.company : undefined,
      });
      return {
        ...env,
        payload: { ...payload, fetchBundle: bundle },
      };
    }),
  );
}

function injectItemContext(
  input: Record<string, unknown>,
  ctx: WorkContext,
): Record<string, unknown> {
  // Skip if the dispatcher already populated `item` (e.g. from a fanout
  // template) — don't clobber existing context.
  if (input.item && typeof input.item === "object") return input;

  const leadId = typeof input.leadId === "string" ? input.leadId : undefined;
  if (leadId) {
    const lead = ctx.items.leads.find((l) => l.id === leadId);
    if (lead) return { ...input, item: lead.fields };
  }
  const trialSignalId =
    typeof input.trialSignalId === "string" ? input.trialSignalId : undefined;
  if (trialSignalId) {
    const trial = ctx.items["trial-signals"].find(
      (t) => t.id === trialSignalId,
    );
    if (trial) return { ...input, item: trial.fields };
  }
  return input;
}

function substituteEach(
  input: Record<string, unknown>,
  itemId: string,
): Record<string, unknown> {
  return substituteValue(input, itemId) as Record<string, unknown>;
}

function substituteValue(v: unknown, itemId: string): unknown {
  if (typeof v === "string") return v.replace(/\$\{each\}/g, itemId);
  if (Array.isArray(v)) return v.map((x) => substituteValue(x, itemId));
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, val]) => [
        k,
        substituteValue(val, itemId),
      ]),
    );
  }
  return v;
}

// ============================================================================
//  Dispatcher: dependency-aware, output-threading
// ============================================================================

type TaskResult =
  | { ok: true; output: Record<string, unknown> }
  | { ok: false; reason: "failed" | "skipped"; message: string };

function makeSemaphore(max: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((r) => waiters.push(r));
    }
    active++;
    try {
      return await fn();
    } finally {
      active--;
      const next = waiters.shift();
      if (next) next();
    }
  };
}

/**
 * Personas that produce write-side artifacts requiring founder approval before
 * the system actually fires the external action (Gmail send, Calendar invite,
 * Intercom DM, CRM write). The dispatcher inspects each persona's output and
 * inserts an approval_requests row when the artifact comes back with
 * `approvalStatus: "pending"`. The dashboard's bulk-approval UI picks them up.
 */
const APPROVAL_RULES: Partial<
  Record<
    PersonaId,
    {
      artifactType: ApprovalArtifactType;
      blastRadius: BlastRadius;
      reason: (out: Record<string, unknown>) => string;
    }
  >
> = {
  writer: {
    artifactType: "OutreachDraft",
    blastRadius: "external",
    reason: (out) => {
      const subject = (out.subject as string | undefined) ?? "(no subject)";
      return `Send Gmail draft "${subject}" to a real prospect.`;
    },
  },
  scheduler: {
    artifactType: "CustomDeal",
    blastRadius: "external",
    reason: () => "Send a calendar invite + create a real meeting.",
  },
  activation: {
    artifactType: "ActivationNudge",
    blastRadius: "external",
    reason: () => "Send an in-product / email nudge to a trial user.",
  },
  "crm-logger": {
    artifactType: "CRMUpdate",
    blastRadius: "internal",
    reason: () => "Write to HubSpot / Sheets.",
  },
};

async function maybeRaiseApproval(
  workflowRunId: string,
  personaId: PersonaId,
  output: Record<string, unknown>,
  ctx: {
    leadContext?: Record<string, unknown>;
    upstreamOutputs?: Record<string, Record<string, unknown>>;
  } = {},
): Promise<void> {
  const rule = APPROVAL_RULES[personaId];
  if (!rule) return;
  // Only raise if the artifact explicitly asked to pause (most do via
  // `approvalStatus: "pending"`; crm-logger has no such field, so we always
  // raise for it). Skip if the row carries an `error` field (per-item
  // batch failure — already represented as a failed node).
  if (typeof (output as { error?: unknown }).error === "string") return;
  const status = (output as { approvalStatus?: string }).approvalStatus;
  if (status !== undefined && status !== "pending") return;

  const artifactId =
    (output.id as string | undefined) ??
    (output.draftId as string | undefined) ??
    `${personaId}-${workflowRunId.slice(0, 8)}`;

  // Embed lead context + the actual upstream reasoning under `_` keys so the
  // approval card can render "who this is for" and "why this draft" without
  // hitting the DB or guessing at fields. Underscore prefix marks them as
  // card-metadata, distinct from the persona's real artifact schema.
  const proposedAction: Record<string, unknown> = { ...output };
  if (ctx.leadContext) proposedAction._leadContext = ctx.leadContext;
  if (ctx.upstreamOutputs && Object.keys(ctx.upstreamOutputs).length > 0) {
    proposedAction._upstreamOutputs = ctx.upstreamOutputs;
  }

  await raiseApproval({
    workflowRunId,
    artifactType: rule.artifactType,
    artifactId,
    blastRadius: rule.blastRadius,
    reason: rule.reason(output),
    proposedAction,
  });
}

/**
 * Materialize the LLM's typed output into the dedicated artifact table that
 * the dashboard reads from. Failures are swallowed (with a warn) — the
 * approval row in `approval_requests.proposed_action` is still the source
 * of truth for the founder review surface; this is purely so the pipeline
 * counters and historical artifact pages have rows to query.
 */
async function persistArtifact(
  personaId: PersonaId,
  artifactId: string,
  output: Record<string, unknown>,
): Promise<void> {
  try {
    const leadId =
      typeof output.leadId === "string" ? output.leadId : undefined;
    if (personaId === "writer" && leadId) {
      const body = output.body as string | undefined;
      if (!body) return;
      const channelRaw = output.channel as string | undefined;
      const channel: "email" | "linkedin" =
        channelRaw === "linkedin" ? "linkedin" : "email";
      await db
        .insert(schema.outreachDrafts)
        .values({
          id: artifactId,
          leadId,
          channel,
          subject: (output.subject as string | undefined) ?? null,
          body,
          approvalStatus: "pending",
          founderEdits: null,
        })
        .onConflictDoNothing();
      return;
    }

    if (personaId === "researcher" && leadId) {
      // EnrichedLead → enriched_leads. Most fields are nullable so a
      // researcher that only inferred companyDomain still persists cleanly.
      // recentSocial is dropped on persist — the DB schema's shape (platform/
      // content/url) drifted from the Zod schema's (source/excerpt/postedAt);
      // not load-bearing for the demo so we just don't store it.
      const seniority = output.personSeniority;
      const validSeniorities = [
        "IC",
        "Manager",
        "Director",
        "VP",
        "CXO",
        "Founder",
      ] as const;
      const seniorityValue =
        typeof seniority === "string" &&
        (validSeniorities as readonly string[]).includes(seniority)
          ? (seniority as (typeof validSeniorities)[number])
          : null;
      await db
        .insert(schema.enrichedLeads)
        .values({
          id: artifactId,
          leadId,
          linkedinUrl:
            (output.linkedinUrl as string | null | undefined) ?? null,
          companyDomain:
            (output.companyDomain as string | null | undefined) ?? null,
          companySize:
            typeof output.companySize === "number" ? output.companySize : null,
          companyIndustry:
            (output.companyIndustry as string | null | undefined) ?? null,
          personRole: (output.personRole as string | null | undefined) ?? null,
          personSeniority: seniorityValue,
          intentSignals: Array.isArray(output.intentSignals)
            ? (output.intentSignals as string[])
            : [],
          techStack: Array.isArray(output.techStack)
            ? (output.techStack as string[])
            : null,
          recentSocial: null,
        })
        .onConflictDoNothing();
      return;
    }

    if (personaId === "qualifier" && leadId) {
      // QualifiedLead → qualified_leads. The qualifier's prompt-side
      // recommendedAction enum (book_call, free_trial, demo_video, nurture,
      // disqualify) drifted from the DB enum (book_call, email_sequence,
      // self_serve, reject) — we map between them on persist.
      const tier = output.tier;
      if (
        typeof tier !== "string" ||
        !["hot", "warm", "cold", "disqualified"].includes(tier)
      )
        return;
      await db
        .insert(schema.qualifiedLeads)
        .values({
          id: artifactId,
          leadId,
          tier: tier as "hot" | "warm" | "cold" | "disqualified",
          fitScore:
            typeof output.fitScore === "number" ? output.fitScore : 0,
          fitReasons: Array.isArray(output.fitReasons)
            ? (output.fitReasons as string[])
            : [],
          intentScore:
            typeof output.intentScore === "number" ? output.intentScore : 0,
          intentReasons: Array.isArray(output.intentReasons)
            ? (output.intentReasons as string[])
            : [],
          recommendedAction: mapRecommendedActionForDb(
            output.recommendedAction,
          ),
        })
        .onConflictDoNothing();
      return;
    }

    if (personaId === "strategist" && leadId) {
      // OutreachStrategy → outreach_strategies. DB tier enum doesn't include
      // "disqualified" → coerce those to "cold" (which is what the writer
      // would treat them as anyway). callToAction enum matches.
      const rawTier = output.tier;
      if (typeof rawTier !== "string") return;
      const tier: "hot" | "warm" | "cold" =
        rawTier === "hot" || rawTier === "warm" ? rawTier : "cold";
      const ctaRaw = output.callToAction;
      const callToAction: "book_call" | "free_trial" | "demo_video" =
        ctaRaw === "book_call" || ctaRaw === "free_trial"
          ? ctaRaw
          : "demo_video";
      await db
        .insert(schema.outreachStrategies)
        .values({
          id: artifactId,
          leadId,
          tier,
          angle: (output.angle as string | undefined) ?? "",
          toneGuide: (output.toneGuide as string | undefined) ?? "",
          callToAction,
          customHooks: Array.isArray(output.customHooks)
            ? (output.customHooks as string[])
            : [],
        })
        .onConflictDoNothing();
      return;
    }
    // Other artifact types (BookedMeeting, ActivationNudge, PrepBrief) follow
    // the same pattern; wired up as their personas come online.
  } catch (err) {
    console.warn(
      `[persistArtifact:${personaId}] failed to write ${artifactId}: ${err instanceof Error ? err.message : err}`,
    );
  }
}

function passThroughOutput(
  upstream: WorkflowTask,
  output: Record<string, unknown>,
): Record<string, unknown> {
  const whitelist = upstream.passOutput;
  // Default (no whitelist): expose all keys. Explicit empty array: expose none.
  if (whitelist === undefined) return output;
  if (whitelist.length === 0) return {};
  const filtered: Record<string, unknown> = {};
  for (const key of whitelist) {
    if (key in output) filtered[key] = output[key];
  }
  return filtered;
}

export async function runWorkflow(
  workflowRunId: string,
  prompt: string,
  founderId: string = "default",
): Promise<void> {
  await markRunRunning(workflowRunId);

  const workContext = await loadWorkContext();

  let dag: WorkflowDAG;
  try {
    dag = await runConductor(workflowRunId, prompt, founderId, workContext);
  } catch (err) {
    await markRunFailed(workflowRunId, err);
    throw err;
  }

  try {
    const materializedTasks = expandPlan(dag, workContext);
    await persistPlan(workflowRunId, dag, materializedTasks);

    {
      const { eventBus } = await import("@/lib/realtime/bus");
      eventBus.emit("workflow_planned", {
        workflowRunId,
        plan: { tasks: materializedTasks, edges: dag.edges },
      });
    }

    const concurrency = getDispatchConcurrency();
    const withSlot = makeSemaphore(concurrency);
    const taskById = new Map(materializedTasks.map((t) => [t.id, t]));
    const results = new Map<string, Promise<TaskResult>>();

    // Per (specialistId, batchGroup) — shared promise that resolves when the
    // batch persona run completes. All shadow tasks await this, then pluck
    // their per-item slice. One LLM call powers all shadows in the group.
    const batchGroupPromises = new Map<
      string,
      Promise<BatchResult<Record<string, unknown>>>
    >();

    const runOne = async (task: MaterializedTask): Promise<TaskResult> => {
      const deps = task.dependsOn ?? [];
      const depResults: TaskResult[] = await Promise.all(
        deps.map((d) => results.get(d)!),
      );

      const triggerRule = task.triggerRule ?? "all_success";
      const failedDepIdx = depResults.findIndex((r) => !r.ok);
      if (failedDepIdx !== -1 && triggerRule === "all_success") {
        const reason = `Upstream not successful: ${deps[failedDepIdx]} (${depResults[failedDepIdx].ok === false ? depResults[failedDepIdx].reason : "?"})`;
        const nodeId = nodeRowId(workflowRunId, task.id);
        await markNodeSkipped(nodeId, reason);
        await emitEvent(workflowRunId, task.id, "persona_completed", {
          personaId: task.specialistId,
          status: "skipped",
          reason,
        });
        return { ok: false, reason: "skipped", message: reason };
      }

      const previousOutputs: Record<string, Record<string, unknown>> = {};
      for (let i = 0; i < deps.length; i++) {
        const r = depResults[i];
        if (!r.ok) continue;
        const depTask = taskById.get(deps[i])!;
        const passed = passThroughOutput(depTask, r.output);
        // Always write the suffixed key (e.g. `strategist__seed-lead-005`)
        // so downstream code that needs lineage can find the exact upstream.
        previousOutputs[deps[i]] = passed;
        // Also expose the same output under the short key (e.g. `strategist`)
        // so persona prompts can read `previousOutputs.strategist.<field>`
        // without knowing whether the upstream was a fanout shadow. Short
        // keys win over suffixed for shape consistency; if multiple shadows
        // share a downstream (rare) the last write wins.
        previousOutputs[depTask.specialistId] = passed;
      }

      return withSlot(() => dispatch(task, previousOutputs));
    };

    const dispatch = async (
      task: MaterializedTask,
      previousOutputs: Record<string, Record<string, unknown>>,
    ): Promise<TaskResult> => {
      const nodeId = nodeRowId(workflowRunId, task.id);
      await markNodeRunning(nodeId);

      // Batch path: coalesce all shadow tasks of this batchGroup into one
      // runPersonaBatch call. The first shadow to arrive kicks the call;
      // every other shadow awaits the same promise and reads its slice.
      if (task.mode === "batch" && task.batchGroup) {
        const groupKey = `${task.specialistId}::${task.batchGroup}`;
        let groupPromise = batchGroupPromises.get(groupKey);
        if (!groupPromise) {
          const groupTasks = materializedTasks.filter(
            (t) =>
              (t as MaterializedTask).batchGroup === task.batchGroup &&
              t.specialistId === task.specialistId,
          );
          const envelopes: BatchItemEnvelope[] = groupTasks.map((t) => {
            const id = extractItemIdFromTaskId(t.id);
            const itemFields =
              (t.input as { item?: Record<string, unknown> }).item ?? {};
            return {
              id,
              payload: {
                ...itemFields,
                // Per-item upstream context for batch members. Same shape as
                // single-task path so prompts can read previousOutputs.<dep>.
                previousOutputs,
              },
            };
          });
          // Pattern B for researcher: deterministic Composio fetches happen
          // here (in workflow code), the LLM only synthesizes. Each envelope
          // gets its own fetchBundle splatted into the payload before the
          // batch runs. Fetches are concurrent across the batch.
          const enriched =
            task.specialistId === "researcher"
              ? await enrichEnvelopesWithResearcherBundle(envelopes, founderId)
              : envelopes;
          groupPromise = runPersonaBatch<Record<string, unknown>>(
            task.specialistId,
            enriched,
            founderId,
            { workflowRunId, nodeId: `${task.specialistId}__BATCH` },
          );
          batchGroupPromises.set(groupKey, groupPromise);
        }

        try {
          const batchResult = await groupPromise;
          const myId = extractItemIdFromTaskId(task.id);
          const myOutput = batchResult.items.get(myId);
          if (!myOutput) {
            const reason = `batch dropped item id ${myId}`;
            await markNodeFailed(nodeId, new Error(reason));
            return { ok: false, reason: "failed", message: reason };
          }
          // Error row: model emitted a per-item failure (e.g. integration_not_connected).
          // Mark the node failed so skip-cascade fires for downstream chains
          // depending on this specific item, while sibling items proceed.
          if (typeof (myOutput as { error?: unknown }).error === "string") {
            const reason = `batch item error: ${(myOutput as { error: string }).error}`;
            await markNodeFailed(nodeId, new Error(reason));
            return { ok: false, reason: "failed", message: reason };
          }
          await markNodeDone(nodeId);
          const finalBatchOutput =
            task.specialistId === "writer"
              ? enforceWriterRecipientFromInput(myOutput, task.input)
              : myOutput;
          // Persist artifact regardless of whether it triggers an approval.
          // (Researcher/qualifier/strategist don't raise approvals but still
          // need to land in their dedicated tables for the pipeline widget.)
          await persistArtifact(
            task.specialistId,
            artifactIdFromOutput(
              task.specialistId,
              workflowRunId,
              finalBatchOutput,
            ),
            finalBatchOutput,
          );
          await maybeRaiseApproval(
            workflowRunId,
            task.specialistId,
            finalBatchOutput,
            {
              leadContext: getLeadContextFromInput(task.input),
              upstreamOutputs: previousOutputs,
            },
          );
          return { ok: true, output: finalBatchOutput };
        } catch (err) {
          await markNodeFailed(nodeId, err);
          return { ok: false, reason: "failed", message: errorToMessage(err) };
        }
      }

      // Single-task fanout path (default).
      try {
        // Pattern B for researcher (single mode): fetch external bundle in
        // code BEFORE invoking the LLM, splat it into input.fetchBundle.
        const baseInput: Record<string, unknown> = {
          ...task.input,
          previousOutputs,
          workflowRunId,
          nodeId: task.id,
        };
        const inputForRun =
          task.specialistId === "researcher"
            ? {
                ...baseInput,
                fetchBundle: await fetchResearcherBundleForInput(
                  task.input,
                  founderId,
                ),
              }
            : baseInput;
        const out = await runPersonaWithFallback(
          task.specialistId,
          inputForRun,
          founderId,
        );
        await markNodeDone(nodeId);
        const finalOut =
          task.specialistId === "writer"
            ? enforceWriterRecipientFromInput(
                (out ?? {}) as Record<string, unknown>,
                task.input,
              )
            : ((out ?? {}) as Record<string, unknown>);
        await persistArtifact(
          task.specialistId,
          artifactIdFromOutput(task.specialistId, workflowRunId, finalOut),
          finalOut,
        );
        await maybeRaiseApproval(workflowRunId, task.specialistId, finalOut, {
          leadContext: getLeadContextFromInput(task.input),
          upstreamOutputs: previousOutputs,
        });
        return { ok: true, output: finalOut };
      } catch (err) {
        await markNodeFailed(nodeId, err);
        return { ok: false, reason: "failed", message: errorToMessage(err) };
      }
    };

    function extractItemIdFromTaskId(taskId: string): string {
      const idx = taskId.indexOf("__");
      return idx === -1 ? taskId : taskId.slice(idx + 2);
    }

    for (const task of materializedTasks) {
      results.set(task.id, runOne(task));
    }

    const settled = await Promise.all(results.values());

    // Terminal state: succeed only if at least one task actually produced a
    // result. Previously the workflow always flipped to "done" regardless of
    // task outcomes, which meant a Conductor that planned a malformed task
    // (e.g. writer with recipientEmail instead of leadId — Zod-rejected at
    // input stage) ended up in state="done" with zero approvals. The
    // dashboard then shows DONE but the founder has nothing to review.
    const successes = settled.filter((r) => r.ok).length;
    const failures = settled.filter((r) => !r.ok && r.reason === "failed")
      .length;
    if (settled.length === 0 || successes === 0) {
      const reason =
        settled.length === 0
          ? "Conductor produced no executable tasks"
          : `All ${failures} tasks failed`;
      await emitEvent(workflowRunId, null, "workflow_done", { state: "failed" });
      await markRunFailed(workflowRunId, new Error(reason));
      return;
    }

    await emitEvent(workflowRunId, null, "workflow_done", { state: "done" });
    await markRunDone(workflowRunId);
  } catch (err) {
    await markRunFailed(workflowRunId, err);
    throw err;
  }
}
