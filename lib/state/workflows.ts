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
import { PERSONA_REGISTRY } from "@/lib/personas/registry";
import { getDispatchConcurrency } from "@/lib/shared/env";
import { makeMockPersonaRuntime } from "@/lib/shared/mocks";
import { emitEvent } from "@/lib/state/activity";
import {
  fanoutItems,
  loadWorkContext,
  type WorkContext,
} from "./work-context";
import type {
  FanoutSource,
  PersonaId,
  TaskMode,
  WorkflowDAG,
  WorkflowTask,
} from "@/lib/shared/types";
import { db, schema } from "./db";

const mockPersonaImpl = makeMockPersonaRuntime();

function shouldUseMockPersonas(): boolean {
  return (
    process.env.GMAESTRO_MOCK_PERSONAS === "1" ||
    !process.env.ANTHROPIC_API_KEY
  );
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
  return { ...task, dependsOn };
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
        if (r.ok) {
          previousOutputs[deps[i]] = passThroughOutput(
            taskById.get(deps[i])!,
            r.output,
          );
        }
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
          groupPromise = runPersonaBatch<Record<string, unknown>>(
            task.specialistId,
            envelopes,
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
          await markNodeDone(nodeId);
          return { ok: true, output: myOutput };
        } catch (err) {
          await markNodeFailed(nodeId, err);
          return { ok: false, reason: "failed", message: errorToMessage(err) };
        }
      }

      // Single-task fanout path (default).
      try {
        const out = await runPersonaWithFallback(
          task.specialistId,
          {
            ...task.input,
            previousOutputs,
            workflowRunId,
            nodeId: task.id,
          },
          founderId,
        );
        await markNodeDone(nodeId);
        return { ok: true, output: out ?? {} };
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

    await Promise.all(results.values());

    await emitEvent(workflowRunId, null, "workflow_done", { state: "done" });
    await markRunDone(workflowRunId);
  } catch (err) {
    await markRunFailed(workflowRunId, err);
    throw err;
  }
}
