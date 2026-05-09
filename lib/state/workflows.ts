import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import pMap from "p-map";
import { runConductor } from "@/lib/orchestrator/conductor";
import { getDispatchConcurrency } from "@/lib/shared/env";
import { makeMockPersonaRuntime } from "@/lib/shared/mocks";
import type { PersonaId, WorkflowDAG, WorkflowTask } from "@/lib/shared/types";
import { db, schema } from "./db";

// TODO(session-2): replace with `import { runPersona } from "@/lib/personas/runtime"`
// once Session 2 lands. The mock runtime injects 100–500ms latency and never
// throws, so graceful-degradation branches stay dormant until then.
const runPersonaImpl = makeMockPersonaRuntime();

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
): Promise<unknown> {
  const nodeId = nodeRowId(workflowRunId, task.id);
  await markNodeRunning(nodeId);
  try {
    const out = await runPersonaImpl<Record<string, unknown>, unknown>(
      task.specialistId as PersonaId,
      { ...task.input, workflowRunId },
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

    // Note: pMap dispatches in array order with `concurrency` cap; it does NOT
    // honour `task.dependsOn`. Hackathon scope relies on the Conductor emitting
    // a topologically-reasonable order. A real DAG scheduler is P2.
    const concurrency = getDispatchConcurrency();
    await pMap(
      dag.tasks,
      (task) => dispatchTask(workflowRunId, task),
      { concurrency },
    );

    await markRunDone(workflowRunId);
  } catch (err) {
    await markRunFailed(workflowRunId, err);
    throw err;
  }
}
