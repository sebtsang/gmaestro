"use client";

/**
 * Slide-over drawer listing every workflow run, newest first.
 *
 * - Top-nav button or ⌘K opens it.
 * - Live-patches against `workflow_started` / `run_titled` / `workflow_done`.
 * - Search filters client-side over title + prompt.
 * - Click a row → navigate to `/runs/[id]`, drawer auto-closes.
 *
 * Built directly on base-ui's Dialog primitive instead of shadcn's `Dialog`
 * because the shadcn wrapper is centered + zoomed; we want slide-from-right.
 */

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, History, Loader2, Search, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useSharedEvents } from "@/lib/ui/hooks/use-shared-events";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import type { WorkflowState } from "@/lib/shared/types";

interface RunRow {
  id: string;
  title: string | null;
  prompt: string;
  state: WorkflowState;
  startedAt: string;
  completedAt: string | null;
}

const STATE_PILL: Record<WorkflowState, { label: string; cls: string; icon: React.ReactNode }> = {
  planning: {
    label: "Planning",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  running: {
    label: "Running",
    cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  awaiting_approval: {
    label: "Awaiting",
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    icon: <Loader2 className="size-3 animate-spin" />,
  },
  done: {
    label: "Done",
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    icon: <CheckCircle2 className="size-3" />,
  },
  failed: {
    label: "Failed",
    cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    icon: <XCircle className="size-3" />,
  },
};

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${Math.max(0, s)}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

interface RunsDrawerProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}

export function RunsDrawer({ open, onOpenChange }: RunsDrawerProps) {
  const router = useRouter();
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const events = useSharedEvents();

  const fetchRuns = useCallback(async () => {
    if (MOCK_MODE) {
      // Mock-mode list comes from /api/mock/runs (added later in this commit).
      try {
        setLoading(true);
        const res = await fetch("/api/mock/runs");
        if (!res.ok) return;
        const data = (await res.json()) as { runs: RunRow[] };
        setRuns(data.runs);
      } finally {
        setLoading(false);
      }
      return;
    }
    try {
      setLoading(true);
      const res = await fetch("/api/runs/list?limit=200");
      if (!res.ok) return;
      const data = (await res.json()) as { runs: RunRow[] };
      setRuns(data.runs);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on first open. Subsequent opens patch from SSE events between opens.
  const fetchedOnce = useRef(false);
  useEffect(() => {
    if (!open) return;
    if (fetchedOnce.current) return;
    fetchedOnce.current = true;
    void fetchRuns();
  }, [open, fetchRuns]);

  // Patch the local list as relevant events fly past — keeps an open drawer
  // up-to-date without re-fetching.
  useEffect(() => {
    if (events.length === 0) return;
    setRuns((prev) => {
      let next = prev;
      for (const e of events) {
        if (e.type === "workflow_started") {
          const p = e.payload as {
            workflowRunId: string;
            prompt: string;
            startedAt: string;
          };
          if (next.find((r) => r.id === p.workflowRunId)) continue;
          next = [
            {
              id: p.workflowRunId,
              title: null,
              prompt: p.prompt,
              state: "running",
              startedAt: p.startedAt,
              completedAt: null,
            },
            ...next,
          ];
        } else if (e.type === "run_titled") {
          const p = e.payload as { workflowRunId: string; title: string };
          next = next.map((r) =>
            r.id === p.workflowRunId ? { ...r, title: p.title } : r,
          );
        } else if (e.type === "workflow_done") {
          const p = e.payload as {
            workflowRunId: string;
            state: "done" | "failed";
          };
          next = next.map((r) =>
            r.id === p.workflowRunId
              ? { ...r, state: p.state, completedAt: new Date().toISOString() }
              : r,
          );
        }
      }
      return next;
    });
  }, [events]);

  // ⌘K toggles the drawer from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Auto-focus the search input when the drawer opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter((r) => {
      const hay = `${r.title ?? ""} ${r.prompt}`.toLowerCase();
      return hay.includes(q);
    });
  }, [runs, search]);

  const handleClick = (id: string) => {
    onOpenChange(false);
    router.push(`/runs/${id}`);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            "fixed inset-0 z-50 bg-black/15 supports-backdrop-filter:backdrop-blur-xs",
            "data-open:animate-in data-open:fade-in-0",
            "data-closed:animate-out data-closed:fade-out-0",
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            "fixed top-0 right-0 z-50 flex h-screen w-full max-w-sm flex-col bg-background shadow-2xl outline-none ring-1 ring-foreground/10",
            "data-open:animate-in data-open:slide-in-from-right",
            "data-closed:animate-out data-closed:slide-out-to-right",
            "duration-150",
          )}
        >
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 text-muted-foreground" />
            <DialogPrimitive.Title className="text-sm font-medium">
              Runs
            </DialogPrimitive.Title>
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">
              ⌘K
            </span>
            <DialogPrimitive.Close
              className="ml-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="border-b border-border p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={inputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title or prompt"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && runs.length === 0 ? (
              <div className="flex items-center justify-center px-4 py-10 text-xs text-muted-foreground">
                <Loader2 className="mr-2 size-3 animate-spin" /> Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-muted-foreground">
                {runs.length === 0
                  ? "No runs yet — kick one off from the home page."
                  : "No matches."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((r) => {
                  const pill = STATE_PILL[r.state];
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(r.id)}
                        className="flex w-full flex-col items-start gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/60"
                      >
                        <div className="flex w-full items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {r.title ?? r.prompt}
                          </span>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              pill.cls,
                            )}
                          >
                            {pill.icon}
                            {pill.label}
                          </span>
                        </div>
                        <div className="flex w-full items-center gap-2 text-[11px] text-muted-foreground">
                          <span className="font-mono">
                            {r.id.slice(0, 8)}
                          </span>
                          <span>·</span>
                          <span>{relativeTime(r.startedAt)}</span>
                        </div>
                        {r.title && r.prompt !== r.title ? (
                          <p className="line-clamp-2 text-[11px] text-muted-foreground">
                            {r.prompt}
                          </p>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
