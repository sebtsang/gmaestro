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
