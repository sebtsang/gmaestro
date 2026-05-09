"use client";

import { useEffect, useState } from "react";
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

  // Mark run done when workflow_done arrives.
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (last.type === "workflow_done" && run) {
      setRun({
        ...run,
        state: last.payload.state === "failed" ? "failed" : "done",
      });
    } else if (last.type === "approval_requested" && run) {
      setRun({ ...run, state: "awaiting_approval" });
    } else if (last.type === "approval_resolved" && run?.state === "awaiting_approval") {
      setRun({ ...run, state: "running" });
    }
  }, [events, run]);

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
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 grid gap-4 lg:col-span-9">
        <RunHeader
          runId={run?.id ?? null}
          prompt={run?.prompt ?? null}
          state={run?.state ?? null}
          startedAt={run?.startedAt ?? null}
        />
        <DAGView plan={run?.plan ?? null} events={events} />
        <PromptInput onRunStarted={handleRunStarted} />
      </div>

      <aside className="col-span-12 grid gap-4 lg:col-span-3">
        <StateSidebar events={events} />
        <ActivityFeed events={events} />
        <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 font-mono text-[10px] text-muted-foreground">
          stream: {status}
        </div>
      </aside>

      <LiveApprovalSurface events={events} />
    </div>
  );
}
