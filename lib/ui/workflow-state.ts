/**
 * UI-side helpers for the `WorkflowState` enum. Lives in `lib/ui/` (Session 3
 * territory) so we can add display-related derivatives without touching the
 * Foundation-owned `lib/shared/types.ts`.
 */

import type { WorkflowState } from "@/lib/shared/types";

/**
 * Subset of `WorkflowState` representing runs still in flight. Used by surfaces
 * that filter the runs list by activity (`<LiveRunsStrip>`, `<ResumePill>`).
 * `done` and `failed` are terminal and excluded.
 */
export type ActiveWorkflowState = Extract<
  WorkflowState,
  "planning" | "running" | "awaiting_approval"
>;

export const ACTIVE_WORKFLOW_STATES: readonly ActiveWorkflowState[] = [
  "planning",
  "running",
  "awaiting_approval",
];

export function isActiveWorkflowState(
  s: WorkflowState,
): s is ActiveWorkflowState {
  return (ACTIVE_WORKFLOW_STATES as readonly WorkflowState[]).includes(s);
}

/** Format an ISO timestamp as a compact relative-time string. */
export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  const days = Math.floor(ms / 86_400_000);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
