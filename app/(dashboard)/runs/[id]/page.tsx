import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { LiveRunSurface } from "@/lib/ui/components/live-run-surface";
import { db, schema } from "@/lib/state/db";
import { MOCK_PAST_RUNS } from "@/lib/shared/mocks";
import type {
  ActivityEvent,
  WorkflowDAG,
  WorkflowRun,
} from "@/lib/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

interface RunRow extends WorkflowRun {
  title: string | null;
}

async function loadRun(id: string): Promise<RunRow | null> {
  const rows = await db
    .select()
    .from(schema.workflowRuns)
    .where(eq(schema.workflowRuns.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    prompt: row.prompt,
    state: row.state,
    plan: (row.plan as WorkflowDAG | null) ?? null,
    errorMessage: row.errorMessage,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
  };
}

async function loadEvents(runId: string): Promise<ActivityEvent[]> {
  const rows = await db
    .select()
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.workflowRunId, runId))
    .orderBy(asc(schema.activityEvents.timestamp));
  return rows.map((r) => ({
    id: r.id,
    workflowRunId: r.workflowRunId,
    nodeId: r.nodeId,
    type: r.type,
    payload: r.payload as Record<string, unknown>,
    link: r.link,
    timestamp: r.timestamp,
  }));
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;

  // Mock-mode IDs never touch SQLite — synthesize a placeholder snapshot.
  // Either the id matches a fixture in MOCK_PAST_RUNS (sidebar click) or
  // it's a freshly-submitted prompt under `mock-run-<base36>`. Either way,
  // LiveRunSurface will overlay the localStorage prompt on the client.
  if (id.startsWith("mock-run-") || id.startsWith("mock-past-run-")) {
    const fixture = MOCK_PAST_RUNS.find((r) => r.id === id);
    return (
      <LiveRunSurface
        initial={{
          id,
          prompt: fixture?.prompt ?? "(mock run)",
          title: fixture?.title ?? null,
          state: fixture?.state ?? "running",
          startedAt: fixture?.startedAt ?? new Date().toISOString(),
          plan: fixture?.plan ?? null,
          events: [],
        }}
      />
    );
  }

  const run = await loadRun(id);
  if (!run) notFound();

  const events = await loadEvents(id);

  return (
    <LiveRunSurface
      initial={{
        id: run.id,
        prompt: run.prompt,
        title: run.title,
        state: run.state,
        startedAt: run.startedAt.toISOString(),
        plan: run.plan ?? null,
        events,
      }}
    />
  );
}
