import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { ActivityFeed } from "@/lib/ui/components/activity-feed";
import { ClosingBrief } from "@/lib/ui/components/closing-brief";
import { DAGView } from "@/lib/ui/components/dag-view";
import { RunHeader } from "@/lib/ui/components/run-header";
import { db, schema } from "@/lib/state/db";
import type {
  ActivityEvent,
  PrepBrief,
  WorkflowDAG,
  WorkflowRun,
} from "@/lib/shared/types";
import type { WireEvent } from "@/lib/realtime/events";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

async function loadRun(id: string): Promise<WorkflowRun | null> {
  const rows = await db
    .select()
    .from(schema.workflowRuns)
    .where(eq(schema.workflowRuns.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
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

async function loadLatestBriefForRun(runId: string): Promise<PrepBrief | null> {
  // Briefs are tied to BookedMeetings, which are tied to leads. There's no
  // direct workflow_run_id link, so we surface the most recently created brief
  // overall and let the page header's run id make the association obvious.
  // Hackathon scope: good enough for the demo.
  void runId;
  const rows = await db
    .select()
    .from(schema.prepBriefs)
    .orderBy(desc(schema.prepBriefs.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    meetingId: row.meetingId,
    notionPageUrl: row.notionPageUrl,
    leadSummary: row.leadSummary,
    companyContext: row.companyContext,
    likelyUseCase: row.likelyUseCase,
    similarPriorEmails: row.similarPriorEmails,
    talkingPoints: row.talkingPoints,
    questionsToAsk: row.questionsToAsk,
    potentialObjections: row.potentialObjections,
    recommendedNextSteps: row.recommendedNextSteps,
    createdAt: row.createdAt,
  };
}

function toWireEvents(events: ActivityEvent[]): WireEvent[] {
  return events.map(
    (e) =>
      ({
        type: e.type,
        payload: e.payload,
      }) as unknown as WireEvent,
  );
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run) notFound();

  const [events, brief] = await Promise.all([
    loadEvents(id),
    loadLatestBriefForRun(id),
  ]);
  const wire = toWireEvents(events);

  return (
    <div className="grid gap-4">
      <RunHeader
        runId={run.id}
        prompt={run.prompt}
        state={run.state}
        startedAt={run.startedAt}
      />
      <DAGView plan={run.plan ?? null} events={wire} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {brief ? <ClosingBrief brief={brief} /> : null}
        </div>
        <div>
          <ActivityFeed events={wire} max={120} />
        </div>
      </div>
    </div>
  );
}
