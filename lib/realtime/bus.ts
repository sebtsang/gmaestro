/**
 * In-process realtime event bus.
 *
 * Stashed on globalThis because Next.js App Router bundles API routes and
 * pages separately — a plain module-level singleton would duplicate, leaving
 * one bus the orchestrator emits to and another the SSE route subscribes from.
 *
 * Type note: Session 2's lib/state/activity.ts declares the same global slot
 * with the looser `Emitter<Record<string, unknown>>` type because it emits a
 * single `"activity"` envelope around `ActivityEvent`. To keep both
 * `declare global` blocks compatible we hold the loose type at the global
 * level and apply a typed view at the export. The SSE route reads via the
 * raw bus so it can unwrap Session 2's envelope into typed wire events.
 *
 * Owned by: Session 3 (lib/realtime/*).
 */

import "server-only";
import mitt, { type Emitter } from "mitt";
import type { GMaestroEvents } from "./events";

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroEventBus: Emitter<Record<string, unknown>> | undefined;
  // eslint-disable-next-line no-var
  var __gmaestroPlanCache:
    | Map<string, GMaestroEvents["workflow_planned"]>
    | undefined;
}

const sharedBus: Emitter<Record<string, unknown>> =
  globalThis.__gmaestroEventBus ??
  (globalThis.__gmaestroEventBus = mitt<Record<string, unknown>>());

/**
 * Typed view of the shared bus for direct emits from Session 3 code.
 */
export const eventBus = sharedBus as unknown as Emitter<GMaestroEvents>;

/** Raw bus — used by the SSE route to listen across both shapes. */
export const rawBus = sharedBus;

/**
 * In-memory replay cache for workflow_planned events.
 *
 * The orchestrator emits workflow_planned ~10–50ms after POST /api/runs returns,
 * BEFORE the dashboard has time to open its SSE connection. Without replay the
 * DAG would sit on "Waiting for the Conductor" forever.
 *
 * The SSE route checks this cache on connect and re-emits any matching planned
 * event to the new subscriber before the live stream takes over. Hackathon
 * scope: never expires; a real product would TTL these.
 */
export const planCache: Map<string, GMaestroEvents["workflow_planned"]> =
  globalThis.__gmaestroPlanCache ??
  (globalThis.__gmaestroPlanCache = new Map());

// Cache every planned event as it flies past. One subscriber per process.
sharedBus.on("workflow_planned", (payload) => {
  const p = payload as GMaestroEvents["workflow_planned"];
  if (p?.workflowRunId) planCache.set(p.workflowRunId, p);
});
