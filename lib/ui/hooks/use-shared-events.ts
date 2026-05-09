"use client";

/**
 * Module-level SSE singleton for cross-page event sharing.
 *
 * The dashboard page already opens its own (run-scoped) EventSource via
 * `useEventStream(runId)`. But other pages — notably /approvals — also need
 * to know about pending approvals, and in mock mode there's no DB to read
 * from. This module opens a single, unfiltered SSE connection (one per
 * browser tab) and broadcasts every event into a module-level array that
 * any subscriber can read via `useSharedEvents()`.
 *
 * Why not reuse `useEventStream`?
 *   - It's per-component: each consumer opens a new EventSource. We want
 *     ONE connection regardless of how many components subscribe.
 *   - It can be filtered to a runId; the approvals page doesn't have one.
 *
 * The store survives client-side navigation between /, /approvals, etc.
 * It's torn down on full page reload (which is fine).
 */

import { useSyncExternalStore } from "react";
import type { WireEvent } from "@/lib/realtime/events";

const MAX_BUFFERED_EVENTS = 500;

type Listener = () => void;

interface SharedEventStore {
  events: WireEvent[];
  /**
   * Per-event seq, parallel to `events` so `eventSeqs[i]` is the seq for
   * `events[i]` (or undefined for bus-only events). Lets us drop seqs from
   * `seenSeqs` when their event gets trimmed, preventing an unbounded leak.
   */
  eventSeqs: Array<string | undefined>;
  /**
   * Set of `_seq` values (activity_events.id) already pushed onto `events`.
   * Used to drop duplicates that overlap between replay-on-mount and live
   * SSE. Bus-only events without a `_seq` are never tracked here.
   */
  seenSeqs: Set<string>;
  source: EventSource | null;
  listeners: Set<Listener>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroSharedEventStore: SharedEventStore | undefined;
}

function makeStore(): SharedEventStore {
  return {
    events: [],
    eventSeqs: [],
    seenSeqs: new Set(),
    source: null,
    listeners: new Set(),
    reconnectTimer: null,
  };
}

function getStore(): SharedEventStore {
  if (typeof window === "undefined") {
    // Server: return an empty, non-functional store. Consumers must guard.
    return makeStore();
  }
  if (!globalThis.__gmaestroSharedEventStore) {
    globalThis.__gmaestroSharedEventStore = makeStore();
  }
  return globalThis.__gmaestroSharedEventStore;
}

function notify(store: SharedEventStore) {
  for (const l of store.listeners) l();
}

function pushEvent(
  store: SharedEventStore,
  wire: WireEvent,
  seq?: string,
) {
  if (seq) {
    if (store.seenSeqs.has(seq)) return;
    store.seenSeqs.add(seq);
  }
  // Replace array reference so useSyncExternalStore detects the change.
  const next = store.events.concat(wire);
  store.eventSeqs.push(seq);
  trimToCap(store, next);
  notify(store);
}

/**
 * Cap `events` (and the parallel `eventSeqs`) at MAX_BUFFERED_EVENTS, dropping
 * the trimmed events' seqs from `seenSeqs` so it doesn't grow forever in a
 * long-lived session. Mutates `store.events` to the supplied `next` array.
 */
function trimToCap(store: SharedEventStore, next: WireEvent[]) {
  if (next.length <= MAX_BUFFERED_EVENTS) {
    store.events = next;
    return;
  }
  const drop = next.length - MAX_BUFFERED_EVENTS;
  next.splice(0, drop);
  const droppedSeqs = store.eventSeqs.splice(0, drop);
  for (const s of droppedSeqs) if (s) store.seenSeqs.delete(s);
  store.events = next;
}

function ensureConnected(store: SharedEventStore) {
  if (typeof window === "undefined") return;
  if (store.source) return;

  const es = new EventSource("/api/stream");
  store.source = es;

  es.onmessage = (ev) => {
    try {
      const parsed = JSON.parse(ev.data) as WireEvent & { _seq?: string };
      const seq = parsed._seq;
      const wire = { type: parsed.type, payload: parsed.payload } as WireEvent;
      pushEvent(store, wire, seq);
    } catch {
      // Malformed payload — ignore.
    }
  };

  es.onerror = () => {
    es.close();
    store.source = null;
    if (store.reconnectTimer) clearTimeout(store.reconnectTimer);
    store.reconnectTimer = setTimeout(() => {
      store.reconnectTimer = null;
      // Only reconnect if we still have subscribers.
      if (store.listeners.size > 0) ensureConnected(store);
    }, 5_000);
  };
}

function maybeDisconnect(store: SharedEventStore) {
  if (store.listeners.size > 0) return;
  if (store.source) {
    store.source.close();
    store.source = null;
  }
  if (store.reconnectTimer) {
    clearTimeout(store.reconnectTimer);
    store.reconnectTimer = null;
  }
}

function subscribe(listener: Listener): () => void {
  const store = getStore();
  store.listeners.add(listener);
  ensureConnected(store);
  return () => {
    store.listeners.delete(listener);
    maybeDisconnect(store);
  };
}

const EMPTY_EVENTS: WireEvent[] = [];

function getSnapshot(): WireEvent[] {
  return getStore().events;
}

function getServerSnapshot(): WireEvent[] {
  return EMPTY_EVENTS;
}

/**
 * Subscribe to the shared event stream. Returns the same array reference
 * across renders unless new events have arrived.
 */
export function useSharedEvents(): WireEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Manually inject an event into the shared store. Useful when a producer
 * wants the store to update without round-tripping through SSE — e.g., the
 * mock-mode revision loop in `<LiveApprovalSurface>` synthesizes a fresh
 * `approval_requested` for a revised draft.
 */
export function injectSharedEvent(wire: WireEvent, seq?: string) {
  if (typeof window === "undefined") return;
  pushEvent(getStore(), wire, seq);
}

/**
 * Append seeded events into the shared store. Used by the run-detail page on
 * mount to inject replayed activity events from the DB before live SSE takes
 * over. `_seq` ids are remembered so any racing live event for the same row
 * gets dropped; re-mounts on the same run are no-ops because every seq is
 * already in `seenSeqs`. Appends rather than replaces so cross-run context
 * (synthetic `workflow_started` from the prompt input, events for runs the
 * founder is also watching) survives.
 */
export function seedSharedEvents(
  entries: ReadonlyArray<{ wire: WireEvent; seq?: string }>,
) {
  if (typeof window === "undefined") return;
  const store = getStore();
  const next = store.events.slice();
  let mutated = false;
  for (const { wire, seq } of entries) {
    if (seq) {
      if (store.seenSeqs.has(seq)) continue;
      store.seenSeqs.add(seq);
    }
    next.push(wire);
    store.eventSeqs.push(seq);
    mutated = true;
  }
  if (!mutated) return;
  trimToCap(store, next);
  notify(store);
}
