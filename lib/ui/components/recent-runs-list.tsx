"use client";

/**
 * Compact list of recent workflow runs shown on the dashboard idle view.
 *
 * Data + live-patching are handled by the shared `useRunsList` hook (also
 * consumed by `<LiveRunsStrip>` in the top nav). This component only owns
 * the visual layout — vertical card list, newest first.
 */

import Link from "next/link";
import {
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkflowState } from "@/lib/shared/types";
import { useRunsList } from "@/lib/ui/hooks/use-runs-list";
import { relativeTime } from "@/lib/ui/workflow-state";

interface StateMeta {
  label: string;
  icon: LucideIcon;
  className: string;
}

const STATE_META: Record<WorkflowState, StateMeta> = {
  planning: {
    label: "Planning",
    icon: CircleDashed,
    className:
      "bg-slate-500/15 text-slate-700 dark:bg-slate-400/20 dark:text-slate-200",
  },
  running: {
    label: "Running",
    icon: Loader2,
    className: "bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  },
  awaiting_approval: {
    label: "Awaiting",
    icon: ShieldAlert,
    className:
      "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-200",
  },
  done: {
    label: "Done",
    icon: CheckCircle2,
    className:
      "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className:
      "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-200",
  },
};

export function RecentRunsList({ limit = 5 }: { limit?: number } = {}) {
  const { runs, loading } = useRunsList({ limit });

  if (loading) return null;
  if (runs.length === 0) return null;

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Clock className="size-3" />
        Recent runs
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
        {runs.map((r) => (
          <li key={r.id}>
            <Link
              href={`/runs/${r.id}`}
              className="flex items-center gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-muted/40"
            >
              <StatePill state={r.state} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {r.title ?? r.prompt}
                </div>
                {r.title ? (
                  <div className="truncate text-xs italic text-muted-foreground">
                    {r.prompt}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {relativeTime(r.startedAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatePill({ state }: { state: WorkflowState }) {
  const meta = STATE_META[state];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        meta.className,
      )}
    >
      <Icon
        className={cn(
          "size-2.5",
          state === "running" || state === "planning" ? "animate-spin" : "",
        )}
      />
      {meta.label}
    </span>
  );
}
