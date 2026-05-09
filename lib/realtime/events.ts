/**
 * Typed event map for the in-process realtime bus.
 *
 * Names mirror ActivityEventType from lib/shared/types.ts so a single emit can
 * service both the SSE stream (for the dashboard) and the activity_events
 * table (for the orchestrator's audit log).
 *
 * Owned by: Session 3 (lib/realtime/*).
 */

import type { ActivityEventType, BlastRadius } from "@/lib/shared/types";

export type GMaestroEvents = {
  /**
   * Bus-only event (NOT persisted to activity_events) emitted right after the
   * Conductor produces a plan. Lets the dashboard render the DAG immediately
   * instead of waiting for individual specialist events. Stays out of the DB
   * to avoid a schema migration on the activity_events check constraint.
   */
  workflow_planned: {
    workflowRunId: string;
    plan: import("@/lib/shared/types").WorkflowDAG;
  };
  persona_started: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    layer?: "conductor" | "manager" | "specialist";
    department?: "sales" | "cs" | "revops" | "insight";
    input?: unknown;
  };
  tool_called: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    toolName: string;
  };
  artifact_created: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    artifactType: string;
    artifactId: string;
    link?: string;
  };
  approval_requested: {
    workflowRunId: string;
    approvalId: string;
    artifactType: string;
    blastRadius: BlastRadius;
    reason: string;
  };
  approval_resolved: {
    workflowRunId: string;
    approvalId: string;
    status: "approved" | "edited" | "rejected";
  };
  persona_completed: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    output?: unknown;
  };
  workflow_done: {
    workflowRunId: string;
    state: "done" | "failed";
  };
};

export type GMaestroEventName = keyof GMaestroEvents;

/** Convenience: shape sent over the SSE wire (`type` + `payload`). */
export type WireEvent = {
  [K in GMaestroEventName]: { type: K; payload: GMaestroEvents[K] };
}[GMaestroEventName];

/** Compile-time guard that GMaestroEvents covers every ActivityEventType.
 *  workflow_planned is bus-only — not in ActivityEventType — so nothing to verify there. */
type _CoversActivityEventType = Exclude<
  ActivityEventType,
  GMaestroEventName
> extends never
  ? true
  : ["MISSING_EVENTS", Exclude<ActivityEventType, GMaestroEventName>];
const _coverage: _CoversActivityEventType = true;
void _coverage;
