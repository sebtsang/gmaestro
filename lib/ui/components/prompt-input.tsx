"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";

const PRIMARY_DEMO_PROMPT =
  "I'm a YC W26 founder. 47 demo requests came in this week from our HN launch. I have 3 hours before cofounder offsite. Process them.";

interface PromptInputProps {
  onRunStarted: (runId: string, prompt: string) => void;
}

export function PromptInput({ onRunStarted }: PromptInputProps) {
  const [value, setValue] = useState(PRIMARY_DEMO_PROMPT);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!value.trim()) {
      toast.error("Prompt can't be empty");
      return;
    }

    startTransition(async () => {
      try {
        if (MOCK_MODE) {
          // Mock-mode: synthesize a run id locally and let the mock driver
          // replay the SSE script. POST /api/runs is Session 1's territory.
          const runId = `mock-run-${Date.now().toString(36)}`;
          onRunStarted(runId, value);
          toast.success("Mock run dispatched");
          return;
        }

        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: value }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }

        const data = (await res.json()) as { id?: string; runId?: string };
        const runId = data.id ?? data.runId;
        if (!runId) throw new Error("Run created but no id returned");
        onRunStarted(runId, value);
        toast.success("Run started");
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to start run",
        );
      }
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">What should the team do?</div>
        {MOCK_MODE ? (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
            MOCK MODE
          </span>
        ) : null}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={3}
        placeholder="e.g. Process the 47 demo requests from this week's HN launch."
        className="resize-none font-mono text-xs leading-5"
      />
      <div className="flex justify-end">
        <Button onClick={submit} disabled={pending}>
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
