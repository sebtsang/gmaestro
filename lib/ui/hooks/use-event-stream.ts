"use client";

import { useEffect, useRef, useState } from "react";
import type { GMaestroEventName, WireEvent } from "@/lib/realtime/events";

const RECONNECT_DELAY_MS = 5_000;
const MAX_BUFFERED_EVENTS = 500;

export type StreamStatus = "open" | "reconnecting" | "closed";

export interface UseEventStreamResult {
  events: WireEvent[];
  latestEvent: WireEvent | null;
  status: StreamStatus;
}

/**
 * Subscribe to /api/stream as an EventSource. Auto-reconnects after a 5s
 * backoff on error. Returns an accumulating buffer of typed wire events plus
 * the most recent one (handy for derived state).
 */
export function useEventStream(workflowRunId?: string): UseEventStreamResult {
  const [events, setEvents] = useState<WireEvent[]>([]);
  const [latestEvent, setLatestEvent] = useState<WireEvent | null>(null);
  const [status, setStatus] = useState<StreamStatus>("closed");
  const sourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      const qs = workflowRunId
        ? `?workflowRunId=${encodeURIComponent(workflowRunId)}`
        : "";
      const es = new EventSource(`/api/stream${qs}`);
      sourceRef.current = es;

      es.onopen = () => {
        if (cancelled) return;
        setStatus("open");
      };

      es.onmessage = (ev) => {
        if (cancelled) return;
        try {
          const wire = JSON.parse(ev.data) as WireEvent;
          setEvents((prev) => {
            const next = [...prev, wire];
            if (next.length > MAX_BUFFERED_EVENTS) {
              next.splice(0, next.length - MAX_BUFFERED_EVENTS);
            }
            return next;
          });
          setLatestEvent(wire);
        } catch {
          // Malformed payload — drop silently rather than killing the stream.
        }
      };

      es.onerror = () => {
        if (cancelled) return;
        setStatus("reconnecting");
        es.close();
        sourceRef.current = null;
        reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      setStatus("closed");
    };
  }, [workflowRunId]);

  return { events, latestEvent, status };
}

/** Type-narrowed selector for a single event kind. */
export function pickEvents<K extends GMaestroEventName>(
  events: WireEvent[],
  type: K,
): Array<Extract<WireEvent, { type: K }>> {
  return events.filter(
    (e): e is Extract<WireEvent, { type: K }> => e.type === type,
  );
}
