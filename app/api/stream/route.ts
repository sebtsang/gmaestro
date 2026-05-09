/**
 * SSE endpoint that bridges the in-process eventBus to the browser dashboard.
 *
 * - runtime: nodejs (Edge can't subscribe to in-process EventEmitters)
 * - dynamic: force-dynamic (Next must not cache the stream)
 * - 15s heartbeat keeps Chrome's ~60s EventSource timeout from killing us
 * - Optional ?workflowRunId=... filters to one run
 *
 * Session 2's emitEvent() calls bus.emit("activity", ActivityEvent) — a single
 * envelope containing the typed sub-event. We unwrap that into the
 * { type, payload } wire shape the dashboard expects so consumers can work
 * with one consistent format regardless of producer.
 */

import type { WildcardHandler } from "mitt";
import { planCache, rawBus } from "@/lib/realtime/bus";
import type { WireEvent } from "@/lib/realtime/events";
import type { ActivityEvent } from "@/lib/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 15_000;

function looksLikeActivityEvent(v: unknown): v is ActivityEvent {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    "workflowRunId" in v &&
    "payload" in v
  );
}

/**
 * Wire frame includes optional `_seq` (the activity_events row id) and `_ts`
 * (ISO timestamp) for events that originated from the persisted activity log.
 * The replay endpoint emits the same shape; the client uses `_seq` to drop
 * duplicates that overlap between replay-on-mount and live-SSE.
 */
type WireFrame = WireEvent & { _seq?: string; _ts?: string };

function toWire(type: string, raw: unknown): WireFrame | null {
  // Session 2 envelope: bus.emit("activity", ActivityEvent)
  if (type === "activity" && looksLikeActivityEvent(raw)) {
    const evt = raw;
    return {
      type: evt.type,
      payload: {
        workflowRunId: evt.workflowRunId,
        nodeId: evt.nodeId ?? undefined,
        ...(evt.payload as Record<string, unknown>),
      },
      _seq: evt.id,
      _ts: evt.timestamp.toISOString(),
    } as WireFrame;
  }
  // Session 3 direct emit: { type: <GMaestroEventName>, payload: ... }
  if (raw && typeof raw === "object") {
    return { type, payload: raw } as WireFrame;
  }
  return null;
}

export function GET(req: Request) {
  const url = new URL(req.url);
  const filterRunId = url.searchParams.get("workflowRunId");

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // Controller already closed — ignore.
        }
      };

      // Initial comment so the browser opens the stream eagerly.
      send(`: connected\n\n`);

      // Replay any cached workflow_planned event for this run — covers the
      // ~50ms race where the orchestrator emitted the plan before the
      // dashboard had time to open its SSE connection.
      if (filterRunId) {
        const cached = planCache.get(filterRunId);
        if (cached) {
          send(
            `data: ${JSON.stringify({
              type: "workflow_planned",
              payload: cached,
            })}\n\n`,
          );
        }
      }

      const handler: WildcardHandler<Record<string, unknown>> = (
        type,
        payload,
      ) => {
        const frame = toWire(type as string, payload);
        if (!frame) return;
        if (
          filterRunId &&
          (frame.payload as { workflowRunId?: string }).workflowRunId !==
            filterRunId
        ) {
          return;
        }
        send(`data: ${JSON.stringify(frame)}\n\n`);
      };

      rawBus.on("*", handler);

      const heartbeat = setInterval(() => {
        send(`: heartbeat\n\n`);
      }, HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        rawBus.off("*", handler);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      // Client disconnect (Chrome closes tab, fetch aborted, etc.).
      req.signal.addEventListener("abort", cleanup);
    },

    cancel() {
      // ReadableStream.cancel — already handled by the abort listener above,
      // but keep this defined so Next.js doesn't warn.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
