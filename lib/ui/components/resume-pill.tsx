"use client";

/**
 * Surfaces "you have a run still in flight — click to resume" above the
 * prompt input on the home page. Polls /api/runs/list once on mount and
 * patches itself live as workflow_started / run_titled / workflow_done
 * events fly past on the shared bus.
 *
 * Visible only when there's at least one run with a non-terminal state.
 * In mock mode, returns null — the home hero is the only entry point.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSharedEvents } from "@/lib/ui/hooks/use-shared-events";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import { isActiveWorkflowState } from "@/lib/ui/workflow-state";
import type { WorkflowState } from "@/lib/shared/types";

interface RunRow {
  id: string;
  title: string | null;
  prompt: string;
  state: WorkflowState;
  startedAt: string;
}

export function ResumePill() {
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const events = useSharedEvents();

  useEffect(() => {
    if (MOCK_MODE) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/runs/list?limit=50")
      .then((r) => r.json())
      .then((data: { runs: RunRow[] }) => {
        if (cancelled) return;
        setRuns(data.runs);
      })
      .catch(() => {
        // Silent — pill just won't show.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Patch the local list as relevant events fly past.
  useEffect(() => {
    if (events.length === 0) return;
    setRuns((prev) => {
      let next = prev;
      for (const e of events) {
        if (e.type === "workflow_started") {
          const p = e.payload as {
            workflowRunId: string;
            prompt: string;
            startedAt: string;
          };
          if (next.find((r) => r.id === p.workflowRunId)) continue;
          next = [
            {
              id: p.workflowRunId,
              title: null,
              prompt: p.prompt,
              state: "running",
              startedAt: p.startedAt,
            },
            ...next,
          ];
        } else if (e.type === "run_titled") {
          const p = e.payload as { workflowRunId: string; title: string };
          next = next.map((r) =>
            r.id === p.workflowRunId ? { ...r, title: p.title } : r,
          );
        } else if (e.type === "workflow_done") {
          const p = e.payload as {
            workflowRunId: string;
            state: "done" | "failed";
          };
          next = next.map((r) =>
            r.id === p.workflowRunId ? { ...r, state: p.state } : r,
          );
        }
      }
      return next;
    });
  }, [events]);

  const active = useMemo(
    () => runs.filter((r) => isActiveWorkflowState(r.state)),
    [runs],
  );

  if (loading || MOCK_MODE) return null;
  if (active.length === 0) return null;

  const latest = active[0];
  const label =
    latest.title ??
    (latest.prompt.length > 64
      ? latest.prompt.slice(0, 64).trimEnd() + "…"
      : latest.prompt);

  return (
    <Link
      href={`/runs/${latest.id}`}
      className={cn(
        "group flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300",
      )}
    >
      <Loader2 className="size-3 animate-spin" />
      <span className="text-muted-foreground">Resume:</span>
      <span className="max-w-[36ch] truncate">{label}</span>
      {active.length > 1 ? (
        <span className="rounded-full bg-amber-500/20 px-1.5 py-px text-[10px]">
          +{active.length - 1}
        </span>
      ) : null}
      <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
