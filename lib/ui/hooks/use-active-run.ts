"use client";

/**
 * Module-level store for in-flight workflow runs, keyed by run id.
 *
 * Why a module-level store? Next.js App Router unmounts page components on
 * client-side navigation between sibling routes (Dashboard → Approvals →
 * Dashboard). React state dies with the component, so a run's prompt and
 * derived UI state would vanish even though the run is still running on the
 * server. The store lives in module scope (and is hung off `globalThis` to
 * survive Next.js's separate bundling of pages and API routes — same pattern
 * as `use-shared-events.ts`).
 *
 * Multiple runs at once. Each `<LiveRunSurface>` instance reads/writes its
 * own slot via `useActiveRun(runId)`; `applyEventToActiveRun(events)` routes
 * each event to the slot named by `event.payload.workflowRunId`. Slots are
 * dropped ~30s after `workflow_done` so a long browser session doesn't grow
 * the map without bound.
 *
 * Crashes/full reloads tear it down (which is fine — `CLAUDE.md` rule #12:
 * crash = restart from scratch).
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { WireEvent } from "@/lib/realtime/events";
import type { WorkflowDAG, WorkflowState } from "@/lib/shared/types";

export interface ActiveRun {
  id: string;
  prompt: string;
  state: WorkflowState;
  startedAt: Date;
  plan: WorkflowDAG | null;
}

interface ActiveRunStore {
  runs: Map<string, ActiveRun>;
  /** runId → setTimeout handle for the post-done eviction. */
  evictTimers: Map<string, ReturnType<typeof setTimeout>>;
  listeners: Set<() => void>;
}

const EVICT_AFTER_DONE_MS = 30_000;

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroActiveRunStore: ActiveRunStore | undefined;
}

function getStore(): ActiveRunStore {
  if (typeof window === "undefined") {
    return { runs: new Map(), evictTimers: new Map(), listeners: new Set() };
  }
  if (!globalThis.__gmaestroActiveRunStore) {
    globalThis.__gmaestroActiveRunStore = {
      runs: new Map(),
      evictTimers: new Map(),
      listeners: new Set(),
    };
  }
  return globalThis.__gmaestroActiveRunStore;
}

function notify(store: ActiveRunStore) {
  for (const l of store.listeners) l();
}

function subscribe(listener: () => void): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function makeSnapshotGetter(runId: string): () => ActiveRun | null {
  return () => getStore().runs.get(runId) ?? null;
}

function getServerSnapshot(): ActiveRun | null {
  return null;
}

function setRunInternal(
  runId: string,
  next: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
) {
  const store = getStore();
  const prev = store.runs.get(runId) ?? null;
  const resolved =
    typeof next === "function"
      ? (next as (prev: ActiveRun | null) => ActiveRun | null)(prev)
      : next;
  if (resolved === prev) return;
  if (resolved === null) {
    store.runs.delete(runId);
  } else {
    store.runs.set(runId, resolved);
  }
  notify(store);
}

function scheduleEvict(runId: string) {
  if (typeof window === "undefined") return;
  const store = getStore();
  const existing = store.evictTimers.get(runId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    store.evictTimers.delete(runId);
    if (store.runs.has(runId)) {
      store.runs.delete(runId);
      notify(store);
    }
  }, EVICT_AFTER_DONE_MS);
  store.evictTimers.set(runId, handle);
}

export interface ActiveRunHandle {
  run: ActiveRun | null;
  /** Replace this run's slot. Clears any pending eviction timer. */
  start: (run: ActiveRun) => void;
  /** Functional / direct setter — used to merge planned/done updates. */
  update: (
    next: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
  ) => void;
  /** Drop this run's slot immediately. */
  clear: () => void;
}

export function useActiveRun(runId: string | null): ActiveRunHandle {
  // Memoize the per-runId getter so useSyncExternalStore doesn't see a fresh
  // closure on every parent render — that would cost an extra store read each
  // time. `useMemo` (not `useCallback`) keeps `null` for the absent-runId path.
  const getSnapshot = useMemo(
    () => (runId ? makeSnapshotGetter(runId) : getServerSnapshot),
    [runId],
  );
  const run = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const start = useCallback(
    (next: ActiveRun) => {
      if (!runId) return;
      const store = getStore();
      const timer = store.evictTimers.get(runId);
      if (timer) {
        clearTimeout(timer);
        store.evictTimers.delete(runId);
      }
      setRunInternal(runId, next);
    },
    [runId],
  );

  const update = useCallback(
    (
      next: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
    ) => {
      if (!runId) return;
      setRunInternal(runId, next);
    },
    [runId],
  );

  const clear = useCallback(() => {
    if (!runId) return;
    setRunInternal(runId, null);
  }, [runId]);

  return { run, start, update, clear };
}

function reduceEventIntoRun(prev: ActiveRun | null, last: WireEvent) {
  if (!prev) return prev;
  if (last.type === "workflow_planned" && !prev.plan) {
    return { ...prev, plan: last.payload.plan };
  }
  if (last.type === "workflow_done") {
    const nextState = last.payload.state === "failed" ? "failed" : "done";
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
}

/**
 * Apply event-driven updates to active runs. Each event is routed to its own
 * run slot via `payload.workflowRunId`. `workflow_done` triggers a delayed
 * eviction so the Map doesn't grow unbounded across a long browser session.
 *
 * When the caller already filtered events to a single run, pass that runId
 * via the optional second arg — the function then walks the buffer ONCE
 * backward looking for the most recent lifecycle-relevant event for that run,
 * skipping the per-event Map allocation. This is the hot path: a 500-event
 * buffer otherwise costs 500 ops per SSE tick per mounted `<LiveRunSurface>`.
 */
export function applyEventToActiveRun(
  events: WireEvent[],
  scopedRunId?: string,
): void {
  if (events.length === 0) return;

  if (scopedRunId) {
    // Single-run hot path: scan backward, take the first relevant event.
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if ((e.payload as { workflowRunId?: string }).workflowRunId !== scopedRunId)
        continue;
      setRunInternal(scopedRunId, (prev) => reduceEventIntoRun(prev, e));
      if (e.type === "workflow_done") scheduleEvict(scopedRunId);
      return;
    }
    return;
  }

  // Multi-run path: group by workflowRunId, apply last-per-run.
  const lastByRun = new Map<string, WireEvent>();
  for (const e of events) {
    const wfId = (e.payload as { workflowRunId?: string }).workflowRunId;
    if (!wfId) continue;
    lastByRun.set(wfId, e);
  }
  for (const [runId, last] of lastByRun) {
    setRunInternal(runId, (prev) => reduceEventIntoRun(prev, last));
    if (last.type === "workflow_done") scheduleEvict(runId);
  }
}
