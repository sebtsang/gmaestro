"use client";

import { useEffect } from "react";
import type {
  GMaestroEventName,
  GMaestroEvents,
} from "@/lib/realtime/events";
import type { WorkflowDAG, WorkflowTask } from "@/lib/shared/types";

/**
 * When NEXT_PUBLIC_USE_MOCKS=1, the dashboard primes the SSE pipe by POSTing
 * a sequence of mock events to /api/stream/mock-emit. This lets us exercise
 * the full realtime path (eventBus → SSE → useEventStream) without Sessions
 * 1+2's persona runtime being live.
 *
 * The script reads task ids straight off the plan so the driver works for
 * BOTH materialized plans (`researcher-mock-lead-001`, …) AND template plans
 * (`researcher`, …) — `dag-view`'s `deriveNodeStatuses` keys on `nodeId` and
 * looks up `statuses.get(task.id)`, so emitting the wrong ids leaves every
 * stage stuck on "Pending" forever.
 */

const isMockMode =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_MOCKS === "1";

type MockEvent = {
  type: GMaestroEventName;
  payload: GMaestroEvents[GMaestroEventName];
  delayMs: number;
};

const TOOL_FOR_PERSONA: Record<string, string> = {
  researcher: "LINKEDIN_GET_PROFILE",
  qualifier: "COMPOSIO_SEARCH_TOOLS",
  strategist: "COMPOSIO_SEARCH_TOOLS",
  writer: "GMAIL_DRAFT",
  activation: "GMAIL_DRAFT",
  "crm-logger": "HUBSPOT_CREATE_CONTACT",
};

const ARTIFACT_FOR_PERSONA: Record<string, string> = {
  researcher: "TopicResearchBrief",
  strategist: "ContentOutline",
  writer: "BlogDraft",
  "geo-editor": "BlogDraft",
  formatter: "ChannelVariant",
};

function buildScript(
  workflowRunId: string,
  plan: WorkflowDAG | null,
): MockEvent[] {
  const script: MockEvent[] = [];
  let t = 200;

  // Group plan tasks by specialistId so we can iterate them in pipeline order
  // while still emitting per-task events.
  const planByPersona = new Map<string, WorkflowTask[]>();
  for (const task of plan?.tasks ?? []) {
    const arr = planByPersona.get(task.specialistId) ?? [];
    arr.push(task);
    planByPersona.set(task.specialistId, arr);
  }

  // Conductor
  script.push({
    type: "persona_started",
    payload: {
      workflowRunId,
      nodeId: "conductor",
      personaId: "conductor",
      layer: "conductor",
    },
    delayMs: t,
  });

  const departments = [
    {
      dept: "content" as const,
      specialists: ["researcher", "strategist", "writer", "geo-editor", "formatter"],
    },
    {
      dept: "distribution" as const,
      specialists: ["pipeline-reporter", "slack-digest"],
    },
    {
      dept: "insight" as const,
      specialists: ["feedback-tagger", "theme-synthesizer", "linear-filer"],
    },
  ];

  for (const { dept, specialists } of departments) {
    // Skip the manager + its specialists if the plan has none of them. (For
    // a materialized sales plan this skips cs+revops; for a template plan
    // with all four departments it keeps all of them.)
    const anyInPlan = specialists.some((sp) => planByPersona.has(sp));
    if (plan && !anyInPlan) continue;

    t += 400;
    script.push({
      type: "persona_started",
      payload: {
        workflowRunId,
        nodeId: `${dept}-mgr`,
        personaId: `${dept}-mgr`,
        layer: "manager",
        department: dept,
      },
      delayMs: t,
    });

    for (const sp of specialists) {
      // If a plan exists, only emit for tasks that are actually in it. If no
      // plan, fall back to a single placeholder task so callers without a
      // plan (e.g. fresh `mock-run-<base36>`) still see motion on the DAG.
      const tasks: Array<Pick<WorkflowTask, "id">> = planByPersona.get(sp) ?? [];
      if (tasks.length === 0) {
        if (plan) continue;
        tasks.push({ id: `${sp}-1` });
      }

      let firstTaskOfPersona = true;
      for (const task of tasks) {
        const nodeId = task.id;

        t += 250;
        script.push({
          type: "persona_started",
          payload: {
            workflowRunId,
            nodeId,
            personaId: sp,
            layer: "specialist",
            department: dept,
          },
          delayMs: t,
        });

        t += 200;
        script.push({
          type: "tool_called",
          payload: {
            workflowRunId,
            nodeId,
            personaId: sp,
            toolName: TOOL_FOR_PERSONA[sp] ?? "COMPOSIO_SEARCH_TOOLS",
          },
          delayMs: t,
        });

        t += 200;
        script.push({
          type: "artifact_created",
          payload: {
            workflowRunId,
            nodeId,
            personaId: sp,
            artifactType: ARTIFACT_FOR_PERSONA[sp] ?? "Artifact",
            artifactId: `mock-${workflowRunId}-${nodeId}`,
          },
          delayMs: t,
        });

        // Approval gate — fire after the GEO-Editor produces the BlogDraft,
        // since that's where the founder picks publish destinations.
        if (sp === "geo-editor" && firstTaskOfPersona) {
          t += 350;
          script.push({
            type: "approval_requested",
            payload: {
              workflowRunId,
              approvalId: `mock-approval-${workflowRunId}-${nodeId}`,
              artifactType: "BlogDraft",
              blastRadius: "external",
              reason:
                "Approve the final draft and pick which destinations to publish to.",
            },
            delayMs: t,
          });
        }

        t += 200;
        script.push({
          type: "persona_completed",
          payload: { workflowRunId, nodeId, personaId: sp },
          delayMs: t,
        });

        firstTaskOfPersona = false;
      }
    }
  }

  // Mark the run done so consumers that key off lifecycle (the runs list,
  // `<LiveRunsStrip>` eviction, the active-run store eviction) react.
  t += 400;
  script.push({
    type: "workflow_done",
    payload: { workflowRunId, state: "done" },
    delayMs: t,
  });

  return script;
}

/**
 * Replay a mock event script into the real SSE pipe.
 * Returns immediately if NEXT_PUBLIC_USE_MOCKS is not set.
 *
 * Pass the run's plan so the script can target real task ids — without it,
 * status derivation in dag-view never resolves and every stage stays pending.
 */
export function useMockDriver(
  workflowRunId: string | null,
  plan: WorkflowDAG | null = null,
) {
  useEffect(() => {
    if (!isMockMode || !workflowRunId) return;

    let cancelled = false;
    const script = buildScript(workflowRunId, plan);
    const timers: Array<ReturnType<typeof setTimeout>> = [];

    for (const evt of script) {
      const handle = setTimeout(() => {
        if (cancelled) return;
        void fetch("/api/stream/mock-emit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: evt.type, payload: evt.payload }),
        }).catch(() => {
          /* swallow — dashboard still works without it */
        });
      }, evt.delayMs);
      timers.push(handle);
    }

    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, [workflowRunId, plan]);
}

export const MOCK_MODE = isMockMode;
