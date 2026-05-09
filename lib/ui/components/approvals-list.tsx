"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  CheckCheck,
  ListChecks,
  Mail,
  ShieldAlert,
  Sparkles,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ApprovalCard } from "@/lib/ui/components/approval-card";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import { usePendingApprovals } from "@/lib/ui/hooks/use-pending-approvals";
import type {
  ApprovalArtifactType,
  ApprovalRequest,
  BlastRadius,
} from "@/lib/shared/types";
import { cn } from "@/lib/utils";

const ARTIFACT_ICON: Record<ApprovalArtifactType, LucideIcon> = {
  OutreachDraft: Mail,
  ActivationNudge: Sparkles,
  CRMUpdate: Building2,
  CustomDeal: ListChecks,
};

const BLAST_TONE: Record<
  BlastRadius,
  { label: string; icon: LucideIcon; className: string }
> = {
  internal: {
    label: "Internal",
    icon: ShieldAlert,
    className:
      "bg-slate-500/15 text-slate-700 dark:bg-slate-400/20 dark:text-slate-200",
  },
  external: {
    label: "External",
    icon: AlertTriangle,
    className:
      "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200",
  },
  irreversible: {
    label: "Irreversible",
    icon: AlertOctagon,
    className:
      "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
  },
};

interface ApprovalsListProps {
  approvals: ApprovalRequest[];
  /** Toolkits the founder has actively connected. Drives the approval card's
   *  provider picker — if a toolkit isn't here, it isn't offered as a send
   *  option. Reconciled live against Composio on page load. */
  connectedToolkits: string[];
}

interface RunGroup {
  runId: string;
  approvals: ApprovalRequest[];
}

function groupByRun(approvals: ApprovalRequest[]): RunGroup[] {
  const map = new Map<string, ApprovalRequest[]>();
  for (const a of approvals) {
    const arr = map.get(a.workflowRunId) ?? [];
    arr.push(a);
    map.set(a.workflowRunId, arr);
  }
  return [...map.entries()]
    .map(([runId, list]) => ({
      runId,
      approvals: list.sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      ),
    }))
    .sort(
      (a, b) =>
        b.approvals[0].createdAt.getTime() - a.approvals[0].createdAt.getTime(),
    );
}

export function ApprovalsList({
  approvals,
  connectedToolkits,
}: ApprovalsListProps) {
  const router = useRouter();
  const { resolve } = usePendingApprovals();
  const [active, setActive] = useState<ApprovalRequest | null>(null);
  // Per-approval "rejected" toggle. Default false → will be approved on
  // bulk-resolve. User flips on individual rows they want to reject.
  const [rejected, setRejected] = useState<Record<string, boolean>>({});
  const [isPending, startTransition] = useTransition();

  const groups = useMemo(() => groupByRun(approvals), [approvals]);

  const toggleReject = (id: string) =>
    setRejected((prev) => ({ ...prev, [id]: !prev[id] }));

  const clearRejectStateForGroup = (group: RunGroup) => {
    setRejected((prev) => {
      const next = { ...prev };
      for (const a of group.approvals) delete next[a.id];
      return next;
    });
  };

  const bulkResolve = (group: RunGroup) => {
    // Mock mode: no /api/approvals/bulk row to flip — resolve through the
    // shared client store instead. This makes the row disappear from both
    // /approvals AND the dashboard's "Awaiting your review" count.
    if (MOCK_MODE) {
      for (const a of group.approvals) resolve(a.id);
      clearRejectStateForGroup(group);
      return;
    }
    const decisions = group.approvals.map((a) => ({
      approvalId: a.id,
      status: rejected[a.id] ? ("rejected" as const) : ("approved" as const),
    }));
    startTransition(async () => {
      const res = await fetch("/api/approvals/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions }),
      });
      if (res.ok) {
        clearRejectStateForGroup(group);
        // Also resolve in the client store so the dashboard surface clears.
        for (const a of group.approvals) resolve(a.id);
        router.refresh();
      }
    });
  };

  return (
    <>
      <div className="grid gap-6">
        {groups.map((g) => {
          const rejectCount = g.approvals.filter((a) => rejected[a.id]).length;
          const approveCount = g.approvals.length - rejectCount;
          return (
            <section key={g.runId} className="grid gap-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="font-mono text-xs text-muted-foreground">
                    run {g.runId.slice(0, 8)}
                  </h2>
                  <p className="text-sm">
                    <span className="font-medium">{g.approvals.length}</span>{" "}
                    pending {g.approvals.length === 1 ? "approval" : "approvals"}
                    {rejectCount > 0 ? (
                      <span className="ml-2 text-rose-600 dark:text-rose-400">
                        — {rejectCount} marked reject
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={isPending || g.approvals.length === 0}
                  onClick={() => bulkResolve(g)}
                  className="shrink-0"
                >
                  <CheckCheck className="size-4" />
                  Approve {approveCount}
                  {rejectCount > 0 ? `, reject ${rejectCount}` : ""}
                </Button>
              </div>

              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {g.approvals.map((a) => {
                  const Icon = ARTIFACT_ICON[a.artifactType] ?? ListChecks;
                  const blast = BLAST_TONE[a.blastRadius];
                  const BlastIcon = blast.icon;
                  const isRejected = !!rejected[a.id];
                  return (
                    <li key={a.id}>
                      <Card
                        className={cn(
                          "gap-2 p-4 transition-colors",
                          isRejected && "border-rose-500/60 bg-rose-500/5",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            onClick={() => setActive(a)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-2">
                              <div className="rounded-lg bg-muted p-2">
                                <Icon className="size-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">
                                    {a.artifactType}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "font-medium",
                                      blast.className,
                                    )}
                                  >
                                    <BlastIcon />
                                    {blast.label}
                                  </Badge>
                                </div>
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {a.reason}
                                </p>
                              </div>
                            </div>
                          </button>
                          <Button
                            size="icon"
                            variant={isRejected ? "destructive" : "ghost"}
                            className="size-8 shrink-0"
                            title={
                              isRejected
                                ? "Unmark - will be approved"
                                : "Mark to reject in bulk action"
                            }
                            onClick={() => toggleReject(a.id)}
                          >
                            {isRejected ? (
                              <Undo2 className="size-3.5" />
                            ) : (
                              <X className="size-3.5" />
                            )}
                          </Button>
                        </div>
                      </Card>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {active ? (
        <ApprovalCard
          approval={active}
          connectedToolkits={connectedToolkits}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setActive(null);
              if (!MOCK_MODE) router.refresh();
            }
          }}
          onResolved={() => {
            const id = active.id;
            setActive(null);
            // Resolve in the shared client store so the dashboard's resume
            // pill and "awaiting your review" count clear immediately.
            resolve(id);
            if (!MOCK_MODE) router.refresh();
          }}
          mock={MOCK_MODE}
        />
      ) : null}
    </>
  );
}
