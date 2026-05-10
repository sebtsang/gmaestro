"use client";

/**
 * Renders an in-flight or completed run with full live updates.
 *
 * Hydrates from server-fetched initial data on mount: seeds the active-run
 * store + the shared event buffer with persisted activity rows (each tagged
 * with its `_seq` for dedupe), then SSE pumps new events into the same
 * store. Everything else (DAG, activity feed, approval surface) reads from
 * the same module-level stores the home page uses, so the layout is
 * unchanged from the previous in-page running view.
 */

import { useEffect, useMemo, useRef } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ActivityFeed } from "@/lib/ui/components/activity-feed";
import { DAGView } from "@/lib/ui/components/dag-view";
import { LiveApprovalSurface } from "@/lib/ui/components/live-approval-surface";
import { RunHeader } from "@/lib/ui/components/run-header";
import { StateSidebar } from "@/lib/ui/components/state-sidebar";
import {
  applyEventToActiveRun,
  useActiveRun,
} from "@/lib/ui/hooks/use-active-run";
import { useMockDriver } from "@/lib/ui/hooks/use-mock-driver";
import {
  seedSharedEvents,
  useSharedEvents,
} from "@/lib/ui/hooks/use-shared-events";
import { loadMockRun } from "@/lib/ui/hooks/use-mock-active-run";
import type { WireEvent } from "@/lib/realtime/events";
import type {
  ActivityEvent,
  WorkflowDAG,
  WorkflowState,
} from "@/lib/shared/types";

const PANEL_IDS: string[] = ["dag", "sidebar"];

interface InitialRunSnapshot {
  id: string;
  prompt: string;
  title: string | null;
  state: WorkflowState;
  startedAt: string; // ISO; serialization-friendly
  plan: WorkflowDAG | null;
  events: ActivityEvent[];
}

interface LiveRunSurfaceProps {
  initial: InitialRunSnapshot;
}

function eventsToSeedEntries(events: ActivityEvent[]) {
  return events.map((e) => ({
    seq: e.id,
    wire: {
      type: e.type,
      payload: {
        workflowRunId: e.workflowRunId,
        nodeId: e.nodeId ?? undefined,
        ...(e.payload as Record<string, unknown>),
      },
    } as WireEvent,
  }));
}

export function LiveRunSurface({ initial }: LiveRunSurfaceProps) {
  const { run, start } = useActiveRun(initial.id);

  // Hydrate the active-run store + shared event buffer once from server data.
  // The ref guards against a re-seed on hot-reload / strict-mode double-invoke
  // for the SAME run id; switching between different runs naturally re-seeds
  // because the effect depends on `initial.id`.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (seededFor.current === initial.id) return;
    seededFor.current = initial.id;
    // Mock-mode IDs may have a localStorage snapshot from prompt-input that
    // carries the real prompt + start time. Server can't see localStorage,
    // so it sent a placeholder; overlay it here.
    let prompt = initial.prompt;
    let startedAt = new Date(initial.startedAt);
    if (
      initial.id.startsWith("mock-run-") ||
      initial.id.startsWith("mock-past-run-")
    ) {
      const fromStorage = loadMockRun(initial.id);
      if (fromStorage) {
        prompt = fromStorage.prompt;
        startedAt = new Date(fromStorage.startedAt);
      }
    }
    start({
      id: initial.id,
      prompt,
      state: initial.state,
      startedAt,
      plan: initial.plan,
    });
    seedSharedEvents(eventsToSeedEntries(initial.events));
  }, [initial.id, initial.prompt, initial.state, initial.startedAt, initial.plan, initial.events, start]);

  // Filter the shared bus down to events tied to this run (or untagged).
  const allEvents = useSharedEvents();
  const events = useMemo<WireEvent[]>(() => {
    return allEvents.filter((e) => {
      const wfId = (e.payload as { workflowRunId?: string }).workflowRunId;
      return !wfId || wfId === initial.id;
    });
  }, [allEvents, initial.id]);

  useEffect(() => {
    applyEventToActiveRun(events, initial.id);
  }, [events, initial.id]);

  // Replay synthetic events for mock-prefixed runs (no-op in real mode).
  // Pass the plan so the driver targets real task ids — for a materialized
  // plan (researcher-mock-lead-001, …) emitting hardcoded `researcher-1`
  // would leave every stage stuck on "Pending" forever.
  const mockRunId = initial.id.startsWith("mock-run-") ? initial.id : null;
  useMockDriver(mockRunId, mockRunId ? initial.plan : null);

  // Persist column widths in localStorage. Same shim as the home page.
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

  // The active-run store may be stale for one tick on first render; fall back
  // to the seeded `initial` so the header/title don't briefly say "(loaded
  // from URL)" or similar.
  const headerPrompt = run?.prompt ?? initial.prompt;
  const headerState = run?.state ?? initial.state;
  const headerStartedAt = run?.startedAt ?? new Date(initial.startedAt);
  const headerPlan = run?.plan ?? initial.plan;

  const dagCol = (
    <DAGView plan={headerPlan} events={events} runPrompt={headerPrompt} />
  );
  const sideCol = (
    <aside className="grid gap-4">
      <StateSidebar events={events} runId={initial.id} />
      <ActivityFeed events={events} />
    </aside>
  );

  return (
    <div className="grid gap-4">
      <RunHeader
        runId={initial.id}
        prompt={initial.title ?? headerPrompt}
        state={headerState}
        startedAt={headerStartedAt}
      />

      <div className="grid grid-cols-1 gap-4 lg:hidden">
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
          id="dag"
          defaultSize="67%"
          minSize="360px"
          className="pr-3"
        >
          {dagCol}
        </ResizablePanel>

        <ResizableHandle withHandle className="bg-transparent hover:bg-border" />

        <ResizablePanel
          id="sidebar"
          defaultSize="33%"
          minSize="240px"
          className="pl-3"
        >
          {sideCol}
        </ResizablePanel>
      </ResizablePanelGroup>

      <LiveApprovalSurface runId={initial.id} />
    </div>
  );
}
