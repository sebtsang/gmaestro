"use client";

import { useState, useTransition } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";

interface PromptInputProps {
  onRunStarted: (runId: string, prompt: string) => void;
}

export function PromptInput({ onRunStarted }: PromptInputProps) {
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const trimmed = value.trim();
  const isReady = !!trimmed && !pending;

  const submit = () => {
    if (!trimmed) {
      toast.error("Prompt can't be empty");
      return;
    }

    startTransition(async () => {
      try {
        if (MOCK_MODE) {
          const runId = `mock-run-${Date.now().toString(36)}`;
          onRunStarted(runId, trimmed);
          toast.success("Mock run dispatched");
          return;
        }

        const res = await fetch("/api/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: trimmed }),
        });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(text || `HTTP ${res.status}`);
        }

        const { workflowRunId } = (await res.json()) as { workflowRunId?: string };
        if (!workflowRunId) throw new Error("Run created but no id returned");
        onRunStarted(workflowRunId, trimmed);
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
        <div className="text-sm font-medium text-muted-foreground">Describe a task and hit Run — the team handles the rest.</div>
        {MOCK_MODE ? (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300">
            MOCK MODE
          </span>
        ) : null}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (isReady) submit();
          }
        }}
        rows={3}
        placeholder="What's on your plate today? (Enter to run, Shift+Enter for newline)"
        className="resize-none font-mono text-xs leading-5"
      />
      <div className="flex justify-end">
        <Tooltip>
          {/* span wrapper: shadcn Button has `disabled:pointer-events-none`,
              so the trigger needs to be a non-button element to receive hover
              when the button itself is disabled. `disabled={isReady}` here
              suppresses the tooltip on the enabled state. */}
          <TooltipTrigger
            disabled={isReady}
            render={<span className="inline-block" />}
          >
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
          </TooltipTrigger>
          <TooltipContent side="left">
            Waiting on your orders, boss.
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
