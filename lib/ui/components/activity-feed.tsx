"use client";

import { useMemo } from "react";
import {
  ArrowRight,
  ArrowUpCircle,
  Ban,
  CheckCircle2,
  CircleDot,
  FilePlus,
  ShieldCheck,
  ShieldQuestion,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getPersonaLabel } from "@/lib/ui/persona-meta";
import type { WireEvent } from "@/lib/realtime/events";
import { cn } from "@/lib/utils";

interface ActivityFeedProps {
  events: WireEvent[];
  /** Optional maximum number of rows shown (default 80). */
  max?: number;
}

interface DerivedRow {
  key: string;
  icon: LucideIcon;
  tone: string;
  text: string;
  detail?: string;
  receivedAt: number;
}

function deriveRow(event: WireEvent, idx: number): DerivedRow | null {
  const baseKey = `${event.type}-${idx}`;
  switch (event.type) {
    case "persona_started": {
      const personaLabel = getPersonaLabel(event.payload.personaId);
      return {
        key: baseKey,
        icon: CircleDot,
        tone: "text-blue-600 dark:text-blue-400",
        text: `${personaLabel} started`,
        receivedAt: Date.now(),
      };
    }
    case "tool_called": {
      const personaLabel = getPersonaLabel(event.payload.personaId);
      return {
        key: baseKey,
        icon: Wrench,
        tone: "text-slate-600 dark:text-slate-300",
        text: `${personaLabel} → ${event.payload.toolName}`,
        receivedAt: Date.now(),
      };
    }
    case "tool_call_proposed": {
      const personaLabel = getPersonaLabel(event.payload.personaId);
      const bare = event.payload.toolName.replace(/^mcp__composio__/, "");
      const blast = event.payload.blastRadius;
      const tone =
        blast === "high"
          ? "text-rose-600 dark:text-rose-400"
          : blast === "medium"
            ? "text-amber-600 dark:text-amber-400"
            : "text-slate-500 dark:text-slate-400";
      const inputPreview = JSON.stringify(event.payload.input).slice(0, 80);
      return {
        key: baseKey,
        icon: Wrench,
        tone,
        text: `${personaLabel} proposes ${bare} (${blast})`,
        detail: inputPreview,
        receivedAt: Date.now(),
      };
    }
    case "tool_call_reviewed": {
      const tone =
        event.payload.decision === "blocked"
          ? "text-rose-600 dark:text-rose-400"
          : event.payload.decision === "escalated_to_founder"
            ? "text-amber-600 dark:text-amber-400"
            : "text-emerald-600 dark:text-emerald-400";
      return {
        key: baseKey,
        icon: ArrowUpCircle,
        tone,
        text: event.payload.reason,
        receivedAt: Date.now(),
      };
    }
    case "tool_call_executed": {
      const personaLabel = getPersonaLabel(event.payload.personaId);
      const bare = event.payload.toolName.replace(/^mcp__composio__/, "");
      const outcome = event.payload.outcome;
      const icon = outcome === "denied" ? Ban : outcome === "dry_run" ? Sparkles : CheckCircle2;
      const tone =
        outcome === "denied"
          ? "text-rose-600 dark:text-rose-400"
          : outcome === "dry_run"
            ? "text-violet-600 dark:text-violet-400"
            : "text-emerald-600 dark:text-emerald-400";
      const label =
        outcome === "dry_run"
          ? "captured (dry run)"
          : outcome === "denied"
            ? "denied"
            : "executed";
      return {
        key: baseKey,
        icon,
        tone,
        text: `${personaLabel} · ${bare} ${label}`,
        detail: event.payload.note,
        receivedAt: Date.now(),
      };
    }
    case "artifact_created": {
      const personaLabel = getPersonaLabel(event.payload.personaId);
      return {
        key: baseKey,
        icon: FilePlus,
        tone: "text-violet-600 dark:text-violet-400",
        text: `${personaLabel} produced ${event.payload.artifactType}`,
        detail: event.payload.artifactId,
        receivedAt: Date.now(),
      };
    }
    case "approval_requested": {
      return {
        key: baseKey,
        icon: ShieldQuestion,
        tone: "text-amber-600 dark:text-amber-400",
        text: `Approval requested · ${event.payload.artifactType}`,
        detail: event.payload.reason,
        receivedAt: Date.now(),
      };
    }
    case "approval_resolved": {
      return {
        key: baseKey,
        icon: ShieldCheck,
        tone:
          event.payload.status === "rejected"
            ? "text-rose-600 dark:text-rose-400"
            : "text-emerald-600 dark:text-emerald-400",
        text: `Approval ${event.payload.status}`,
        receivedAt: Date.now(),
      };
    }
    case "persona_completed": {
      const personaLabel = getPersonaLabel(event.payload.personaId);
      return {
        key: baseKey,
        icon: CheckCircle2,
        tone: "text-emerald-600 dark:text-emerald-400",
        text: `${personaLabel} completed`,
        receivedAt: Date.now(),
      };
    }
    case "workflow_done": {
      return {
        key: baseKey,
        icon: ArrowRight,
        tone: "text-emerald-600 dark:text-emerald-400",
        text: `Workflow ${event.payload.state}`,
        receivedAt: Date.now(),
      };
    }
    default:
      return null;
  }
}

export function ActivityFeed({ events, max = 80 }: ActivityFeedProps) {
  const rows = useMemo(() => {
    const out: DerivedRow[] = [];
    for (let i = events.length - 1; i >= 0 && out.length < max; i--) {
      const r = deriveRow(events[i], i);
      if (r) out.push(r);
    }
    return out;
  }, [events, max]);

  return (
    <Card className="gap-0 overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Activity</span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {events.length} events
        </span>
      </div>
      <ScrollArea className="h-80">
        <ol className="flex flex-col">
          {rows.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              Waiting for events…
            </li>
          ) : (
            rows.map((r, i) => {
              const Icon = r.icon;
              return (
                <li
                  key={r.key}
                  className={cn(
                    "flex items-start gap-3 border-b border-border/60 px-4 py-2 last:border-b-0",
                    "animate-in fade-in slide-in-from-top-1 duration-200",
                  )}
                  style={{ animationDelay: `${Math.min(i * 8, 80)}ms` }}
                >
                  <Icon className={cn("mt-0.5 size-3.5 shrink-0", r.tone)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground">
                      {r.text}
                    </div>
                    {r.detail ? (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {r.detail}
                      </div>
                    ) : null}
                  </div>
                </li>
              );
            })
          )}
        </ol>
      </ScrollArea>
    </Card>
  );
}
