"use client";

import { useMemo } from "react";
import {
  CalendarCheck,
  CheckCircle2,
  Mail,
  Send,
  Target,
  UserSearch,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { WireEvent } from "@/lib/realtime/events";
import { cn } from "@/lib/utils";

interface StateSidebarProps {
  events: WireEvent[];
}

interface CounterDef {
  key: string;
  label: string;
  icon: LucideIcon;
  tone: string;
}

const COUNTERS: CounterDef[] = [
  { key: "enriched", label: "Enriched", icon: UserSearch, tone: "text-sky-600 dark:text-sky-400" },
  { key: "qualified", label: "Qualified", icon: Target, tone: "text-violet-600 dark:text-violet-400" },
  { key: "drafted", label: "Drafted", icon: Mail, tone: "text-blue-600 dark:text-blue-400" },
  { key: "approved", label: "Approved", icon: CheckCircle2, tone: "text-emerald-600 dark:text-emerald-400" },
  { key: "sent", label: "Sent", icon: Send, tone: "text-emerald-600 dark:text-emerald-400" },
  { key: "meetings", label: "Meetings", icon: CalendarCheck, tone: "text-amber-600 dark:text-amber-400" },
];

function deriveCounts(events: WireEvent[]): Record<string, number> {
  const counts: Record<string, number> = {
    enriched: 0,
    qualified: 0,
    drafted: 0,
    approved: 0,
    sent: 0,
    meetings: 0,
  };

  const seen = new Set<string>();
  const dedupe = (key: string) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  for (const e of events) {
    if (e.type === "artifact_created") {
      const p = e.payload;
      const dedupeKey = `${p.artifactType}:${p.artifactId}`;
      if (!dedupe(dedupeKey)) continue;
      switch (p.artifactType) {
        case "EnrichedLead":
          counts.enriched += 1;
          break;
        case "QualifiedLead":
          counts.qualified += 1;
          break;
        case "OutreachDraft":
        case "ActivationNudge":
          counts.drafted += 1;
          break;
        case "BookedMeeting":
          counts.meetings += 1;
          break;
      }
    } else if (e.type === "approval_resolved") {
      const p = e.payload;
      const dedupeKey = `approval:${p.approvalId}`;
      if (!dedupe(dedupeKey)) continue;
      if (p.status === "approved" || p.status === "edited") {
        counts.approved += 1;
        counts.sent += 1;
      }
    }
  }

  return counts;
}

export function StateSidebar({ events }: StateSidebarProps) {
  const counts = useMemo(() => deriveCounts(events), [events]);

  return (
    <Card className="gap-0 p-0">
      <div className="border-b border-border px-4 py-3 text-sm font-medium">
        Pipeline state
      </div>
      <CardContent className="grid grid-cols-2 gap-3 p-4">
        {COUNTERS.map((c) => {
          const Icon = c.icon;
          const value = counts[c.key] ?? 0;
          return (
            <div
              key={c.key}
              className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{c.label}</span>
                <Icon className={cn("size-3.5", c.tone)} />
              </div>
              <span className="font-mono text-2xl font-semibold tabular-nums">
                {value}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
