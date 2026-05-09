"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  ListChecks,
  Mail,
  ShieldAlert,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApprovalCard } from "@/lib/ui/components/approval-card";
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
}

export function ApprovalsList({ approvals }: ApprovalsListProps) {
  const router = useRouter();
  const [active, setActive] = useState<ApprovalRequest | null>(null);

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {approvals.map((a) => {
          const Icon = ARTIFACT_ICON[a.artifactType] ?? ListChecks;
          const blast = BLAST_TONE[a.blastRadius];
          const BlastIcon = blast.icon;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setActive(a)}
                className="block w-full text-left"
              >
                <Card className="gap-2 p-4 transition-colors hover:bg-muted/40">
                  <div className="flex items-start gap-3">
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
                          className={cn("font-medium", blast.className)}
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
                </Card>
              </button>
            </li>
          );
        })}
      </ul>

      {active ? (
        <ApprovalCard
          approval={active}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setActive(null);
              router.refresh();
            }
          }}
          onResolved={() => {
            setActive(null);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
