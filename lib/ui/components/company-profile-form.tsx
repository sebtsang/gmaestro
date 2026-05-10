"use client";

import { useState, useTransition } from "react";
import { Globe2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  COMPANY_PROFILE_FIELDS,
  COMPANY_PROFILE_FIELD_ORDER,
  PERSONAS_BY_FIELD,
  REQUIRED_COMPANY_PROFILE_FIELDS,
  formatMissingFieldsList,
  type CompanyProfileFieldKey,
  type CompanyProfileFieldMeta,
} from "@/lib/shared/company-profile-meta";
import type { CompanyProfile, PersonaId } from "@/lib/shared/types";
import { PERSONA_LABEL } from "@/lib/ui/persona-meta";
import { cn } from "@/lib/utils";

interface ScrapeDraft {
  companyName?: string | null;
  oneLiner?: string | null;
  productDescription?: string | null;
  icp?: string | null;
  positioning?: string | null;
  voiceTone?: string | null;
  valueProps?: string[] | null;
  competitors?: string[] | null;
  sourceUrl?: string | null;
}

type FormState = Record<CompanyProfileFieldKey, string>;

function profileToForm(profile: CompanyProfile | null): FormState {
  return {
    companyName: profile?.companyName ?? "",
    oneLiner: profile?.oneLiner ?? "",
    productDescription: profile?.productDescription ?? "",
    icp: profile?.icp ?? "",
    positioning: profile?.positioning ?? "",
    voiceTone: profile?.voiceTone ?? "",
    valueProps: (profile?.valueProps ?? []).join("\n"),
    competitors: (profile?.competitors ?? []).join(", "),
    sourceUrl: profile?.sourceUrl ?? "",
  };
}

function parseTagsByLine(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter((x) => x.length > 0);
}

function parseTagsByComma(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter((x) => x.length > 0);
}

function tagsForField(meta: CompanyProfileFieldMeta, raw: string): string[] {
  return meta.kind === "tagsByLine" ? parseTagsByLine(raw) : parseTagsByComma(raw);
}

interface FieldValidation {
  /** Issues to display under the field. Empty means valid. */
  issues: string[];
  /** Length / count to show in counters when relevant. */
  count?: number;
}

function validateField(meta: CompanyProfileFieldMeta, raw: string): FieldValidation {
  const issues: string[] = [];
  if (meta.kind === "tagsByLine" || meta.kind === "tagsByComma") {
    const tags = tagsForField(meta, raw);
    if (meta.maxItems != null && tags.length > meta.maxItems) {
      issues.push(`Up to ${meta.maxItems} items (you have ${tags.length}).`);
    }
    if (meta.maxItemLength != null) {
      const tooLong = tags.filter((t) => t.length > meta.maxItemLength!);
      if (tooLong.length > 0) {
        issues.push(
          `${tooLong.length === 1 ? "One item exceeds" : `${tooLong.length} items exceed`} ${meta.maxItemLength} chars.`,
        );
      }
    }
    return { issues, count: tags.length };
  }
  if (meta.maxLength != null && raw.length > meta.maxLength) {
    issues.push(`Over ${meta.maxLength}-char limit (${raw.length}).`);
  }
  return { issues, count: raw.length };
}

function formToPayload(form: FormState) {
  const trim = (s: string) => (s.trim().length === 0 ? null : s.trim());
  const tagsLine = (s: string) => {
    const arr = parseTagsByLine(s);
    return arr.length > 0 ? arr : null;
  };
  const tagsComma = (s: string) => {
    const arr = parseTagsByComma(s);
    return arr.length > 0 ? arr : null;
  };
  return {
    companyName: trim(form.companyName),
    oneLiner: trim(form.oneLiner),
    productDescription: trim(form.productDescription),
    icp: trim(form.icp),
    positioning: trim(form.positioning),
    voiceTone: trim(form.voiceTone),
    valueProps: tagsLine(form.valueProps),
    competitors: tagsComma(form.competitors),
    sourceUrl: trim(form.sourceUrl),
  };
}

function isFieldEmpty(meta: CompanyProfileFieldMeta, raw: string): boolean {
  if (meta.kind === "tagsByLine" || meta.kind === "tagsByComma") {
    return tagsForField(meta, raw).length === 0;
  }
  return raw.trim().length === 0;
}

interface CompanyProfileFormProps {
  initialProfile: CompanyProfile | null;
  /** URL captured by the setup wizard. Used as the scrape default when the
   *  saved profile has no sourceUrl yet. */
  setupUrl?: string | null;
}

export function CompanyProfileForm({
  initialProfile,
  setupUrl,
}: CompanyProfileFormProps) {
  const [form, setForm] = useState<FormState>(profileToForm(initialProfile));
  const [scrapeUrl, setScrapeUrl] = useState(
    initialProfile?.sourceUrl ?? setupUrl ?? "",
  );
  const [isScraping, setIsScraping] = useState(false);
  const [savePending, startSave] = useTransition();

  const set = (key: CompanyProfileFieldKey) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const missingRequired = REQUIRED_COMPANY_PROFILE_FIELDS.filter((k) =>
    isFieldEmpty(COMPANY_PROFILE_FIELDS[k], form[k]),
  );
  const hasValidationIssues = COMPANY_PROFILE_FIELD_ORDER.some(
    (k) => validateField(COMPANY_PROFILE_FIELDS[k], form[k]).issues.length > 0,
  );

  const handleScrape = async () => {
    const url = scrapeUrl.trim();
    if (!url) {
      toast.error("Enter a URL first");
      return;
    }
    setIsScraping(true);
    try {
      const res = await fetch("/api/company-profile/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const { draft } = (await res.json()) as { draft: ScrapeDraft };
      setForm((prev) => ({
        companyName: draft.companyName ?? prev.companyName,
        oneLiner: draft.oneLiner ?? prev.oneLiner,
        productDescription: draft.productDescription ?? prev.productDescription,
        icp: draft.icp ?? prev.icp,
        positioning: draft.positioning ?? prev.positioning,
        voiceTone: draft.voiceTone ?? prev.voiceTone,
        valueProps: draft.valueProps?.length
          ? draft.valueProps.join("\n")
          : prev.valueProps,
        competitors: draft.competitors?.length
          ? draft.competitors.join(", ")
          : prev.competitors,
        sourceUrl: draft.sourceUrl ?? prev.sourceUrl ?? url,
      }));
      toast.success("Auto-filled from website. Review and save.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auto-fill failed");
    } finally {
      setIsScraping(false);
    }
  };

  const handleSave = () => {
    startSave(async () => {
      try {
        const res = await fetch("/api/company-profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formToPayload(form)),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (missingRequired.length === 0) {
          toast.success("Profile saved. Workflows can now run.");
        } else {
          toast.success(
            `Saved. Still missing: ${formatMissingFieldsList(missingRequired)}.`,
          );
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  return (
    <div className="grid gap-6">
      {missingRequired.length > 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <strong className="font-medium">Profile incomplete.</strong>{" "}
          Workflow runs are blocked until these fields are filled:{" "}
          <span className="font-medium">
            {formatMissingFieldsList(missingRequired)}
          </span>
          .
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
          Profile complete — workflow runs will reference these fields.
        </div>
      )}

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Globe2 className="size-4" />
          Auto-fill from website
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Paste your homepage URL — we&rsquo;ll fetch a few pages and have an LLM
          draft each field for you to review. Manual entry below works too.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="url"
            placeholder="https://yourcompany.com"
            value={scrapeUrl}
            onChange={(e) => setScrapeUrl(e.target.value)}
            className="max-w-md"
            disabled={isScraping}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleScrape}
            disabled={isScraping || !scrapeUrl.trim()}
          >
            {isScraping ? (
              <>
                <Loader2 className="animate-spin" />
                Scraping…
              </>
            ) : (
              <>
                <Globe2 />
                Auto-fill
              </>
            )}
          </Button>
        </div>
      </section>

      {COMPANY_PROFILE_FIELD_ORDER.map((key) => {
        const meta = COMPANY_PROFILE_FIELDS[key];
        const value = form[key];
        const validation = validateField(meta, value);
        const empty = isFieldEmpty(meta, value);
        const personas = PERSONAS_BY_FIELD[key] ?? [];
        return (
          <FieldRow
            key={key}
            meta={meta}
            value={value}
            onChange={set(key)}
            validation={validation}
            empty={empty}
            personas={personas}
          />
        );
      })}

      <div className="flex items-center justify-end gap-3">
        {hasValidationIssues && (
          <span className="text-xs text-amber-700 dark:text-amber-300">
            Fix the highlighted fields before saving.
          </span>
        )}
        <Button onClick={handleSave} disabled={savePending || hasValidationIssues}>
          {savePending ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save />
              Save profile
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

interface FieldRowProps {
  meta: CompanyProfileFieldMeta;
  value: string;
  onChange: (next: string) => void;
  validation: FieldValidation;
  empty: boolean;
  personas: ReadonlyArray<PersonaId>;
}

function FieldRow({
  meta,
  value,
  onChange,
  validation,
  empty,
  personas,
}: FieldRowProps) {
  const hasIssues = validation.issues.length > 0;
  const counterText = formatCounter(meta, validation);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={`field-${meta.key}`} className="text-xs font-medium">
          {meta.label}
        </label>
        {meta.required && (
          <span
            className={cn(
              "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase",
              empty
                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
            )}
          >
            required
          </span>
        )}
        {personas.length > 0 && (
          <span className="ml-auto inline-flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
            <span className="font-medium uppercase tracking-wide">Read by</span>
            {personas.slice(0, 4).map((p) => (
              <Badge
                key={p}
                variant="secondary"
                className="text-[10px] font-normal"
              >
                {PERSONA_LABEL[p]}
              </Badge>
            ))}
            {personas.length > 4 && (
              <span className="text-muted-foreground/60">
                +{personas.length - 4}
              </span>
            )}
          </span>
        )}
      </div>
      {meta.description && (
        <p className="text-[11px] text-muted-foreground">{meta.description}</p>
      )}
      {meta.kind === "textarea" || meta.kind === "tagsByLine" ? (
        <Textarea
          id={`field-${meta.key}`}
          rows={meta.kind === "tagsByLine" ? 4 : 5}
          placeholder={meta.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(hasIssues && "border-amber-500/60 focus-visible:ring-amber-500/30")}
        />
      ) : (
        <Input
          id={`field-${meta.key}`}
          type={meta.kind === "url" ? "url" : "text"}
          placeholder={meta.placeholder}
          value={value}
          maxLength={meta.maxLength}
          onChange={(e) => onChange(e.target.value)}
          className={cn(hasIssues && "border-amber-500/60 focus-visible:ring-amber-500/30")}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] text-amber-700 dark:text-amber-300">
          {validation.issues.join(" ")}
        </div>
        {counterText && (
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/70">
            {counterText}
          </span>
        )}
      </div>
    </div>
  );
}

function formatCounter(
  meta: CompanyProfileFieldMeta,
  validation: FieldValidation,
): string | null {
  if (meta.kind === "tagsByLine" || meta.kind === "tagsByComma") {
    if (meta.maxItems == null) return null;
    return `${validation.count ?? 0}/${meta.maxItems}`;
  }
  if (meta.maxLength == null) return null;
  return `${validation.count ?? 0}/${meta.maxLength}`;
}
