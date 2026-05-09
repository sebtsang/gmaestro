/**
 * Activity event persistence + dashboard fan-out.
 *
 * Every persona milestone (started / tool-called / completed / etc.) lands in
 * the `activity_events` table AND is emitted on the in-process event bus so
 * Session 3's SSE route can stream it to the dashboard live.
 *
 * Bus: `globalThis.__gmaestroEventBus`. Until Session 3 ships
 * `lib/realtime/bus.ts`, we seed the global with a mock from shared/mocks.
 * When Session 3 lands, it overwrites the same global slot — no edits here.
 */

import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import type { Emitter } from "mitt";
import { db, schema } from "@/lib/state/db";
import { ActivityEventSchema } from "@/lib/shared/schemas";
import type { ActivityEvent, ActivityEventType } from "@/lib/shared/types";
import { makeMockEventBus } from "@/lib/shared/mocks";

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroEventBus: Emitter<Record<string, unknown>> | undefined;
}

function getBus(): Emitter<Record<string, unknown>> {
  return (globalThis.__gmaestroEventBus ??= makeMockEventBus());
}

/**
 * Persist an activity event and emit it on the bus. Returns the persisted
 * event (with id + timestamp) so callers can include it in their reply.
 */
export async function emitEvent(
  workflowRunId: string,
  nodeId: string | null,
  type: ActivityEventType,
  payload: Record<string, unknown>,
  link?: string,
): Promise<ActivityEvent> {
  const event: ActivityEvent = ActivityEventSchema.parse({
    id: randomUUID(),
    workflowRunId,
    nodeId,
    type,
    payload,
    link: link ?? null,
    timestamp: new Date(),
  });

  db.insert(schema.activityEvents)
    .values({
      id: event.id,
      workflowRunId: event.workflowRunId,
      nodeId: event.nodeId ?? null,
      type: event.type,
      payload: event.payload,
      link: event.link ?? null,
      timestamp: event.timestamp,
    })
    .run();

  getBus().emit("activity", event);
  return event;
}

/** Newest-first activity events for one workflow run. */
export function listEvents(workflowRunId: string): ActivityEvent[] {
  const rows = db
    .select()
    .from(schema.activityEvents)
    .where(eq(schema.activityEvents.workflowRunId, workflowRunId))
    .orderBy(desc(schema.activityEvents.timestamp))
    .all();

  return rows.map((r) => ActivityEventSchema.parse(r));
}
