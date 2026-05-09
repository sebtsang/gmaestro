import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pMap from "p-map";
import { runConductor } from "@/lib/orchestrator/conductor";
import { runPersona } from "@/lib/personas/runtime";
import { getDispatchConcurrency } from "@/lib/shared/env";
import { makeMockPersonaRuntime } from "@/lib/shared/mocks";
import { emitEvent } from "@/lib/state/activity";
import type { PersonaId, WorkflowDAG, WorkflowTask } from "@/lib/shared/types";
import { db, schema } from "./db";

/**
 * Persona dispatch with mock fallback.
 *
 * Mirrors the conductor's pattern: when ANTHROPIC_API_KEY isn't set or the
 * GMAESTRO_MOCK_PERSONAS flag is on, use the in-memory mock so the dashboard
 * still has something to render and the smoke path still exercises the
 * orchestrator. The mock doesn't emit events itself, so we emit them here
 * around the call so the activity feed lights up either way.
 *
 * Real mode (ANTHROPIC_API_KEY set, no flag) calls Session 2's runPersona
 * which emits its own persona_started / persona_completed events — we MUST
 * NOT double-emit, so the around-emission only runs in mock mode.
 */
const mockPersonaImpl = makeMockPersonaRuntime();

function shouldUseMockPersonas(): boolean {
  return (
    process.env.GMAESTRO_MOCK_PERSONAS === "1" ||
    !process.env.ANTHROPIC_API_KEY
  );
}

/** Maps mock persona output to an artifact_created event payload. */
function mockArtifactType(personaId: PersonaId): string | null {
  switch (personaId) {
    case "researcher": return "EnrichedLead";
    case "qualifier": return "QualifiedLead";
    case "strategist": return "OutreachStrategy";
    case "writer": return "OutreachDraft";
    case "scheduler": return "BookedMeeting";
    case "brief-writer": return "PrepBrief";
    case "activation": return "ActivationNudge";
    default: return null; // crm-logger / pipeline-reporter / digest / tagger / synth / filer don't surface as pipeline counters
  }
}

async function runPersonaWithFallback(
  personaId: PersonaId,
  input: Record<string, unknown> & { workflowRunId?: string; nodeId?: string },
  founderId: string,
): Promise<unknown> {
  if (shouldUseMockPersonas()) {
    const wfId = input.workflowRunId ?? "ad-hoc";
    const ndId = input.nodeId ?? personaId;
    await emitEvent(wfId, ndId, "persona_started", { personaId, input });
    const out = await mockPersonaImpl<Record<string, unknown>, unknown>(
      personaId,
      input,
    );
    // Mock fallback: surface artifact_created so the dashboard counters increment
    // (real runPersona would do this internally; the mock skips it).
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
    return out;
  }
  return runPersona(personaId, input, founderId);
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
  dag: WorkflowDAG,
): Promise<void> {
  await db
    .update(schema.workflowRuns)
    .set({ plan: dag })
    .where(eq(schema.workflowRuns.id, workflowRunId));

  if (dag.tasks.length === 0) return;

  await db.insert(schema.workflowNodes).values(
    dag.tasks.map((task) => ({
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

async function dispatchTask(
  workflowRunId: string,
  task: WorkflowTask,
  founderId: string,
): Promise<unknown> {
  const nodeId = nodeRowId(workflowRunId, task.id);
  await markNodeRunning(nodeId);
  try {
    const out = await runPersonaWithFallback(
      task.specialistId as PersonaId,
      { ...task.input, workflowRunId, nodeId: task.id },
      founderId,
    );
    await markNodeDone(nodeId);
    return out;
  } catch (err) {
    await markNodeFailed(nodeId, err);
    if (isIntegrationNotConnectedError(err)) {
      // Graceful degradation: integration not connected → mark this node failed
      // but let the rest of the workflow continue.
      return null;
    }
    throw err;
  }
}

export async function runWorkflow(
  workflowRunId: string,
  prompt: string,
  founderId: string = "default",
): Promise<void> {
  await markRunRunning(workflowRunId);

  let dag: WorkflowDAG;
  try {
    dag = await runConductor(workflowRunId, prompt, founderId);
  } catch (err) {
    await markRunFailed(workflowRunId, err);
    throw err;
  }

  try {
    await persistPlan(workflowRunId, dag);

    // Push the plan onto the bus (NOT persisted in activity_events) so the
    // dashboard can render the DAG immediately instead of waiting for the
    // first specialist event to surface a structure.
    {
      const { eventBus } = await import("@/lib/realtime/bus");
      eventBus.emit("workflow_planned", { workflowRunId, plan: dag });
    }

    // Note: pMap dispatches in array order with `concurrency` cap; it does NOT
    // honour `task.dependsOn`. Hackathon scope relies on the Conductor emitting
    // a topologically-reasonable order. A real DAG scheduler is P2.
    const concurrency = getDispatchConcurrency();
    await pMap(
      dag.tasks,
      (task) => dispatchTask(workflowRunId, task, founderId),
      { concurrency },
    );

    await emitEvent(workflowRunId, null, "workflow_done", { state: "done" });
    await markRunDone(workflowRunId);
  } catch (err) {
    await markRunFailed(workflowRunId, err);
    throw err;
  }
}
