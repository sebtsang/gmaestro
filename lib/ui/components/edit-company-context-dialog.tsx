"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  CompanyContextInputSchema,
  GtmMetricSchema,
  IcpPrioritySchema,
} from "@/lib/shared/schemas";
import type {
  CompanyContext,
  GtmMetric,
  GtmObjective,
  ICPProfile,
  IcpPriority,
} from "@/lib/shared/types";

const METRIC_LABEL: Record<GtmMetric, string> = {
  demos_booked: "Demos booked",
  qualified_hot_leads: "Qualified hot leads",
  outreach_sent: "Outreach sent",
};

interface EditCompanyContextDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: CompanyContext | null;
  onSave: (
    next: Omit<CompanyContext, "userId" | "updatedAt">,
  ) => Promise<void>;
}

interface FormState {
  companyOverview: string;
  keyFacts: string[];
  icps: ICPProfile[];
  gtmObjectives: GtmObjective[];
}

function makeEmptyIcp(): ICPProfile {
  return {
    name: "",
    priority: "warm",
    description: "",
    industry: [],
    companySizeRange: "",
    seniority: [],
  };
}

// Year computed lazily so a long-lived tab proposes "Q1 of right now"
// rather than whenever the module loaded.
function makeEmptyObjective(): GtmObjective {
  return {
    metric: "demos_booked",
    target: 50,
    label: "Q1 demos booked",
    since: new Date(new Date().getFullYear(), 0, 1).toISOString(),
  };
}

function seedForm(initial: CompanyContext | null): FormState {
  if (initial) {
    return {
      companyOverview: initial.companyOverview,
      keyFacts: [...initial.keyFacts],
      icps: initial.icps.map((i) => ({
        ...i,
        industry: [...i.industry],
        seniority: [...i.seniority],
      })),
      gtmObjectives: initial.gtmObjectives.map((o) => ({ ...o })),
    };
  }
  return {
    companyOverview: "",
    keyFacts: [],
    icps: [makeEmptyIcp()],
    gtmObjectives: [makeEmptyObjective()],
  };
}

export function EditCompanyContextDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: EditCompanyContextDialogProps) {
  const [form, setForm] = useState<FormState>(() => seedForm(initial));
  const [keyFactDraft, setKeyFactDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(seedForm(initial));
      setKeyFactDraft("");
      setError(null);
    }
  }, [open, initial]);

  const validation = useMemo(() => {
    return CompanyContextInputSchema.safeParse({
      companyOverview: form.companyOverview,
      keyFacts: form.keyFacts,
      icps: form.icps,
      gtmObjectives: form.gtmObjectives,
    });
  }, [form]);

  const addKeyFact = () => {
    const trimmed = keyFactDraft.trim();
    if (!trimmed) return;
    setForm((f) => ({ ...f, keyFacts: [...f.keyFacts, trimmed] }));
    setKeyFactDraft("");
  };

  const removeKeyFact = (idx: number) => {
    setForm((f) => ({
      ...f,
      keyFacts: f.keyFacts.filter((_, i) => i !== idx),
    }));
  };

  const updateIcp = (idx: number, patch: Partial<ICPProfile>) => {
    setForm((f) => ({
      ...f,
      icps: f.icps.map((icp, i) => (i === idx ? { ...icp, ...patch } : icp)),
    }));
  };

  const addIcp = () =>
    setForm((f) => ({ ...f, icps: [...f.icps, makeEmptyIcp()] }));

  const removeIcp = (idx: number) =>
    setForm((f) => ({
      ...f,
      icps: f.icps.filter((_, i) => i !== idx),
    }));

  const updateObjective = (idx: number, patch: Partial<GtmObjective>) => {
    setForm((f) => ({
      ...f,
      gtmObjectives: f.gtmObjectives.map((o, i) =>
        i === idx ? { ...o, ...patch } : o,
      ),
    }));
  };

  const addObjective = () =>
    setForm((f) => ({
      ...f,
      gtmObjectives: [...f.gtmObjectives, makeEmptyObjective()],
    }));

  const removeObjective = (idx: number) =>
    setForm((f) => ({
      ...f,
      gtmObjectives: f.gtmObjectives.filter((_, i) => i !== idx),
    }));

  const handleSave = async () => {
    if (!validation.success) {
      setError(
        validation.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("\n"),
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(validation.data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Company context</DialogTitle>
          <DialogDescription>
            Anchor your agents to who you are, who you target, and what
            you&apos;re going after this period.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="company" className="gap-4">
          <TabsList>
            <TabsTrigger value="company">Company</TabsTrigger>
            <TabsTrigger value="icps">ICPs ({form.icps.length})</TabsTrigger>
            <TabsTrigger value="goals">
              GTM goals ({form.gtmObjectives.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="company" className="grid gap-4">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium" htmlFor="company-overview">
                Company overview
              </label>
              <Textarea
                id="company-overview"
                value={form.companyOverview}
                onChange={(e) =>
                  setForm((f) => ({ ...f, companyOverview: e.target.value }))
                }
                placeholder="What you do, who you help, why you exist."
                rows={3}
              />
            </div>

            <div className="grid gap-1.5">
              <label className="text-xs font-medium">Key facts</label>
              <div className="flex gap-2">
                <Input
                  value={keyFactDraft}
                  onChange={(e) => setKeyFactDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addKeyFact();
                    }
                  }}
                  placeholder="e.g. YC W26"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addKeyFact}
                >
                  Add
                </Button>
              </div>
              {form.keyFacts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {form.keyFacts.map((fact, idx) => (
                    <button
                      key={`${fact}-${idx}`}
                      type="button"
                      onClick={() => removeKeyFact(idx)}
                      className="group/keyfact"
                      title="Click to remove"
                    >
                      <Badge variant="secondary" className="text-[11px]">
                        {fact}
                        <span className="ml-1 opacity-50 group-hover/keyfact:opacity-100">
                          ×
                        </span>
                      </Badge>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="icps" className="grid gap-3">
            {form.icps.map((icp, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    ICP #{idx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeIcp(idx)}
                    className="h-6 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input
                    value={icp.name}
                    onChange={(e) =>
                      updateIcp(idx, { name: e.target.value })
                    }
                    placeholder="ICP name (e.g. B2B SaaS pre-Series A)"
                  />
                  <select
                    value={icp.priority}
                    onChange={(e) =>
                      updateIcp(idx, {
                        priority: e.target.value as IcpPriority,
                      })
                    }
                    className="rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {IcpPrioritySchema.options.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  value={icp.description}
                  onChange={(e) =>
                    updateIcp(idx, { description: e.target.value })
                  }
                  placeholder="One-line description"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={icp.industry.join(", ")}
                    onChange={(e) =>
                      updateIcp(idx, {
                        industry: splitTags(e.target.value),
                      })
                    }
                    placeholder="Industries (comma-separated)"
                  />
                  <Input
                    value={icp.companySizeRange ?? ""}
                    onChange={(e) =>
                      updateIcp(idx, {
                        companySizeRange: e.target.value || undefined,
                      })
                    }
                    placeholder="Company size (e.g. 5-30)"
                  />
                </div>
                <Input
                  value={icp.seniority.join(", ")}
                  onChange={(e) =>
                    updateIcp(idx, {
                      seniority: splitTags(e.target.value),
                    })
                  }
                  placeholder="Seniority targets (e.g. Founder, CEO)"
                />
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addIcp}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Add ICP
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="goals" className="grid gap-3">
            {form.gtmObjectives.map((obj, idx) => (
              <div
                key={idx}
                className="grid gap-2 rounded-lg border border-border bg-muted/20 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Goal #{idx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeObjective(idx)}
                    className="h-6 gap-1 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3" />
                    Remove
                  </Button>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto] gap-2">
                  <Input
                    value={obj.label}
                    onChange={(e) =>
                      updateObjective(idx, { label: e.target.value })
                    }
                    placeholder="Goal label (e.g. Q1 demos booked)"
                  />
                  <select
                    value={obj.metric}
                    onChange={(e) =>
                      updateObjective(idx, {
                        metric: e.target.value as GtmMetric,
                      })
                    }
                    className="rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {GtmMetricSchema.options.map((m) => (
                      <option key={m} value={m}>
                        {METRIC_LABEL[m]}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    min="1"
                    value={obj.target}
                    onChange={(e) =>
                      updateObjective(idx, {
                        target: Number.parseInt(e.target.value, 10) || 1,
                      })
                    }
                    className="w-24"
                  />
                </div>
                <Input
                  type="datetime-local"
                  value={obj.since ? toLocalInput(obj.since) : ""}
                  onChange={(e) =>
                    updateObjective(idx, {
                      since: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : undefined,
                    })
                  }
                />
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addObjective}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Add goal
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive whitespace-pre-line">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !validation.success}
          >
            {saving ? "Saving…" : "Save context"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function splitTags(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
