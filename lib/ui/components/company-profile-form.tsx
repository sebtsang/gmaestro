"use client";

import { useState, useTransition } from "react";
import { Globe2, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { CompanyProfile } from "@/lib/shared/types";
import { REQUIRED_COMPANY_PROFILE_FIELDS } from "@/lib/shared/types";

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

interface FormState {
  companyName: string;
  oneLiner: string;
  productDescription: string;
  icp: string;
  positioning: string;
  voiceTone: string;
  valueProps: string;
  competitors: string;
  sourceUrl: string;
}

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

function formToPayload(form: FormState) {
  const trim = (s: string) => (s.trim().length === 0 ? null : s.trim());
  const lines = (s: string) =>
    s
      .split("\n")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  const csv = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);
  return {
    companyName: trim(form.companyName),
    oneLiner: trim(form.oneLiner),
    productDescription: trim(form.productDescription),
    icp: trim(form.icp),
    positioning: trim(form.positioning),
    voiceTone: trim(form.voiceTone),
    valueProps: lines(form.valueProps).length > 0 ? lines(form.valueProps) : null,
    competitors: csv(form.competitors).length > 0 ? csv(form.competitors) : null,
    sourceUrl: trim(form.sourceUrl),
  };
}

interface CompanyProfileFormProps {
  initialProfile: CompanyProfile | null;
  /** URL captured by the setup wizard. Used as the scrape default when the
   *  saved profile has no sourceUrl yet — first-time founders see their URL
   *  pre-filled and can click Auto-fill straight away. */
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

  const set = (key: keyof FormState) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isFieldEmpty = (key: keyof CompanyProfile) => {
    if (key === "valueProps") return form.valueProps.trim().length === 0;
    if (key === "competitors") return form.competitors.trim().length === 0;
    const v = form[key as keyof FormState];
    return typeof v === "string" && v.trim().length === 0;
  };

  const missingRequired = REQUIRED_COMPANY_PROFILE_FIELDS.filter((k) =>
    isFieldEmpty(k),
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
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
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
      toast.error(
        err instanceof Error ? err.message : "Auto-fill failed",
      );
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
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        toast.success(
          missingRequired.length === 0
            ? "Profile saved. Workflows can now run."
            : `Saved (${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} still empty).`,
        );
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
          {missingRequired.join(", ")}.
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
          Paste your homepage URL — we&rsquo;ll fetch a few pages and have an LLM draft each
          field for you to review. Manual entry below works too.
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

      <FieldRow
        label="Company name"
        required
        empty={isFieldEmpty("companyName")}
      >
        <Input
          placeholder="Anvil"
          value={form.companyName}
          onChange={(e) => set("companyName")(e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label="One-liner"
        hint="≤140 chars. The plain-English summary you'd give in an elevator."
        required
        empty={isFieldEmpty("oneLiner")}
      >
        <Input
          placeholder="Analytics for hardware engineers shipping firmware-heavy products."
          value={form.oneLiner}
          onChange={(e) => set("oneLiner")(e.target.value)}
          maxLength={140}
        />
      </FieldRow>

      <FieldRow
        label="What the product does"
        hint="Markdown ok. What it actually does, who it's for, key capabilities. Personas reference this when reasoning about your product."
        required
        empty={isFieldEmpty("productDescription")}
      >
        <Textarea
          rows={6}
          placeholder="Anvil records every firmware build's runtime telemetry and lets engineers diff two builds in 90 seconds…"
          value={form.productDescription}
          onChange={(e) => set("productDescription")(e.target.value)}
          maxLength={4000}
        />
      </FieldRow>

      <FieldRow
        label="ICP (ideal customer)"
        hint="Markdown ok. Who buys, what makes them a fit. The Qualifier scores leads against this."
        required
        empty={isFieldEmpty("icp")}
      >
        <Textarea
          rows={5}
          placeholder="Hardware companies 20–500 employees shipping connected products. Buyer is the firmware-engineering lead or VP Engineering. Strong fit signals: previous incidents traced to firmware regressions, multiple production builds per week."
          value={form.icp}
          onChange={(e) => set("icp")(e.target.value)}
          maxLength={2000}
        />
      </FieldRow>

      <FieldRow
        label="Positioning"
        hint='&ldquo;We are X for Y, unlike Z.&rdquo; The Strategist references this when picking angles.'
      >
        <Textarea
          rows={4}
          placeholder="We're the only telemetry tool that diffs runtime behavior between firmware builds — Datadog and Sentry both stop at the cloud edge."
          value={form.positioning}
          onChange={(e) => set("positioning")(e.target.value)}
          maxLength={2000}
        />
      </FieldRow>

      <FieldRow
        label="Voice / tone"
        hint="How you sound in writing. The Writer pairs this with your voice samples when drafting outreach."
      >
        <Textarea
          rows={3}
          placeholder="Direct, technically literate, no hype words. Lowercase-first headers. We sign off as the founder, not 'the team'."
          value={form.voiceTone}
          onChange={(e) => set("voiceTone")(e.target.value)}
          maxLength={1000}
        />
      </FieldRow>

      <FieldRow
        label="Value props"
        hint="One per line. Up to 8."
      >
        <Textarea
          rows={4}
          placeholder={"90-second build-vs-build runtime diff\nNo SDK install on devices in the field\nWorks alongside existing Datadog/Sentry pipes"}
          value={form.valueProps}
          onChange={(e) => set("valueProps")(e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label="Competitors"
        hint="Comma-separated. Names of products you're commonly compared against."
      >
        <Input
          placeholder="Datadog, Sentry, New Relic"
          value={form.competitors}
          onChange={(e) => set("competitors")(e.target.value)}
        />
      </FieldRow>

      <FieldRow
        label="Website URL (source)"
        hint="Stored alongside the profile so 'Auto-fill from website' has a default next time."
      >
        <Input
          type="url"
          placeholder="https://yourcompany.com"
          value={form.sourceUrl}
          onChange={(e) => set("sourceUrl")(e.target.value)}
        />
      </FieldRow>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={savePending}>
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
  label: string;
  hint?: string;
  required?: boolean;
  empty?: boolean;
  children: React.ReactNode;
}

function FieldRow({ label, hint, required, empty, children }: FieldRowProps) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium">{label}</label>
        {required ? (
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
        ) : null}
      </div>
      {hint ? (
        <p
          className="text-[11px] text-muted-foreground"
          dangerouslySetInnerHTML={{ __html: hint }}
        />
      ) : null}
      {children}
    </div>
  );
}
