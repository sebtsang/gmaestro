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
  MessageSquareWarning,
  Paperclip,
  RefreshCw,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

import type {
  ApprovalArtifactType,
  ApprovalRequest,
  BlastRadius,
  ToolkitId,
} from "@/lib/shared/types";
import { ALL_TOOLKIT_IDS } from "@/lib/shared/types";
import {
  getProvidersForArtifact,
  type ProviderAction,
} from "@/lib/dispatch/providers";
import { BlogPagePreview } from "@/lib/ui/components/blog-page-preview";
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
  TopicResearchBrief: { label: "Topic research", icon: Sparkles },
  ContentOutline: { label: "Content outline", icon: ListChecks },
  BlogDraft: { label: "Blog draft", icon: Mail },
  ChannelVariant: { label: "Channel variant", icon: Building2 },
  PublishedArtifact: { label: "Published", icon: Sparkles },
};

// ---------------------------------------------------------------------------
//  Editable state for each artifact type
// ---------------------------------------------------------------------------

export interface DraftFields {
  to?: string;
  subject?: string;
  body?: string;
}

export function extractDraftFields(
  action: Record<string, unknown>,
): DraftFields {
  return {
    to: typeof action.to === "string" ? action.to : undefined,
    subject: typeof action.subject === "string" ? action.subject : undefined,
    body: typeof action.body === "string" ? action.body : undefined,
  };
}

interface LeadContext {
  name?: string;
  email?: string;
  company?: string;
  source?: string;
  rawMessage?: string;
}

function extractLeadContext(
  action: Record<string, unknown>,
): LeadContext | null {
  const ctx = action._leadContext;
  if (!ctx || typeof ctx !== "object") return null;
  const c = ctx as Record<string, unknown>;
  const out: LeadContext = {
    name: typeof c.name === "string" ? c.name : undefined,
    email: typeof c.email === "string" ? c.email : undefined,
    company: typeof c.company === "string" ? c.company : undefined,
    source: typeof c.source === "string" ? c.source : undefined,
    rawMessage: typeof c.rawMessage === "string" ? c.rawMessage : undefined,
  };
  if (
    !out.name &&
    !out.email &&
    !out.company &&
    !out.source &&
    !out.rawMessage
  ) {
    return null;
  }
  return out;
}

function extractRationale(action: Record<string, unknown>): string | null {
  const r = action.rationale;
  return typeof r === "string" && r.trim().length > 0 ? r.trim() : null;
}

interface UpstreamSummary {
  persona: string;
  bullets: string[];
}

function extractUpstreamSummaries(
  action: Record<string, unknown>,
): UpstreamSummary[] {
  const raw = action._upstreamOutputs;
  if (!raw || typeof raw !== "object") return [];
  const map = raw as Record<string, unknown>;
  const out: UpstreamSummary[] = [];
  // Surface only the personas a writer typically references. Each shows the
  // most decision-relevant fields as terse bullets — not the full output.
  const ORDER: Array<{ key: string; label: string; fields: string[] }> = [
    {
      key: "researcher",
      label: "Researcher",
      fields: [
        "companyDomain",
        "companyIndustry",
        "personRole",
        "personSeniority",
        "fundingStage",
      ],
    },
    {
      key: "qualifier",
      label: "Qualifier",
      fields: ["tier", "fitScore", "intentSignals", "disqualifyReasons"],
    },
    {
      key: "strategist",
      label: "Strategist",
      fields: ["tier", "angle", "callToAction", "customHooks", "toneGuide"],
    },
  ];
  for (const { key, label, fields } of ORDER) {
    const v = map[key];
    if (!v || typeof v !== "object") continue;
    const obj = v as Record<string, unknown>;
    if (typeof obj.error === "string") continue;
    const bullets: string[] = [];
    for (const f of fields) {
      const val = obj[f];
      if (val == null) continue;
      if (Array.isArray(val)) {
        if (val.length === 0) continue;
        bullets.push(`${f}: ${val.slice(0, 3).join(", ")}`);
      } else if (typeof val === "object") {
        // skip nested objects — keep summary terse
        continue;
      } else {
        bullets.push(`${f}: ${String(val)}`);
      }
    }
    if (bullets.length > 0) out.push({ persona: label, bullets });
  }
  return out;
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
  /** Toolkits actively connected (reconciled live against Composio at page
   *  load). The picker filters its options to this set. */
  connectedToolkits?: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: (
    status: "approved" | "edited" | "rejected" | "changes_requested",
    notes?: string,
  ) => void;
  /** When true (mock mode), the resolve POST is skipped and we just close. */
  mock?: boolean;
}

type ResolveStatus = "approved" | "edited" | "rejected" | "changes_requested";
type PendingLabel = "approve" | "edit" | "reject" | "changes";

const PENDING_LABEL: Record<ResolveStatus, PendingLabel> = {
  approved: "approve",
  edited: "edit",
  rejected: "reject",
  changes_requested: "changes",
};

const RESOLVE_TOAST: Record<ResolveStatus, string> = {
  approved: "Approved as drafted",
  edited: "Sent with your edits",
  rejected: "Rejected - workflow node will fail",
  changes_requested: "Sent back with your notes",
};

export function ApprovalCard({
  approval,
  connectedToolkits = [],
  open,
  onOpenChange,
  onResolved,
  mock,
}: ApprovalCardProps) {
  const initialDraft = useMemo(
    () => extractDraftFields(approval.proposedAction),
    [approval.proposedAction],
  );

  // Stable join-string of connected toolkits. Using the array directly
  // would re-fire any dependent effects every render because the parent
  // hands us a fresh array each pass.
  const connectedKey = useMemo(
    () => connectedToolkits.map((t) => t.toLowerCase()).sort().join(","),
    [connectedToolkits],
  );

  // Providers the founder can actually dispatch through right now: artifact
  // type's full catalog filtered to toolkits live-connected at page load.
  const availableProviders = useMemo<ProviderAction[]>(() => {
    const all = getProvidersForArtifact(approval.artifactType);
    const connectedSet = new Set(connectedKey ? connectedKey.split(",") : []);
    return all.filter((p) => connectedSet.has(p.toolkit.toLowerCase()));
  }, [approval.artifactType, connectedKey]);

  const [draft, setDraft] = useState<DraftFields>(initialDraft);
  const [notes, setNotes] = useState("");
  const [pending, setPending] = useState<null | PendingLabel>(null);
  // Auto-select the first available provider so the founder doesn't have to
  // click twice when they only have one option (the common case).
  const [selectedProvider, setSelectedProvider] = useState<string | null>(
    () => availableProviders[0]?.toolkit ?? null,
  );
  // For BlogDraft only: which destinations the founder ticked. The dispatcher
  // fans out one ChannelVariant per ticked target.
  const [selectedTargets, setSelectedTargets] = useState<ToolkitId[]>([]);

  useEffect(() => {
    setDraft(initialDraft);
    setNotes("");
    setPending(null);
    // Reset provider + targets when the approval changes. We re-derive the
    // initial values from the stable `connectedKey` rather than depending on
    // `availableProviders` (which is a useMemo that re-renders even when
    // logically unchanged).
    const connectedSet = new Set(connectedKey ? connectedKey.split(",") : []);
    const allProviders = getProvidersForArtifact(approval.artifactType);
    const firstAvailable = allProviders.find((p) =>
      connectedSet.has(p.toolkit.toLowerCase()),
    );
    setSelectedProvider(firstAvailable?.toolkit ?? null);
    const defaultTargets = ALL_TOOLKIT_IDS.filter((t) => connectedSet.has(t));
    setSelectedTargets(defaultTargets);
  }, [initialDraft, approval.id, approval.artifactType, connectedKey]);

  const blast = BLAST_TONE[approval.blastRadius];
  const artifact = ARTIFACT_TONE[approval.artifactType];
  const BlastIcon = blast.icon;
  const edits = diffDraft(initialDraft, draft);
  const hasEdits = edits !== null;
  const hasNotes = notes.trim().length > 0;
  const selectedProviderEntry = availableProviders.find(
    (p) => p.toolkit === selectedProvider,
  );

  const submit = async (status: ResolveStatus) => {
    setPending(PENDING_LABEL[status]);
    try {
      if (!mock) {
        const res = await fetch(`/api/approvals/${approval.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            edits: status === "edited" ? edits ?? undefined : undefined,
            founderNotes: notes.trim() || undefined,
            // Only attach provider on approve/edit — rejection never dispatches.
            provider:
              status !== "rejected" && selectedProvider
                ? selectedProvider
                : undefined,
            // BlogDraft-only: founder's picked publish destinations.
            targets:
              status !== "rejected" &&
              approval.artifactType === "BlogDraft" &&
              selectedTargets.length > 0
                ? selectedTargets
                : undefined,
          }),
        });
        if (!res.ok) {
          const json = await res
            .json()
            .catch(() => ({}) as { dispatchError?: string; error?: string });
          if (res.status === 502) {
            toast.error(
              `${selectedProviderEntry?.label ?? selectedProvider} connection expired — reconnect on Connections.`,
              { duration: 8000 },
            );
            return;
          }
          throw new Error(
            json.dispatchError ?? json.error ?? `HTTP ${res.status}`,
          );
        }
      }
      // Reject + changes_requested always use the static toast (no Composio
      // dispatch). Approve/edit get a provider-aware toast when the founder
      // selected an integration; otherwise fall back to the static "saved
      // locally" message.
      if (status === "rejected" || status === "changes_requested") {
        toast.success(RESOLVE_TOAST[status]);
      } else if (selectedProviderEntry) {
        toast.success(`Sent via ${selectedProviderEntry.label}`);
      } else {
        toast.success(
          status === "edited"
            ? "Approved with your edits (no integration connected — saved locally)"
            : "Approved (no integration connected — saved locally)",
        );
      }
      onResolved?.(status, notes.trim() || undefined);
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
          {approval.founderNotes ? (
            <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-xs dark:border-emerald-400/30 dark:bg-emerald-400/10">
              <RefreshCw className="mt-0.5 size-3.5 shrink-0 text-emerald-700 dark:text-emerald-300" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-emerald-800 dark:text-emerald-200">
                  Revised based on your feedback
                </div>
                <div className="mt-0.5 truncate text-emerald-700/80 dark:text-emerald-300/80">
                  &ldquo;{approval.founderNotes}&rdquo;
                </div>
              </div>
            </div>
          ) : null}
          {approval.artifactType === "BlogDraft" ? (
            <BlogDraftPreview
              action={approval.proposedAction}
              targets={selectedTargets}
              setTargets={setSelectedTargets}
              connectedToolkits={connectedToolkits}
              companyUrl={approval.companyUrl ?? undefined}
            />
          ) : (
            <FallbackPreview
              action={approval.proposedAction}
              artifactType={approval.artifactType}
              companyUrl={approval.companyUrl ?? undefined}
            />
          )}

          <Separator className="my-5" />

          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ClipboardEdit className="size-3" />
              Founder notes
              <span className="ml-auto text-[10px]">
                (feedback for the team — required to request changes)
              </span>
            </label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. 'shorter, drop the company-size opener — feels stalker-y'"
              rows={2}
              className="resize-none text-xs"
            />
          </div>
        </div>

        <ProviderPicker
          providers={availableProviders}
          selected={selectedProvider}
          onSelect={setSelectedProvider}
          artifactType={approval.artifactType}
        />

        <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/30 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[11px] text-muted-foreground">
            {hasEdits ? (
              (() => {
                // edits is a string with "### key\nvalue" sections; the first
                // split chunk is empty so subtract one for the count.
                const editedCount = Math.max(
                  0,
                  (edits?.split("###").length ?? 1) - 1,
                );
                return (
                  <span className="inline-flex items-center gap-1.5">
                    <Paperclip className="size-3" />
                    {editedCount} field{editedCount === 1 ? "" : "s"} edited
                  </span>
                );
              })()
            ) : (
              <span>
                {selectedProviderEntry
                  ? `No edits - will send via ${selectedProviderEntry.label}`
                  : "No edits - will mark approved"}
              </span>
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
            <Tooltip>
              <TooltipTrigger
                disabled={hasNotes}
                render={<span className="inline-block" />}
              >
                <Button
                  variant="outline"
                  onClick={() => submit("changes_requested")}
                  disabled={pending !== null || !hasNotes}
                >
                  <MessageSquareWarning />
                  Request changes
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Add notes below to tell the agent what to change.
              </TooltipContent>
            </Tooltip>
            <Button
              onClick={() => submit(hasEdits ? "edited" : "approved")}
              disabled={pending !== null}
            >
              {selectedProviderEntry
                ? hasEdits
                  ? `Edit & send via ${selectedProviderEntry.label}`
                  : `Approve & send via ${selectedProviderEntry.label}`
                : hasEdits
                  ? "Edit & approve"
                  : "Approve & send"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
//  Renderers
// ---------------------------------------------------------------------------

function ProviderPicker({
  providers,
  selected,
  onSelect,
  artifactType,
}: {
  providers: ProviderAction[];
  selected: string | null;
  onSelect: (toolkit: string | null) => void;
  artifactType: ApprovalArtifactType;
}) {
  // No artifact-relevant providers configured at all (rare — every artifact
  // type in PROVIDERS_BY_ARTIFACT has at least one). Render nothing.
  // Some providers configured but none connected → small "connect to send"
  // hint, no picker.
  if (providers.length === 0) {
    return (
      <div className="border-t border-border bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground">
        No integration connected for {artifactType} — approving will mark this
        locally only. Connect Gmail/Outlook/etc. on the Connections page to
        send automatically.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 border-t border-border bg-muted/20 px-5 py-2.5">
      <span className="text-[11px] font-medium text-muted-foreground">
        Send via
      </span>
      <div className="flex items-center gap-1">
        {providers.map((p) => {
          const active = selected === p.toolkit;
          return (
            <button
              key={p.toolkit}
              type="button"
              onClick={() => onSelect(p.toolkit)}
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                active
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
            >
              {p.label}
            </button>
          );
        })}
        {providers.length > 1 && selected ? (
          <button
            type="button"
            onClick={() => onSelect(null)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
              "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
            title="Mark approved locally only — don't send"
          >
            none
          </button>
        ) : null}
      </div>
    </div>
  );
}

function DraftContext({
  lead,
  rationale,
  upstream,
}: {
  lead: LeadContext | null;
  rationale: string | null;
  upstream: UpstreamSummary[];
}) {
  if (!lead && !rationale && upstream.length === 0) return null;
  return (
    <div className="mb-4 grid gap-3">
      {lead ? (
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <Building2 className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Who this is for</span>
            {lead.source ? (
              <Badge
                variant="secondary"
                className="ml-auto h-5 px-1.5 text-[10px] font-normal"
              >
                {lead.source.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </div>
          <div className="grid gap-1.5 px-3 py-2 text-xs">
            <div className="font-medium">
              {lead.name ?? "Unknown"}
              {lead.company ? (
                <span className="text-muted-foreground">
                  {" "}
                  · {lead.company}
                </span>
              ) : null}
              {lead.email ? (
                <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                  {lead.email}
                </span>
              ) : null}
            </div>
            {lead.rawMessage ? (
              <blockquote className="border-l-2 border-border pl-2 text-[11px] italic leading-relaxed text-muted-foreground">
                {lead.rawMessage}
              </blockquote>
            ) : null}
          </div>
        </div>
      ) : null}

      {rationale || upstream.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2">
            <Sparkles className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Why this draft</span>
          </div>
          <div className="grid gap-2 px-3 py-2 text-xs">
            {rationale ? (
              <p className="leading-relaxed text-foreground/90">{rationale}</p>
            ) : null}
            {upstream.length > 0 ? (
              <ul className="grid gap-1.5 border-t border-border/60 pt-2 text-[11px]">
                {upstream.map((s) => (
                  <li key={s.persona} className="grid gap-0.5">
                    <span className="font-medium text-muted-foreground">
                      {s.persona}
                    </span>
                    <span className="font-mono text-[10.5px] leading-snug text-muted-foreground">
                      {s.bullets.join("  ·  ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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

function FallbackPreview({
  action,
  artifactType,
  companyUrl,
}: {
  action: Record<string, unknown>;
  artifactType: ApprovalArtifactType;
  companyUrl?: string;
}) {
  // Render the artifact as a styled blog page when we can extract a body
  // from common shapes; fall through to a JSON dump only when nothing renders.
  const view = artifactToPageView(action, artifactType);
  if (view) {
    return (
      <BlogPagePreview
        kicker={view.kicker}
        title={view.title}
        excerpt={view.excerpt}
        body={view.body}
        tags={view.tags}
        companyUrl={companyUrl}
        maxHeightClass="max-h-[55vh]"
      />
    );
  }
  return (
    <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-background p-3 text-[11px]">
      <code>{JSON.stringify(action, null, 2)}</code>
    </pre>
  );
}

interface PageView {
  kicker?: string;
  title?: string;
  excerpt?: string;
  body?: string;
  tags?: string[];
}

function artifactToPageView(
  action: Record<string, unknown>,
  artifactType: ApprovalArtifactType,
): PageView | null {
  const str = (k: string): string | undefined =>
    typeof action[k] === "string" ? (action[k] as string) : undefined;
  const arr = (k: string): string[] | undefined => {
    const v = action[k];
    return Array.isArray(v)
      ? (v as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined;
  };

  // Most artifacts surface a body under one of these names.
  const body = str("bodyMarkdown") ?? str("content") ?? str("markdown") ?? str("body");

  if (artifactType === "ContentOutline") {
    // Synthesize a markdown body from the outline shape so the founder can
    // read it as a blog scaffold rather than a JSON spec.
    const sections = action.sections;
    const sectionsMd =
      Array.isArray(sections)
        ? sections
            .map((s) => {
              if (!s || typeof s !== "object") return "";
              const o = s as Record<string, unknown>;
              const heading = typeof o.heading === "string" ? o.heading : typeof o.title === "string" ? o.title : "";
              const summary = typeof o.summary === "string" ? o.summary : typeof o.body === "string" ? o.body : "";
              const bullets = Array.isArray(o.bullets)
                ? (o.bullets as unknown[]).filter((b): b is string => typeof b === "string")
                : [];
              const lines: string[] = [];
              if (heading) lines.push(`## ${heading}`);
              if (summary) lines.push(summary);
              if (bullets.length) lines.push(bullets.map((b) => `- ${b}`).join("\n"));
              return lines.join("\n\n");
            })
            .filter(Boolean)
            .join("\n\n")
        : "";
    return {
      kicker: "Content outline",
      title: str("title"),
      excerpt: str("thesis") ?? str("excerpt"),
      body: sectionsMd || body,
      tags: arr("targetKeywords") ?? arr("tags"),
    };
  }

  if (artifactType === "TopicResearchBrief") {
    const candidates = action.candidates;
    const candidatesMd = Array.isArray(candidates)
      ? candidates
          .map((c, i) => {
            if (!c || typeof c !== "object") return "";
            const o = c as Record<string, unknown>;
            const t = typeof o.title === "string" ? o.title : "";
            const a = typeof o.angle === "string" ? o.angle : "";
            const r = typeof o.rationale === "string" ? o.rationale : "";
            return `### ${i + 1}. ${t}\n\n${a}${r ? `\n\n${r}` : ""}`;
          })
          .filter(Boolean)
          .join("\n\n")
      : "";
    const recommended = action.recommendedTopic;
    const recTitle =
      recommended && typeof recommended === "object"
        ? (typeof (recommended as Record<string, unknown>).title === "string"
            ? ((recommended as Record<string, unknown>).title as string)
            : undefined)
        : undefined;
    return {
      kicker: "Topic research",
      title: recTitle ?? str("topic") ?? str("title"),
      excerpt: str("summary"),
      body: candidatesMd || body,
    };
  }

  if (artifactType === "ChannelVariant") {
    return {
      kicker: typeof action.target === "string" ? `${action.target} variant` : "Channel variant",
      title: str("title") ?? str("subject"),
      body: str("content") ?? body,
    };
  }

  if (body) {
    return {
      kicker: artifactType,
      title: str("title"),
      excerpt: str("excerpt"),
      body,
      tags: arr("tags"),
    };
  }

  return null;
}

const TARGET_LABEL: Record<ToolkitId, string> = {
  github: "GitHub PR (static-site repo)",
  wordpress: "WordPress",
  ghost: "Ghost",
  notion: "Notion",
  reddit: "Reddit",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
};

const TARGET_HINT: Record<ToolkitId, string> = {
  github: "Opens a PR with a markdown file",
  wordpress: "Creates a draft post",
  ghost: "Creates a draft post",
  notion: "Inserts a row into your blog database",
  reddit: "Discussion-flavored self-post",
  linkedin: "Native long-form post",
  twitter: "Single tweet or thread",
};

function BlogDraftPreview({
  action,
  targets,
  setTargets,
  connectedToolkits,
  companyUrl,
}: {
  action: Record<string, unknown>;
  targets: ToolkitId[];
  setTargets: (next: ToolkitId[]) => void;
  connectedToolkits: string[];
  companyUrl?: string;
}) {
  const title = typeof action.title === "string" ? action.title : "(untitled)";
  const excerpt = typeof action.excerpt === "string" ? action.excerpt : "";
  const bodyMarkdown =
    typeof action.bodyMarkdown === "string" ? action.bodyMarkdown : "";
  const tags = Array.isArray(action.tags)
    ? (action.tags as unknown[]).filter((t): t is string => typeof t === "string")
    : [];
  const geoNotes = Array.isArray(action.geoNotes)
    ? (action.geoNotes as unknown[]).filter((t): t is string => typeof t === "string")
    : [];

  const connectedSet = new Set(connectedToolkits.map((t) => t.toLowerCase()));

  const toggleTarget = (t: ToolkitId) => {
    if (targets.includes(t)) {
      setTargets(targets.filter((x) => x !== t));
    } else {
      setTargets([...targets, t]);
    }
  };

  return (
    <div className="space-y-4">
      <BlogPagePreview
        kicker="Blog draft"
        title={title}
        excerpt={excerpt}
        body={bodyMarkdown}
        tags={tags}
        companyUrl={companyUrl}
        maxHeightClass="max-h-[55vh]"
      />

      {geoNotes.length > 0 && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-300">
            <Sparkles className="size-3" />
            GEO-Editor changes
          </div>
          <ul className="ml-4 list-disc space-y-0.5 text-emerald-700/80 dark:text-emerald-300/80">
            {geoNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
          <ListChecks className="size-3.5" />
          Publish to
          <span className="ml-auto text-[10px] font-normal text-muted-foreground">
            (one approval, fans out to N channels)
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_TOOLKIT_IDS.map((t) => {
            const isConnected = connectedSet.has(t);
            const isChecked = targets.includes(t);
            return (
              <label
                key={t}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-xs transition",
                  isChecked
                    ? "border-foreground bg-muted"
                    : "border-border bg-background hover:bg-muted/40",
                  !isConnected && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  disabled={!isConnected}
                  onChange={() => toggleTarget(t)}
                  className="mt-0.5 size-3.5 cursor-pointer accent-foreground disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 font-medium leading-none">
                    <span className="truncate">{TARGET_LABEL[t]}</span>
                    {!isConnected && (
                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                        not connected
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {TARGET_HINT[t]}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
        {targets.length === 0 && (
          <p className="mt-2 text-[11px] italic text-muted-foreground">
            Approve with no targets ticked to mark the draft approved without
            publishing anywhere.
          </p>
        )}
      </div>
    </div>
  );
}
