"use client";

/**
 * Shared data for "list of workflow runs, kept fresh by the live event stream."
 * Used by both `<RecentRunsList>` (vertical list on the home page) and
 * `<LiveRunsStrip>` (horizontal chip strip in the top nav).
 *
 * The cache lives in module scope (mounted on `globalThis` for the same reason
 * as `use-shared-events.ts` — Next.js bundles pages and API routes separately),
 * so every consumer reads the same array. Without this, two consumers on the
 * same page would each fetch `/api/runs/list` and drift as their independent
 * `setRuns` reducers patched at different times.
 */

import { useEffect, useSyncExternalStore } from "react";
import { MOCK_PAST_RUNS, type MockPastRun } from "@/lib/shared/mocks";
import { useSharedEvents } from "@/lib/ui/hooks/use-shared-events";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import type { WireEvent } from "@/lib/realtime/events";

export type RunRow = MockPastRun;

interface RunsStore {
  runs: RunRow[];
  loading: boolean;
  /**
   * Index into the events buffer. Tracks how many entries we've already folded
   * into `runs` so the patcher only walks the unprocessed tail (instead of the
   * full 500-event buffer per tick).
   */
  cursor: number;
  /** Promise of the in-flight fetch — coalesces concurrent consumers. */
  fetchInFlight: Promise<void> | null;
  /** Most recent fetch limit; used to decide whether to refetch on opt change. */
  fetchedLimit: number | null;
  listeners: Set<() => void>;
}

const RELEVANT_EVENT_TYPES = new Set<WireEvent["type"]>([
  "workflow_started",
  "run_titled",
  "workflow_done",
]);

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroRunsListStore: RunsStore | undefined;
}

function getStore(): RunsStore {
  if (typeof window === "undefined") {
    return {
      runs: MOCK_MODE ? MOCK_PAST_RUNS : [],
      loading: !MOCK_MODE,
      cursor: 0,
      fetchInFlight: null,
      fetchedLimit: null,
      listeners: new Set(),
    };
  }
  if (!globalThis.__gmaestroRunsListStore) {
    globalThis.__gmaestroRunsListStore = {
      runs: MOCK_MODE ? MOCK_PAST_RUNS : [],
      loading: !MOCK_MODE,
      cursor: 0,
      fetchInFlight: null,
      fetchedLimit: null,
      listeners: new Set(),
    };
  }
  return globalThis.__gmaestroRunsListStore;
}

function notify(store: RunsStore) {
  for (const l of store.listeners) l();
}

function subscribe(listener: () => void): () => void {
  const store = getStore();
  store.listeners.add(listener);
  return () => {
    store.listeners.delete(listener);
  };
}

function getRunsSnapshot(): RunRow[] {
  return getStore().runs;
}

function getLoadingSnapshot(): boolean {
  return getStore().loading;
}

function ensureFetched(limit: number) {
  if (MOCK_MODE) return;
  const store = getStore();
  if (store.fetchedLimit === limit && !store.fetchInFlight) return;
  if (store.fetchInFlight) return;
  store.fetchedLimit = limit;
  store.fetchInFlight = fetch(`/api/runs/list?limit=${limit}`)
    .then((r) => r.json())
    .then((data: { runs: RunRow[] }) => {
      store.runs = data.runs;
    })
    .catch(() => {
      // Silent — list stays empty.
    })
    .finally(() => {
      store.loading = false;
      store.fetchInFlight = null;
      notify(store);
    });
}

/**
 * Fold any new events from the shared bus into the runs cache. Walks only the
 * tail past `store.cursor` so a 500-event buffer doesn't cost 500 ops per tick.
 */
function applyEvents(events: readonly WireEvent[]) {
  const store = getStore();
  if (events.length <= store.cursor) {
    // Buffer was reset (or simply hasn't grown). Re-anchor to current length.
    store.cursor = events.length;
    return;
  }
  let next = store.runs;
  let mutated = false;
  for (let i = store.cursor; i < events.length; i++) {
    const e = events[i];
    if (!RELEVANT_EVENT_TYPES.has(e.type)) continue;
    if (e.type === "workflow_started") {
      const p = e.payload as {
        workflowRunId: string;
        prompt: string;
        startedAt: string;
      };
      if (next.some((r) => r.id === p.workflowRunId)) continue;
      next = [
        {
          id: p.workflowRunId,
          title: null,
          prompt: p.prompt,
          state: "running",
          startedAt: p.startedAt,
          completedAt: null,
        },
        ...next,
      ];
      mutated = true;
    } else if (e.type === "run_titled") {
      const p = e.payload as { workflowRunId: string; title: string };
      const before = next;
      next = next.map((r) =>
        r.id === p.workflowRunId ? { ...r, title: p.title } : r,
      );
      if (next !== before) mutated = true;
    } else if (e.type === "workflow_done") {
      const p = e.payload as {
        workflowRunId: string;
        state: "done" | "failed";
      };
      const completedAt = new Date().toISOString();
      const before = next;
      next = next.map((r) =>
        r.id === p.workflowRunId
          ? { ...r, state: p.state, completedAt }
          : r,
      );
      if (next !== before) mutated = true;
    }
  }
  store.cursor = events.length;
  if (mutated) {
    store.runs = next;
    notify(store);
  }
}

export interface UseRunsListOptions {
  /** Fetch limit on the API call. Defaults to 50 (the API's own default). */
  limit?: number;
}

export interface UseRunsListResult {
  runs: RunRow[];
  loading: boolean;
}

export function useRunsList({
  limit = 50,
}: UseRunsListOptions = {}): UseRunsListResult {
  const runs = useSyncExternalStore(
    subscribe,
    getRunsSnapshot,
    getRunsSnapshot,
  );
  const loading = useSyncExternalStore(
    subscribe,
    getLoadingSnapshot,
    getLoadingSnapshot,
  );
  const events = useSharedEvents();

  useEffect(() => {
    ensureFetched(limit);
  }, [limit]);

  useEffect(() => {
    applyEvents(events);
  }, [events]);

  // Mock-mode consumers want their `limit` honored against the static fixture.
  // Real-mode honors it via the API call, so just slice locally either way.
  const visible = runs.length > limit ? runs.slice(0, limit) : runs;
  return { runs: visible, loading };
}
