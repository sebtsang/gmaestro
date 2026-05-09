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
  source: EventSource | null;
  listeners: Set<Listener>;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroSharedEventStore: SharedEventStore | undefined;
}

function getStore(): SharedEventStore {
  if (typeof window === "undefined") {
    // Server: return an empty, non-functional store. Consumers must guard.
    return {
      events: [],
      source: null,
      listeners: new Set(),
      reconnectTimer: null,
    };
  }
  if (!globalThis.__gmaestroSharedEventStore) {
    globalThis.__gmaestroSharedEventStore = {
      events: [],
      source: null,
      listeners: new Set(),
      reconnectTimer: null,
    };
  }
  return globalThis.__gmaestroSharedEventStore;
}

function notify(store: SharedEventStore) {
  for (const l of store.listeners) l();
}

function pushEvent(store: SharedEventStore, wire: WireEvent) {
  // Replace array reference so useSyncExternalStore detects the change.
  const next = store.events.concat(wire);
  if (next.length > MAX_BUFFERED_EVENTS) {
    next.splice(0, next.length - MAX_BUFFERED_EVENTS);
  }
  store.events = next;
  notify(store);
}

function ensureConnected(store: SharedEventStore) {
  if (typeof window === "undefined") return;
  if (store.source) return;

  const es = new EventSource("/api/stream");
  store.source = es;

  es.onmessage = (ev) => {
    try {
      const wire = JSON.parse(ev.data) as WireEvent;
      pushEvent(store, wire);
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
export function injectSharedEvent(wire: WireEvent) {
  if (typeof window === "undefined") return;
  pushEvent(getStore(), wire);
}
