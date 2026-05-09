"use client";

import { useEffect, useMemo, useState } from "react";
import { ApprovalCard } from "@/lib/ui/components/approval-card";
import type { ApprovalRequest } from "@/lib/shared/types";
import type { WireEvent } from "@/lib/realtime/events";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";

interface LiveApprovalSurfaceProps {
  events: WireEvent[];
}

function buildMockApproval(
  approvalId: string,
  artifactType: string,
  blastRadius: ApprovalRequest["blastRadius"],
  reason: string,
  workflowRunId: string,
): ApprovalRequest {
  return {
    id: approvalId,
    workflowRunId,
    artifactType:
      artifactType === "ActivationNudge"
        ? "ActivationNudge"
        : artifactType === "CRMUpdate"
          ? "CRMUpdate"
          : "OutreachDraft",
    artifactId: `${approvalId}-artifact`,
    blastRadius,
    reason,
    proposedAction:
      artifactType === "OutreachDraft"
        ? {
            tool: "gmail.send",
            to: "jordan@acme.example",
            subject: "Demo for Acme - quick question",
            body:
              "Hey Jordan,\n\nSaw your HN post - congrats on the seed. I run GMaestro, an AI GTM team for founders.\n\nNoticed Acme is hiring backend engineers; that's exactly the moment we wedge in for most of our customers (founder-led GTM, no sales hire yet). Mind if I send a 90-second Loom on what we'd do for the first 47 leads in your inbox this week?\n\nIf there's a better time, just say the word.\n\n- [Founder]",
          }
        : artifactType === "ActivationNudge"
          ? {
              channel: "email",
              subject: "Stuck on connecting your first tool?",
              body:
                "Hey, saw you started a trial yesterday but haven't connected Gmail yet. Want me to walk you through it?",
            }
          : { tool: "hubspot.update_deal", dealId: "d_123", stage: "interested" },
    status: "pending",
    createdAt: new Date(),
  };
}

export function LiveApprovalSurface({ events }: LiveApprovalSurfaceProps) {
  const [active, setActive] = useState<ApprovalRequest | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());

  // Find the most recent unresolved approval_requested event.
  const pending = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.type === "approval_requested" && !resolvedIds.has(e.payload.approvalId)) {
        return e.payload;
      }
    }
    return null;
  }, [events, resolvedIds]);

  useEffect(() => {
    if (!pending) return;
    if (active && active.id === pending.approvalId) return;

    let cancelled = false;
    const load = async () => {
      if (MOCK_MODE) {
        const approval = buildMockApproval(
          pending.approvalId,
          pending.artifactType,
          pending.blastRadius,
          pending.reason,
          pending.workflowRunId,
        );
        if (!cancelled) setActive(approval);
        return;
      }

      try {
        const res = await fetch(`/api/approvals/${pending.approvalId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApprovalRequest;
        // Re-hydrate Date fields from JSON.
        const approval: ApprovalRequest = {
          ...data,
          createdAt: new Date(data.createdAt),
          resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
        };
        if (!cancelled) setActive(approval);
      } catch {
        // Endpoint not live yet — fall back to mock-style stub so the UI still
        // shows something demo-able.
        const approval = buildMockApproval(
          pending.approvalId,
          pending.artifactType,
          pending.blastRadius,
          pending.reason,
          pending.workflowRunId,
        );
        if (!cancelled) setActive(approval);
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [pending, active]);

  if (!active) return null;

  return (
    <ApprovalCard
      approval={active}
      open={true}
      onOpenChange={(open) => {
        if (!open) {
          setResolvedIds((prev) => {
            const next = new Set(prev);
            next.add(active.id);
            return next;
          });
          setActive(null);
        }
      }}
      onResolved={() => {
        setResolvedIds((prev) => {
          const next = new Set(prev);
          next.add(active.id);
          return next;
        });
        setActive(null);
      }}
      mock={MOCK_MODE}
    />
  );
}
