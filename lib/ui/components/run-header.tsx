"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { WorkflowState } from "@/lib/shared/types";
import { cn } from "@/lib/utils";

const STATE_TONE: Record<WorkflowState, string> = {
  planning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  running: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  awaiting_approval: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  done: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  failed: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const STATE_LABEL: Record<WorkflowState, string> = {
  planning: "Planning",
  running: "Running",
  awaiting_approval: "Awaiting approval",
  done: "Done",
  failed: "Failed",
};

interface RunHeaderProps {
  runId: string | null;
  prompt: string | null;
  state: WorkflowState | null;
  startedAt: Date | null;
}

export function RunHeader({ runId, prompt, state, startedAt }: RunHeaderProps) {
  const [elapsed, setElapsed] = useState<string>("—");

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => {
      const ms = Date.now() - startedAt.getTime();
      const s = Math.max(0, Math.floor(ms / 1000));
      const m = Math.floor(s / 60);
      const r = s % 60;
      setElapsed(m > 0 ? `${m}m ${r}s` : `${r}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  if (!runId) {
    return (
      <div className="flex h-12 items-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 text-sm text-muted-foreground">
        <span>No active run — type a prompt below to start.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 text-sm">
      {state ? (
        <Badge
          className={cn("font-medium", STATE_TONE[state])}
          variant="secondary"
        >
          {STATE_LABEL[state]}
        </Badge>
      ) : null}
      <div className="min-w-0 flex-1 truncate text-foreground">
        {prompt ?? "—"}
      </div>
      <Separator orientation="vertical" className="h-4" />
      <div className="font-mono text-xs text-muted-foreground">
        {elapsed}
      </div>
      <Separator orientation="vertical" className="h-4" />
      <div className="font-mono text-xs text-muted-foreground">
        run {runId.slice(0, 8)}
      </div>
    </div>
  );
}
