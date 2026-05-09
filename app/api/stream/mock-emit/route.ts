/**
 * Helper for NEXT_PUBLIC_USE_MOCKS=1 dev mode.
 *
 * Receives a wire event from the dashboard's mock driver and re-emits it onto
 * the real eventBus, so the dashboard exercises the real SSE path (heartbeat,
 * reconnect logic) instead of an in-memory shortcut.
 *
 * Production builds should never hit this — the orchestrator emits directly
 * via Session 1's emitEvent() helper. We refuse if NODE_ENV=production.
 */

import { rawBus } from "@/lib/realtime/bus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response("disabled in production", { status: 403 });
  }

  let body: { type?: string; payload?: unknown };
  try {
    body = (await req.json()) as { type?: string; payload?: unknown };
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const { type, payload } = body;
  if (typeof type !== "string" || !payload || typeof payload !== "object") {
    return new Response("missing type or payload", { status: 400 });
  }

  rawBus.emit(type, payload as Record<string, unknown>);
  return new Response(null, { status: 204 });
}
