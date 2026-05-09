"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useDefaultLayout } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ActivityFeed } from "@/lib/ui/components/activity-feed";
import { DAGView } from "@/lib/ui/components/dag-view";
import { LiveApprovalSurface } from "@/lib/ui/components/live-approval-surface";
import { PromptInput } from "@/lib/ui/components/prompt-input";
import { RunHeader } from "@/lib/ui/components/run-header";
import { StateSidebar } from "@/lib/ui/components/state-sidebar";
import {
  applyEventToActiveRun,
  useActiveRun,
} from "@/lib/ui/hooks/use-active-run";
import { useMockDriver, MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import { useSharedEvents } from "@/lib/ui/hooks/use-shared-events";
import type { WireEvent } from "@/lib/realtime/events";
import type { WorkflowDAG } from "@/lib/shared/types";

const PANEL_IDS: string[] = ["prompt", "dag", "sidebar"];

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

const Hero = (
  <div className="px-1 pb-1">
    <h1 className="text-6xl tracking-tight font-[family-name:var(--font-space-grotesk)]">
      GMaestro{" "}
      <span className="text-muted-foreground">- GStack for GTM</span>
    </h1>
    <p className="mt-1 text-sm text-muted-foreground">
      You → Conductor → 4 managers → 13 specialists across 45 integrations.{" "}
      <em>A real chain of command.</em>
    </p>
  </div>
);

export default function DashboardPage() {
  const { run, start } = useActiveRun();

  // Persist column widths in localStorage. The hook's `storage` default
  // evaluates `localStorage` directly, which throws on the server — supply a
  // noop shim during SSR. Memoized so the hook's internal deps stay stable.
  const layoutStorage = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.localStorage
        : { getItem: () => null, setItem: () => {} },
    [],
  );
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "gmaestro-dashboard-cols",
    panelIds: PANEL_IDS,
    storage: layoutStorage,
  });

  // Shared SSE feed: a single, unfiltered EventSource (in `use-shared-events`)
  // that survives navigation between sibling pages. We filter to the active
  // run client-side so the DAG/feed only show events for the current run,
  // but the connection itself stays open even when the dashboard page is
  // unmounted (e.g., while the founder is on /approvals).
  const allEvents = useSharedEvents();
  const events = useMemo<WireEvent[]>(() => {
    if (!run) return [];
    return allEvents.filter((e) => {
      const wfId = (e.payload as { workflowRunId?: string }).workflowRunId;
      return !wfId || wfId === run.id;
    });
  }, [allEvents, run]);

  useMockDriver(run?.id ?? null);

  // Drive run-state transitions (planned → running → awaiting_approval → done)
  // off the latest filtered event. Centralizing this in the page is fine —
  // the underlying store is module-level, so any component reading
  // `useActiveRun()` sees the result.
  useEffect(() => {
    applyEventToActiveRun(events);
  }, [events]);

  // Deep link: ?runId=<uuid> attaches the dashboard to an in-flight run kicked
  // outside the prompt input (e.g. via curl / smoke script). The plan replays
  // through the SSE planCache, so the DAG fills in once the stream connects.
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("runId");
    if (!id) return;
    if (run?.id === id) return;
    start({
      id,
      prompt: "(loaded from URL)",
      state: "running",
      startedAt: new Date(),
      plan: null,
    });
    // `start` is a stable useCallback; depending on `run` would re-fire after
    // every store mutation. We only care about the URL changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleRunStarted = (id: string, prompt: string) => {
    start({
      id,
      prompt,
      state: "running",
      startedAt: new Date(),
      plan: MOCK_MODE ? MOCK_PLAN : null,
    });
  };

  if (!run) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-9rem)] w-full max-w-3xl flex-col justify-center gap-20">
        {Hero}
        <PromptInput onRunStarted={handleRunStarted} />
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="pt-10">{Hero}</div>

      <RunHeader
        runId={run.id}
        prompt={run.prompt}
        state={run.state}
        startedAt={run.startedAt}
      />

      {(() => {
        const promptCol = <PromptInput onRunStarted={handleRunStarted} />;
        const dagCol = <DAGView plan={run.plan} events={events} />;
        const sideCol = (
          <aside className="grid gap-4">
            <StateSidebar events={events} />
            <ActivityFeed events={events} />
            {MOCK_MODE && (
              <div className="rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2 font-mono text-[10px] text-muted-foreground">
                stream: shared
              </div>
            )}
          </aside>
        );
        return (
          <>
            <div className="grid grid-cols-1 gap-4 lg:hidden">
              {promptCol}
              {dagCol}
              {sideCol}
            </div>

            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={defaultLayout}
              onLayoutChanged={onLayoutChanged}
              className="hidden lg:flex !h-auto items-stretch"
            >
              <ResizablePanel
                id="prompt"
                defaultSize="25%"
                minSize="220px"
                className="pr-3"
              >
                {promptCol}
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-transparent hover:bg-border" />

              <ResizablePanel
                id="dag"
                defaultSize="50%"
                minSize="360px"
                className="px-3"
              >
                {dagCol}
              </ResizablePanel>

              <ResizableHandle withHandle className="bg-transparent hover:bg-border" />

              <ResizablePanel
                id="sidebar"
                defaultSize="25%"
                minSize="240px"
                className="pl-3"
              >
                {sideCol}
              </ResizablePanel>
            </ResizablePanelGroup>
          </>
        );
      })()}

      <LiveApprovalSurface />
    </div>
  );
}
