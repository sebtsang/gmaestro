"use client";

import { useEffect } from "react";
import type {
  GMaestroEventName,
  GMaestroEvents,
} from "@/lib/realtime/events";

/**
 * When NEXT_PUBLIC_USE_MOCKS=1, the dashboard primes the SSE pipe by POSTing
 * a sequence of mock events to /api/stream/mock-emit. This lets us exercise
 * the full realtime path (eventBus → SSE → useEventStream) without Sessions
 * 1+2's persona runtime being live.
 *
 * The mock script lives client-side because it's purely demo data — no need
 * to import lib/shared/mocks (server-only via "server-only" import chain).
 */

const isMockMode =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_USE_MOCKS === "1";

type MockEvent = {
  type: GMaestroEventName;
  payload: GMaestroEvents[GMaestroEventName];
  delayMs: number;
};

function buildScript(workflowRunId: string): MockEvent[] {
  const departments = [
    { dept: "sales", specialists: ["researcher", "qualifier", "strategist", "writer"] },
    { dept: "cs", specialists: ["activation"] },
    { dept: "revops", specialists: ["crm-logger"] },
  ] as const;

  const script: MockEvent[] = [];
  let t = 200;

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

  for (const { dept, specialists } of departments) {
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
      t += 350;
      script.push({
        type: "persona_started",
        payload: {
          workflowRunId,
          nodeId: `${sp}-1`,
          personaId: sp,
          layer: "specialist",
          department: dept,
        },
        delayMs: t,
      });

      t += 250;
      script.push({
        type: "tool_called",
        payload: {
          workflowRunId,
          nodeId: `${sp}-1`,
          personaId: sp,
          toolName:
            sp === "researcher"
              ? "LINKEDIN_GET_PROFILE"
              : sp === "writer"
                ? "GMAIL_DRAFT"
                : sp === "crm-logger"
                  ? "HUBSPOT_CREATE_CONTACT"
                  : "GENERIC_TOOL",
        },
        delayMs: t,
      });

      t += 300;
      script.push({
        type: "artifact_created",
        payload: {
          workflowRunId,
          nodeId: `${sp}-1`,
          personaId: sp,
          artifactType:
            sp === "researcher"
              ? "EnrichedLead"
              : sp === "qualifier"
                ? "QualifiedLead"
                : sp === "strategist"
                  ? "OutreachStrategy"
                  : sp === "writer"
                    ? "OutreachDraft"
                    : sp === "activation"
                      ? "ActivationNudge"
                      : "Artifact",
          artifactId: `mock-${sp}-001`,
        },
        delayMs: t,
      });

      if (sp === "writer") {
        t += 400;
        script.push({
          type: "approval_requested",
          payload: {
            workflowRunId,
            approvalId: "mock-approval-001",
            artifactType: "OutreachDraft",
            blastRadius: "external",
            reason:
              "Sending personalized outreach to a real prospect outside the team.",
          },
          delayMs: t,
        });
      }

      t += 250;
      script.push({
        type: "persona_completed",
        payload: { workflowRunId, nodeId: `${sp}-1`, personaId: sp },
        delayMs: t,
      });
    }
  }

  return script;
}

/**
 * Replay a mock event script into the real SSE pipe.
 * Returns immediately if NEXT_PUBLIC_USE_MOCKS is not set.
 */
export function useMockDriver(workflowRunId: string | null) {
  useEffect(() => {
    if (!isMockMode || !workflowRunId) return;

    let cancelled = false;
    const script = buildScript(workflowRunId);
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
  }, [workflowRunId]);
}

export const MOCK_MODE = isMockMode;
