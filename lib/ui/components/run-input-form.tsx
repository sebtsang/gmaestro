"use client";

import { useState, useTransition } from "react";
import { FileText, Globe, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import { saveMockRun } from "@/lib/ui/hooks/use-mock-active-run";
import { injectSharedEvent } from "@/lib/ui/hooks/use-shared-events";
import {
  ALL_DESTINATIONS,
  type Destination,
} from "@/lib/shared/types";
import { cn } from "@/lib/utils";

interface RunInputFormProps {
  /**
   * Called immediately after a new run is created (mock or real). Receives
   * the run id + a human-readable summary so the caller can hydrate its
   * run-list state without waiting for the first SSE event.
   */
  onRunStarted: (runId: string, summary: string) => void;
}

const DESTINATION_META: Record<
  Destination,
  { label: string; hint: string }
> = {
  "blog-html": {
    label: "Blog (HTML)",
    hint: "~1,000 word post → GitHub PR or CMS",
  },
  reddit: {
    label: "Reddit thread",
    hint: "Discussion-flavored post (~250 words) for r/programming, r/devtools, etc.",
  },
  "x-thread": {
    label: "X thread",
    hint: "5–10 tweet thread, claim-with-number hook",
  },
};

export function RunInputForm({ onRunStarted }: RunInputFormProps) {
  const [companyUrl, setCompanyUrl] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [destination, setDestination] = useState<Destination>("blog-html");
  const [pending, startTransition] = useTransition();

  const cTrim = companyUrl.trim();
  const dTrim = docsUrl.trim();

  const looksLikeUrl = (v: string): boolean => {
    if (!v) return false;
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  };

  const isReady = looksLikeUrl(cTrim) && looksLikeUrl(dTrim) && !pending;

  const submit = () => {
    if (!looksLikeUrl(cTrim)) {
      toast.error("Company URL doesn't look like a valid URL");
      return;
    }
    if (!looksLikeUrl(dTrim)) {
      toast.error("Docs URL doesn't look like a valid URL");
      return;
    }

    const summary = `Blog from ${truncateUrl(dTrim)} → ${DESTINATION_META[destination].label}`;

    startTransition(async () => {
      try {
        if (MOCK_MODE) {
          const runId = `mock-run-${Date.now().toString(36)}`;
          const startedAt = new Date().toISOString();
          saveMockRun({ id: runId, prompt: summary, startedAt });
          injectSharedEvent({
            type: "workflow_started",
            payload: { workflowRunId: runId, prompt: summary, startedAt },
          });
          onRunStarted(runId, summary);
          toast.success("Mock run dispatched");
          return;
        }

        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyUrl: cTrim,
            docsUrl: dTrim,
            destination,
          }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }

        const { workflowRunId } = (await res.json()) as { workflowRunId?: string };
        if (!workflowRunId) throw new Error("Run created but no id returned");
        onRunStarted(workflowRunId, summary);
        toast.success("Run started");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to start run",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">
          Point us at your docs. We'll write the blog version.
        </div>
        {MOCK_MODE ? (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
            MOCK MODE
          </span>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <label htmlFor="company-url" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <Globe className="size-3" />
            Company website
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              we read your homepage + recent posts to match your voice
            </span>
          </label>
          <Input
            id="company-url"
            type="url"
            value={companyUrl}
            onChange={(e) => setCompanyUrl(e.target.value)}
            placeholder="https://anvil.co"
            className="font-mono text-xs"
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="docs-url" className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            <FileText className="size-3" />
            Technical doc URL
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              the page or markdown the blog is about
            </span>
          </label>
          <Input
            id="docs-url"
            type="url"
            value={docsUrl}
            onChange={(e) => setDocsUrl(e.target.value)}
            placeholder="https://docs.anvil.co/v2.3/auth"
            className="font-mono text-xs"
          />
        </div>

        <div className="grid gap-1.5">
          <label className="flex items-center gap-1.5 text-xs font-medium text-foreground">
            Destination
            <span className="ml-auto text-[10px] font-normal text-muted-foreground">
              where the post lands
            </span>
          </label>
          <div className="grid grid-cols-3 gap-2">
            {ALL_DESTINATIONS.map((d) => {
              const meta = DESTINATION_META[d];
              const selected = destination === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDestination(d)}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left text-xs transition",
                    selected
                      ? "border-foreground bg-muted"
                      : "border-border bg-background hover:bg-muted/40",
                  )}
                >
                  <span className="font-medium leading-none">{meta.label}</span>
                  <span className="text-[10px] leading-tight text-muted-foreground">
                    {meta.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={submit}
          disabled={!isReady}
          className="cursor-pointer hover:bg-primary/80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {pending ? (
            <>
              <Loader2 className="animate-spin" />
              Starting…
            </>
          ) : (
            <>
              <Send />
              Run
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function truncateUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname;
    const full = u.host + path;
    return full.length > 40 ? full.slice(0, 40) + "…" : full;
  } catch {
    return url.slice(0, 40);
  }
}
