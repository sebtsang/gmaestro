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
   * Bus-only event (NOT persisted to activity_events) emitted the moment a run
   * is created and marked running. Lets the runs drawer add the new row to
   * its list before the first persona event arrives.
   */
  workflow_started: {
    workflowRunId: string;
    prompt: string;
    startedAt: string; // ISO — wire shape so it survives JSON
  };
  /**
   * Bus-only event emitted once the title-generation job persists a title.
   * Lets the drawer + run header swap "(generating title…)" for the real one.
   */
  run_titled: {
    workflowRunId: string;
    title: string;
  };
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
    department?: "sales" | "cs" | "revops" | "insight" | "content";
    input?: unknown;
  };
  tool_called: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    toolName: string;
  };
  /**
   * Bus-only — NOT persisted (would require an enum migration). Emitted when
   * a specialist's LLM intends to call a Composio tool, BEFORE execution.
   * The dashboard renders these as the bottom-of-chain "I want to call X"
   * step that bubbles up to the manager review and (for write actions) the
   * founder approval gate.
   */
  tool_call_proposed: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    department?: "sales" | "cs" | "revops" | "insight" | "content";
    manager?: string; // e.g. "sales-mgr"
    toolName: string;
    input: unknown; // sanitized arguments the model wants to send
    blastRadius: "low" | "medium" | "high"; // read | draft | send/write
  };
  /** Bus-only. Manager review step in the chain of command. */
  tool_call_reviewed: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    manager: string;
    decision: "auto_approved" | "escalated_to_founder" | "blocked";
    reason: string;
  };
  /** Bus-only. Final allow/deny decision back at the specialist. */
  tool_call_executed: {
    workflowRunId: string;
    nodeId: string;
    personaId: string;
    toolName: string;
    outcome: "executed" | "dry_run" | "denied";
    note?: string;
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
    status: "approved" | "edited" | "rejected" | "changes_requested";
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
