"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ActivityFeed } from "@/lib/ui/components/activity-feed";
import { DAGView } from "@/lib/ui/components/dag-view";
import { LiveApprovalSurface } from "@/lib/ui/components/live-approval-surface";
import { PromptInput } from "@/lib/ui/components/prompt-input";
import { RunHeader } from "@/lib/ui/components/run-header";
import { StateSidebar } from "@/lib/ui/components/state-sidebar";
import { useEventStream } from "@/lib/ui/hooks/use-event-stream";
import { useMockDriver, MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import type { WorkflowDAG, WorkflowState } from "@/lib/shared/types";

const MOCK_PLAN: WorkflowDAG = {
  tasks: [
    { id: "researcher-1", specialistId: "researcher", input: {} },
    { id: "qualifier-1", specialistId: "qualifier", input: {}, dependsOn: ["researcher-1"] },
    { id: "strategist-1", specialistId: "strategist", input: {}, dependsOn: ["qualifier-1"] },
    { id: "writer-1", specialistId: "writer", input: {}, dependsOn: ["strategist-1"] },
    { id: "activation-1", specialistId: "activation", input: {} },
    { id: "crm-logger-1", specialistId: "crm-logger", input: {}, dependsOn: ["writer-1"] },
  ],
  edges: [
    { from: "researcher-1", to: "qualifier-1", artifactType: "EnrichedLead" },
    { from: "qualifier-1", to: "strategist-1", artifactType: "QualifiedLead" },
    { from: "strategist-1", to: "writer-1", artifactType: "OutreachStrategy" },
    { from: "writer-1", to: "crm-logger-1", artifactType: "OutreachDraft" },
  ],
};

interface ActiveRun {
  id: string;
  prompt: string;
  state: WorkflowState;
  startedAt: Date;
  plan: WorkflowDAG | null;
}

export default function DashboardPage() {
  const [run, setRun] = useState<ActiveRun | null>(null);
  const { events, status } = useEventStream(run?.id);
  useMockDriver(run?.id ?? null);

  // Deep link: ?runId=<uuid> attaches the dashboard to an in-flight run kicked
  // outside the prompt input (e.g. via curl / smoke script). The plan replays
  // through the SSE planCache, so the DAG fills in once the stream connects.
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("runId");
    if (!id) return;
    setRun((prev) => {
      if (prev?.id === id) return prev;
      return {
        id,
        prompt: "(loaded from URL)",
        state: "running",
        startedAt: new Date(),
        plan: null,
      };
    });
  }, [searchParams]);

  // Subscribe to workflow_planned (push the DAG into the run), workflow_done,
  // and approval_* to keep run state in sync with the bus.
  //
  // CRITICAL: depend on `events` only — including `run` here would cause an
  // infinite loop because setRun creates a new object reference and re-fires
  // the effect. Use functional setState to read the current run inside the
  // closure, and return the same reference when no change is needed so React
  // bails out of the re-render.
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    setRun((prev) => {
      if (!prev) return prev;
      if (last.type === "workflow_planned" && !prev.plan) {
        return { ...prev, plan: last.payload.plan };
      }
      if (last.type === "workflow_done") {
        const nextState =
          last.payload.state === "failed" ? "failed" : "done";
        return prev.state === nextState ? prev : { ...prev, state: nextState };
      }
      if (last.type === "approval_requested") {
        return prev.state === "awaiting_approval"
          ? prev
          : { ...prev, state: "awaiting_approval" };
      }
      if (
        last.type === "approval_resolved" &&
        prev.state === "awaiting_approval"
      ) {
        return { ...prev, state: "running" };
      }
      return prev;
    });
  }, [events]);

  const handleRunStarted = (id: string, prompt: string) => {
    setRun({
      id,
      prompt,
      state: "running",
      startedAt: new Date(),
      plan: MOCK_MODE ? MOCK_PLAN : null,
    });
  };

  return (
    <div className="grid gap-4">
      <div className="px-1 pb-1 pt-10">
        <h1 className="text-6xl tracking-tight font-[family-name:var(--font-space-grotesk)]">
          GMaestro{" "}
          <span className="text-muted-foreground">- GStack for GTM</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          You → Conductor → 4 managers → 13 specialists across 45 integrations.{" "}
          <em>A real chain of command.</em>
        </p>
      </div>

      <PromptInput onRunStarted={handleRunStarted} />

      {run && (
        <RunHeader
          runId={run.id}
          prompt={run.prompt}
          state={run.state}
          startedAt={run.startedAt}
        />
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-9">
          <DAGView plan={run?.plan ?? null} events={events} />
        </div>

        <aside className="col-span-12 grid gap-4 lg:col-span-3">
          <StateSidebar events={events} />
          <ActivityFeed events={events} />
          <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 font-mono text-[10px] text-muted-foreground">
            stream: {status}
          </div>
        </aside>
      </div>

      <LiveApprovalSurface events={events} />
    </div>
  );
}
