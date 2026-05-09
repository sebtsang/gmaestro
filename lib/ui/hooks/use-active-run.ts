"use client";

/**
 * Module-level store for the currently active workflow run.
 *
 * Why a module-level store instead of `useState` on the dashboard page?
 * Next.js App Router unmounts page components on client-side navigation
 * between sibling routes (Dashboard → Approvals → Dashboard). React state
 * dies with the component, so the run id, prompt, and derived UI state
 * vanish even though the run is still running on the server.
 *
 * The store lives in module scope (and is hung off `globalThis` in the
 * browser to survive Next.js's separate bundling of pages and API routes,
 * matching the pattern in `use-shared-events.ts`). It's exposed via
 * `useSyncExternalStore`, so consumers re-render on mutation.
 *
 * The store is intentionally scoped to ONE active run. Submitting a new
 * prompt clears the previous run. Crashes/full reloads tear it down (which
 * is fine — `CLAUDE.md` rule #12: crash = restart from scratch).
 */

import { useCallback, useSyncExternalStore } from "react";
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
  run: ActiveRun | null;
  listeners: Set<() => void>;
}

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroActiveRunStore: ActiveRunStore | undefined;
}

function getStore(): ActiveRunStore {
  if (typeof window === "undefined") {
    return { run: null, listeners: new Set() };
  }
  if (!globalThis.__gmaestroActiveRunStore) {
    globalThis.__gmaestroActiveRunStore = {
      run: null,
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

function getSnapshot(): ActiveRun | null {
  return getStore().run;
}

function getServerSnapshot(): ActiveRun | null {
  return null;
}

function setRunInternal(
  next: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
) {
  const store = getStore();
  const resolved =
    typeof next === "function"
      ? (next as (prev: ActiveRun | null) => ActiveRun | null)(store.run)
      : next;
  if (resolved === store.run) return;
  store.run = resolved;
  notify(store);
}

export interface ActiveRunHandle {
  run: ActiveRun | null;
  /** Replace the active run. Clears previous run, even if same id. */
  start: (run: ActiveRun) => void;
  /** Functional / direct setter — used to merge planned/done updates. */
  update: (
    next: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
  ) => void;
  /** Drop the active run (back to empty home view). */
  clear: () => void;
}

export function useActiveRun(): ActiveRunHandle {
  const run = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const start = useCallback((next: ActiveRun) => {
    setRunInternal(next);
  }, []);

  const update = useCallback(
    (
      next: ActiveRun | null | ((prev: ActiveRun | null) => ActiveRun | null),
    ) => {
      setRunInternal(next);
    },
    [],
  );

  const clear = useCallback(() => {
    setRunInternal(null);
  }, []);

  return { run, start, update, clear };
}

/**
 * Apply event-driven updates to the active run. Call from a single owner
 * (the dashboard page) to keep state mutations centralized — but because
 * the store itself is module-level, the resulting state is visible to any
 * hook caller, including those that don't drive updates.
 */
export function applyEventToActiveRun(events: WireEvent[]): void {
  const last = events[events.length - 1];
  if (!last) return;
  setRunInternal((prev) => {
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
  });
}
