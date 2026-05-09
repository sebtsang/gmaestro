"use client";

/**
 * Horizontal chip strip in the top nav showing currently in-flight runs.
 *
 * Multiple workflows can run concurrently — `POST /api/runs` is fire-and-
 * forget and each run has its own `workflowRunId`. Without this strip, the
 * founder loses sight of run A the moment they navigate to start run B,
 * because the home page just redirects to `/runs/<newId>`.
 *
 * Hidden when no run is in flight so it costs zero pixels in the idle case.
 * On `/runs/<id>`, the chip for the currently-viewed run is rendered active
 * so the founder can spot which one they're looking at.
 *
 * Data + live patching come from the shared `useRunsList` hook (also used by
 * `<RecentRunsList>`), so the strip stays in sync with the home-page list.
 */

import Link from "next/link";
import { useMemo } from "react";
import { usePathname } from "next/navigation";
import {
  CircleDashed,
  Loader2,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRunsList } from "@/lib/ui/hooks/use-runs-list";
import {
  isActiveWorkflowState,
  type ActiveWorkflowState,
} from "@/lib/ui/workflow-state";

const STATE_ICON: Record<ActiveWorkflowState, LucideIcon> = {
  planning: CircleDashed,
  running: Loader2,
  awaiting_approval: ShieldAlert,
};

const STATE_TONE: Record<ActiveWorkflowState, string> = {
  planning: "text-slate-500",
  running: "text-sky-500",
  awaiting_approval: "text-amber-500",
};

const MAX_CHIPS = 4;

export function LiveRunsStrip() {
  const { runs } = useRunsList();
  const pathname = usePathname();

  const active = useMemo(
    () =>
      runs.filter(
        (r): r is typeof r & { state: ActiveWorkflowState } =>
          isActiveWorkflowState(r.state),
      ),
    [runs],
  );

  if (active.length === 0) return null;

  const visible = active.slice(0, MAX_CHIPS);
  const overflow = active.length - visible.length;

  return (
    <div
      className="hidden items-center gap-1 md:flex"
      data-testid="live-runs-strip"
    >
      <span className="mr-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Live
      </span>
      {visible.map((r) => {
        const Icon = STATE_ICON[r.state];
        const tone = STATE_TONE[r.state];
        const onThisRun = pathname === `/runs/${r.id}`;
        const label = r.title ?? r.prompt;
        return (
          <Link
            key={r.id}
            href={`/runs/${r.id}`}
            title={label}
            className={cn(
              "flex max-w-[12rem] items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              onThisRun
                ? "border-foreground/40 bg-muted text-foreground"
                : "border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            <Icon
              className={cn(
                "size-3 shrink-0",
                tone,
                r.state === "planning" || r.state === "running"
                  ? "animate-spin"
                  : "",
              )}
            />
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
      {overflow > 0 ? (
        <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
