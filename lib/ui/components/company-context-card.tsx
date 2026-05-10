"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  ChevronDown,
  Loader2,
  PencilLine,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { IcpPrioritySchema } from "@/lib/shared/schemas";
import type {
  CompanyContext,
  GtmObjective,
  IcpPriority,
} from "@/lib/shared/types";
import { cn } from "@/lib/utils";
import { EditCompanyContextDialog } from "@/lib/ui/components/edit-company-context-dialog";
import { useCompanyContext, type LiveCounts } from "@/lib/ui/hooks/use-company-context";

const PRIORITY_TONE: Record<IcpPriority, string> = {
  hot: "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300 border-rose-500/30",
  warm: "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 border-amber-500/30",
  cold: "bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300 border-slate-500/30",
};

const PRIORITY_ORDER = Object.fromEntries(
  IcpPrioritySchema.options.map((p, i) => [p, i]),
) as Record<IcpPriority, number>;

function summarize(context: CompanyContext): string {
  const company = context.companyOverview.split(/[—.]/)[0]?.trim() ?? "Company";
  const icpCount = context.icps.length;
  const topGoal = context.gtmObjectives[0];
  const goalChip = topGoal
    ? ` · ${topGoal.target} ${topGoal.label.replace(/^Q\d\s+/i, "")}`
    : "";
  const company72 = company.length > 72 ? `${company.slice(0, 69)}…` : company;
  return `${company72} · ${icpCount} ICP${icpCount === 1 ? "" : "s"}${goalChip}`;
}

export function CompanyContextCard() {
  const { context, liveCounts, loading, refreshing, save, refresh } =
    useCompanyContext();
  const [open, setOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSeed, setEditorSeed] = useState<CompanyContext | null>(null);

  const sortedIcps = useMemo(
    () =>
      context
        ? [...context.icps].sort(
            (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
          )
        : [],
    [context],
  );

  if (loading) return null;

  const empty = !context;

  const handleEdit = () => {
    setEditorSeed(context);
    setEditorOpen(true);
  };

  const handleRefresh = async () => {
    const proposed = await refresh();
    if (!proposed) return;
    setEditorSeed(proposed);
    setEditorOpen(true);
  };

  return (
    <>
      <Card size="sm" className="w-full">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
        >
          <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-sm font-medium">
            {empty ? "No company context yet" : summarize(context)}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
              !open && "-rotate-90",
            )}
          />
        </button>

        {open && (
          <>
            <div className="mx-3 border-t border-border/60" />
            <CardContent className="grid gap-4 pb-3 pt-1">
              {empty ? (
                <EmptyState onEdit={handleEdit} />
              ) : (
                <>
                  <CompanySection context={context} />
                  <IcpsSection icps={sortedIcps} />
                  <ObjectivesSection
                    objectives={context.gtmObjectives}
                    counts={liveCounts}
                  />
                </>
              )}
            </CardContent>
            <CardFooter className="justify-between gap-2 py-2">
              <span className="text-[11px] text-muted-foreground">
                {context
                  ? `Updated ${context.updatedAt.toLocaleString()}`
                  : "Set up so agents stay aligned"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleEdit}
                  className="gap-1.5"
                >
                  <PencilLine className="size-3.5" />
                  Edit context
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                  className="gap-1.5"
                >
                  {refreshing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Refresh from AI
                </Button>
              </div>
            </CardFooter>
          </>
        )}
      </Card>

      <EditCompanyContextDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editorSeed}
        onSave={async (next) => {
          await save(next);
          setEditorOpen(false);
        }}
      />
    </>
  );
}

function EmptyState({ onEdit }: { onEdit: () => void }) {
  return (
    <div className="grid gap-2 py-2 text-sm text-muted-foreground">
      <p>
        Tell your agents who you are and what you&apos;re going after. They&apos;ll keep
        their reasoning anchored to your ICP and quarterly goals.
      </p>
      <div>
        <Button size="sm" onClick={onEdit} className="gap-1.5">
          <PencilLine className="size-3.5" />
          Set up company context
        </Button>
      </div>
    </div>
  );
}

function CompanySection({ context }: { context: CompanyContext }) {
  return (
    <section className="grid gap-2">
      <SectionHeader icon={Building2} label="Company" />
      <p className="text-sm leading-relaxed text-foreground">
        {context.companyOverview}
      </p>
      {context.keyFacts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {context.keyFacts.map((fact) => (
            <Badge key={fact} variant="outline" className="text-[11px]">
              {fact}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

function IcpsSection({ icps }: { icps: CompanyContext["icps"] }) {
  return (
    <section className="grid gap-2">
      <SectionHeader icon={Users} label={`ICPs (${icps.length})`} />
      {icps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No ICPs defined yet.</p>
      ) : (
        <ul className="grid gap-2">
          {icps.map((icp) => (
            <li
              key={icp.name}
              className="rounded-lg border border-border/60 bg-muted/20 p-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                    PRIORITY_TONE[icp.priority],
                  )}
                >
                  {icp.priority}
                </span>
                <span className="text-sm font-medium">{icp.name}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {icp.description}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {icp.companySizeRange && (
                  <Badge variant="secondary" className="text-[10px]">
                    {icp.companySizeRange}
                  </Badge>
                )}
                {icp.industry.map((ind) => (
                  <Badge
                    key={ind}
                    variant="secondary"
                    className="text-[10px]"
                  >
                    {ind}
                  </Badge>
                ))}
                {icp.seniority.map((s) => (
                  <Badge
                    key={s}
                    variant="outline"
                    className="text-[10px]"
                  >
                    {s}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ObjectivesSection({
  objectives,
  counts,
}: {
  objectives: GtmObjective[];
  counts: LiveCounts;
}) {
  return (
    <section className="grid gap-2">
      <SectionHeader icon={Target} label="GTM goals" />
      {objectives.length === 0 ? (
        <p className="text-xs text-muted-foreground">No goals set.</p>
      ) : (
        <ul className="grid gap-2">
          {objectives.map((obj) => {
            const count = counts[obj.metric] ?? 0;
            const pct = Math.min(100, Math.round((count / obj.target) * 100));
            const onTrack = count >= obj.target;
            return (
              <li key={`${obj.metric}-${obj.label}`} className="grid gap-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="size-3 text-muted-foreground" />
                    <span className="font-medium">{obj.label}</span>
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <span
                      className={cn(
                        "font-semibold",
                        onTrack
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-foreground",
                      )}
                    >
                      {count}
                    </span>
                    <span> / {obj.target}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      onTrack ? "bg-emerald-500" : "bg-sky-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SectionHeader({
  icon: Icon,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <Icon className="size-3" />
      {label}
    </div>
  );
}
