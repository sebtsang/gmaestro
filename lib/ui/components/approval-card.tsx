"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  Building2,
  ClipboardEdit,
  ListChecks,
  Mail,
  MessageSquare,
  Paperclip,
  ShieldAlert,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

import type {
  ApprovalArtifactType,
  ApprovalRequest,
  BlastRadius,
} from "@/lib/shared/types";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
//  Blast radius theming
// ---------------------------------------------------------------------------

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

const ARTIFACT_TONE: Record<
  ApprovalArtifactType,
  { label: string; icon: LucideIcon }
> = {
  OutreachDraft: { label: "Outreach draft", icon: Mail },
  ActivationNudge: { label: "Activation nudge", icon: Sparkles },
  CRMUpdate: { label: "CRM update", icon: Building2 },
  CustomDeal: { label: "Custom deal", icon: ListChecks },
};

// ---------------------------------------------------------------------------
//  Editable state for each artifact type
// ---------------------------------------------------------------------------

interface DraftFields {
  to?: string;
  subject?: string;
  body?: string;
}

function extractDraftFields(action: Record<string, unknown>): DraftFields {
  return {
    to: typeof action.to === "string" ? action.to : undefined,
    subject: typeof action.subject === "string" ? action.subject : undefined,
    body: typeof action.body === "string" ? action.body : undefined,
  };
}

function diffDraft(
  initial: DraftFields,
  current: DraftFields,
): string | null {
  const keys: (keyof DraftFields)[] = ["to", "subject", "body"];
  const lines: string[] = [];
  for (const k of keys) {
    if ((initial[k] ?? "") !== (current[k] ?? "")) {
      lines.push(`### ${k}\n${current[k] ?? ""}`);
    }
  }
  return lines.length ? lines.join("\n\n") : null;
}

// ---------------------------------------------------------------------------
//  Component
// ---------------------------------------------------------------------------

export interface ApprovalCardProps {
  approval: ApprovalRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: (status: "approved" | "edited" | "rejected") => void;
  /** When true (mock mode), the resolve POST is skipped and we just close. */
  mock?: boolean;
}

export function ApprovalCard({
  approval,
  open,
  onOpenChange,
  onResolved,
  mock,
}: ApprovalCardProps) {
  const initialDraft = useMemo(
    () => extractDraftFields(approval.proposedAction),
    [approval.proposedAction],
  );

  const [draft, setDraft] = useState<DraftFields>(initialDraft);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<null | "approve" | "edit" | "reject">(
    null,
  );

  useEffect(() => {
    setDraft(initialDraft);
    setNotes("");
    setPending(null);
  }, [initialDraft, approval.id]);

  const blast = BLAST_TONE[approval.blastRadius];
  const artifact = ARTIFACT_TONE[approval.artifactType];
  const BlastIcon = blast.icon;
  const edits = diffDraft(initialDraft, draft);
  const hasEdits = edits !== null;

  const submit = async (status: "approved" | "edited" | "rejected") => {
    setPending(status === "approved" ? "approve" : status === "edited" ? "edit" : "reject");
    try {
      if (!mock) {
        const res = await fetch(`/api/approvals/${approval.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            edits: status === "edited" ? edits ?? undefined : undefined,
            founderNotes: notes.trim() || undefined,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }
      }
      toast.success(
        status === "rejected"
          ? "Rejected — workflow node will fail"
          : status === "edited"
            ? "Sent with your edits"
            : "Approved as drafted",
      );
      onResolved?.(status);
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to resolve approval",
      );
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-2xl gap-0 p-0 sm:max-w-2xl"
      >
        <DialogHeader className="border-b border-border bg-muted/30 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-background p-2 ring-1 ring-border">
              <artifact.icon className="size-4 text-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="flex items-center gap-2 text-base">
                <span className="truncate">Review {artifact.label}</span>
                <Badge
                  className={cn("font-medium", blast.className)}
                  variant="secondary"
                >
                  <BlastIcon />
                  {blast.label}
                </Badge>
              </DialogTitle>
              <DialogDescription className="mt-1 italic text-muted-foreground">
                {approval.reason}
              </DialogDescription>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X />
            </Button>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {approval.artifactType === "OutreachDraft" ? (
            <DraftEditor draft={draft} setDraft={setDraft} />
          ) : approval.artifactType === "ActivationNudge" ? (
            <NudgeEditor draft={draft} setDraft={setDraft} action={approval.proposedAction} />
          ) : approval.artifactType === "CRMUpdate" ? (
            <CRMUpdatePreview action={approval.proposedAction} />
          ) : (
            <FallbackPreview action={approval.proposedAction} />
          )}

          <Separator className="my-5" />

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ClipboardEdit className="size-3" />
              Founder notes
              <span className="ml-auto text-[10px]">
                (anything the team should learn from your edits)
              </span>
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional. e.g. 'we don't open with company size — feels stalker-y'"
              rows={2}
              className="resize-none text-xs"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            {hasEdits ? (
              <span className="inline-flex items-center gap-1.5">
                <Paperclip className="size-3" />
                {edits?.split("###").length ?? 0 - 1} field
                {(edits?.split("###").length ?? 1) - 1 === 1 ? "" : "s"} edited
              </span>
            ) : (
              <span>No edits — will send as drafted</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => submit("rejected")}
              disabled={pending !== null}
            >
              Reject
            </Button>
            {hasEdits ? (
              <Button
                onClick={() => submit("edited")}
                disabled={pending !== null}
              >
                Edit & approve
              </Button>
            ) : (
              <Button
                onClick={() => submit("approved")}
                disabled={pending !== null}
              >
                Approve & send
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
//  Renderers
// ---------------------------------------------------------------------------

function DraftEditor({
  draft,
  setDraft,
}: {
  draft: DraftFields;
  setDraft: (next: DraftFields) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <Mail className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">Gmail draft</span>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          from you@yourcompany.com
        </span>
      </div>
      <div className="grid gap-2 p-3 text-xs">
        <div className="grid grid-cols-[64px_1fr] items-center gap-2">
          <span className="text-muted-foreground">To</span>
          <Input
            value={draft.to ?? ""}
            onChange={(e) => setDraft({ ...draft, to: e.target.value })}
            placeholder="recipient@example.com"
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="grid grid-cols-[64px_1fr] items-center gap-2">
          <span className="text-muted-foreground">Subject</span>
          <Input
            value={draft.subject ?? ""}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
            placeholder="Subject"
            className="h-8 text-xs"
          />
        </div>
        <Textarea
          value={draft.body ?? ""}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          rows={10}
          placeholder="Body…"
          className="resize-none font-mono text-xs leading-5"
        />
      </div>
    </div>
  );
}

function NudgeEditor({
  draft,
  setDraft,
  action,
}: {
  draft: DraftFields;
  setDraft: (next: DraftFields) => void;
  action: Record<string, unknown>;
}) {
  const channel = typeof action.channel === "string" ? action.channel : "email";
  const Icon = channel === "in_app" ? MessageSquare : Mail;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <Icon className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">
          {channel === "in_app" ? "In-app nudge" : "Activation email"}
        </span>
      </div>
      <div className="grid gap-2 p-3 text-xs">
        {channel !== "in_app" ? (
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <span className="text-muted-foreground">Subject</span>
            <Input
              value={draft.subject ?? ""}
              onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        ) : null}
        <Textarea
          value={draft.body ?? ""}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          rows={8}
          className="resize-none font-mono text-xs leading-5"
        />
      </div>
    </div>
  );
}

function CRMUpdatePreview({ action }: { action: Record<string, unknown> }) {
  const entries = Object.entries(action);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-background">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
        <Building2 className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">CRM mutation</span>
      </div>
      <ul className="divide-y divide-border text-xs">
        {entries.map(([k, v]) => (
          <li key={k} className="grid grid-cols-[140px_1fr] gap-3 px-3 py-2">
            <span className="font-mono text-muted-foreground">{k}</span>
            <span className="break-all font-mono">
              {typeof v === "string" ? v : JSON.stringify(v)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FallbackPreview({ action }: { action: Record<string, unknown> }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-background p-3 text-[11px]">
      <code>{JSON.stringify(action, null, 2)}</code>
    </pre>
  );
}
