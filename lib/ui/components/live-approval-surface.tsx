"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ApprovalCard,
  extractDraftFields,
} from "@/lib/ui/components/approval-card";
import { registerRevision } from "@/lib/ui/components/mock-approval-builder";
import type { ApprovalArtifactType, ApprovalRequest } from "@/lib/shared/types";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import {
  injectMockRevisedApproval,
  usePendingApprovals,
} from "@/lib/ui/hooks/use-pending-approvals";

interface LlmRewrite {
  body: string;
  subject?: string;
}

/**
 * Call the configured LLM (via /api/mock/revise-draft) to rewrite a draft per
 * founder feedback. Returns null on error so the caller can fall back to the
 * heuristic-only path. Logs failures so they're debuggable in the browser.
 */
async function fetchLlmRewrite(payload: {
  currentBody: string;
  currentSubject?: string;
  founderNote: string;
  kind: ApprovalArtifactType;
}): Promise<LlmRewrite | null> {
  try {
    const res = await fetch("/api/mock/revise-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("[gmaestro] LLM revise failed", res.status, text);
      return null;
    }
    const data = (await res.json()) as LlmRewrite;
    if (!data.body) return null;
    return data;
  } catch (err) {
    console.warn("[gmaestro] LLM revise threw", err);
    return null;
  }
}

/**
 * Wraps the approval modal lifecycle for a dashboard surface. Reads from the
 * shared `usePendingApprovals` hook so dismiss/resolve are observable on
 * the /approvals page too. Surfaces a prominent resume pill when the
 * founder has dismissed but not resolved an approval.
 *
 * Pass `runId` from a per-run surface (e.g. `<LiveRunSurface>`) to scope the
 * dialog + resume pill to a single run — otherwise approvals from a second
 * concurrent run would steal focus while the founder is reading run A. The
 * underlying `usePendingApprovals` store stays global so the `/approvals`
 * page (which omits `runId`) still sees every run's approvals.
 */
export function LiveApprovalSurface({ runId }: { runId?: string } = {}) {
  const {
    pending: allPending,
    dismissed: allDismissed,
    hydrate,
    dismiss,
    resume,
    resolve,
    cache,
  } = usePendingApprovals();
  const pending = useMemo(
    () =>
      runId ? allPending.filter((a) => a.workflowRunId === runId) : allPending,
    [allPending, runId],
  );
  const dismissed = useMemo(
    () =>
      runId
        ? allDismissed.filter((a) => a.workflowRunId === runId)
        : allDismissed,
    [allDismissed, runId],
  );
  const [active, setActive] = useState<ApprovalRequest | null>(null);

  // Atomic guard: once a Request-changes resolution has fired for an approval
  // id we never schedule a second revision for that id, even if `submit` is
  // re-entered (rapid clicks, HMR-triggered re-renders, double-fired event
  // handlers, etc.). The Set is intentionally a ref (not state) so it
  // survives renders without scheduling additional ones.
  const resolvedOnceRef = useRef<Set<string>>(new Set());
  // When `onResolved` runs, it stamps the id here so the immediately-following
  // `onOpenChange(false)` (called from the same `submit`) skips the dismiss
  // bookkeeping. Cleared on every render so a TRUE close (Esc / X) always
  // dismisses normally.
  const justResolvedIdRef = useRef<string | null>(null);

  // Latest pending approval auto-opens. Newest wins so a freshly-revised
  // draft pre-empts the older one.
  const head = pending.length > 0 ? pending[pending.length - 1] : null;
  const headId = head?.id ?? null;
  // Newest dismissed approval drives the resume pill.
  const dismissedHead =
    dismissed.length > 0 ? dismissed[dismissed.length - 1] : null;

  useEffect(() => {
    if (!headId) return;
    if (active && active.id === headId) return;

    let cancelled = false;
    const load = async () => {
      // Cached or mock-mode: hydrate is synchronous.
      const hydrated = hydrate(headId);
      if (hydrated) {
        if (!cancelled) setActive(hydrated);
        if (MOCK_MODE) return;
      }

      if (MOCK_MODE) return;

      // Real mode: fetch the canonical record and stash it in the shared
      // cache so /approvals can read the same shape without its own fetch.
      try {
        const res = await fetch(`/api/approvals/${headId}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ApprovalRequest;
        const approval: ApprovalRequest = {
          ...data,
          createdAt: new Date(data.createdAt),
          resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : null,
        };
        if (!cancelled) {
          cache(approval);
          setActive(approval);
        }
      } catch {
        // Endpoint not live yet — leave whatever hydrate returned (may be
        // null in real mode). The dialog stays closed in that case.
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
  }, [headId, active, hydrate, cache]);

  const handleResume = useCallback(() => {
    if (!dismissedHead) return;
    resume(dismissedHead.id);
  }, [dismissedHead, resume]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (open) return;
      // Capture and clear the just-resolved guard FIRST. If `submit` just ran
      // `onResolved` and is now calling `onOpenChange(false)` to close the
      // dialog, we must NOT also mark the id as dismissed — that would leave
      // the approval in BOTH `resolved` and `dismissed` sets, which causes
      // the resume pill to flash for a tick on some renders and pollutes the
      // store. A true Esc/X close still dismisses.
      const skipId = justResolvedIdRef.current;
      justResolvedIdRef.current = null;
      const closingId = active?.id;
      setActive(null);
      if (closingId && closingId !== skipId) dismiss(closingId);
    },
    [active, dismiss],
  );

  const onResolved = useCallback(
    (
      status: "approved" | "edited" | "rejected" | "changes_requested",
      notes?: string,
    ) => {
      const original = active;
      if (!original) return;
      // Idempotency guard: the same approval id can only be resolved once.
      // Defends against rapid double-clicks, replayed click events, and any
      // edge case where `submit` re-enters before React re-renders to
      // unmount the dialog.
      if (resolvedOnceRef.current.has(original.id)) return;
      resolvedOnceRef.current.add(original.id);
      // Tell the upcoming `onOpenChange(false)` (fired synchronously by the
      // same `submit`) to skip the dismiss-bookkeeping for this id.
      justResolvedIdRef.current = original.id;

      resolve(original.id);
      setActive(null);

      // Mock-mode revision loop: simulate the agent revising per the
      // founder's notes and re-surfacing a fresh approval. Pushes a
      // synthetic approval_requested event into the shared bus so
      // /approvals also sees the revised draft.
      if (
        MOCK_MODE &&
        status === "changes_requested" &&
        notes &&
        notes.length > 0
      ) {
        // Snapshot the CURRENT body/subject so the LLM (and the heuristic
        // fallback) operate on the prior draft, not the original — chains
        // of revisions stack.
        const { body: priorBody = "", subject: priorSubject = "" } =
          extractDraftFields(original.proposedAction);
        // LLM call falls back to heuristics if it errors or times out, so the
        // demo never hangs on a flaky model.
        const toastId = toast.loading("Agent revising the draft…");
        const llmKind: ApprovalArtifactType = original.artifactType;
        void fetchLlmRewrite({
          currentBody: priorBody,
          currentSubject: priorSubject,
          founderNote: notes,
          kind: llmKind,
        }).then((rewrite) => {
          const { revisedId } = registerRevision({
            parentApprovalId: original.id,
            priorNote: notes,
            priorBody,
            priorSubject,
            kind: original.artifactType,
            overrideBody: rewrite?.body,
            overrideSubject: rewrite?.subject,
          });
          if (rewrite) {
            toast.success("Draft revised", { id: toastId });
          } else {
            toast.warning("Used fallback rewrite (LLM unavailable)", {
              id: toastId,
            });
          }
          injectMockRevisedApproval({
            workflowRunId: original.workflowRunId,
            approvalId: revisedId,
            artifactType: original.artifactType,
            blastRadius: original.blastRadius,
            reason: `Revised draft incorporating your feedback: "${notes}"`,
            priorNote: notes,
          });
        });
      }
    },
    [active, resolve],
  );

  // Resume pill — only when there's a dismissed approval and the dialog
  // isn't open. Centered along the bottom edge so it doesn't collide with
  // the right-rail pipeline-state cards. Pulse animation + a generous
  // amber background make it impossible to miss.
  const resumeAffordance =
    dismissedHead && !active ? (
      <div
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center"
        data-testid="resume-affordance-wrapper"
      >
        <div className="pointer-events-auto relative">
          <span
            aria-hidden
            className="absolute inset-0 -z-10 animate-ping rounded-full bg-amber-400/60"
          />
          <Button
            size="lg"
            onClick={handleResume}
            className="gap-2 rounded-full bg-amber-500 px-5 text-sm font-semibold text-white shadow-xl ring-2 ring-amber-300/70 hover:bg-amber-600 dark:bg-amber-400 dark:text-slate-900 dark:hover:bg-amber-300"
            data-testid="resume-approval"
          >
            <BellRing className="size-4" />
            Approval awaiting your review · Resume
          </Button>
        </div>
      </div>
    ) : null;

  return (
    <>
      {active ? (
        <ApprovalCard
          approval={active}
          open={true}
          onOpenChange={onOpenChange}
          onResolved={onResolved}
          mock={MOCK_MODE}
        />
      ) : null}
      {resumeAffordance}
    </>
  );
}
