"use client";

/**
 * Client wrapper for the /approvals page that merges server-loaded approvals
 * (real mode, from the SQLite DB) with mock-mode approvals (derived from the
 * shared SSE event store via `usePendingApprovals`). In real mode, server
 * data is the source of truth. In mock mode, no DB row exists, so the hook
 * is the only source.
 */

import { useMemo } from "react";
import type { ApprovalRequest } from "@/lib/shared/types";
import { ApprovalsList } from "@/lib/ui/components/approvals-list";
import { MOCK_MODE } from "@/lib/ui/hooks/use-mock-driver";
import { usePendingApprovals } from "@/lib/ui/hooks/use-pending-approvals";

interface ApprovalsPageClientProps {
  serverApprovals: ApprovalRequest[];
  /** Toolkits actively connected (live-reconciled against Composio at page
   *  load). Forwarded to ApprovalsList → ApprovalCard so the provider picker
   *  only offers options the founder can actually dispatch through. */
  connectedToolkits: string[];
}

export function ApprovalsPageClient({
  serverApprovals,
  connectedToolkits,
}: ApprovalsPageClientProps) {
  const { pending, dismissed } = usePendingApprovals();

  const merged = useMemo(() => {
    // The /approvals page should show EVERY un-resolved approval, regardless
    // of whether the founder has dismissed the modal. Dismissal is a "I'll
    // come back to it" signal, not a resolution — and this page is exactly
    // where the founder comes back.
    const allClientside = [...pending, ...dismissed];

    // Mock mode: server returns nothing useful, just render the client store.
    if (MOCK_MODE) {
      return allClientside.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
    // Real mode: server data is canonical. Merge by id with the client store
    // as a fallback in case the SSE bus has a brand-new pending approval the
    // DB hasn't flushed yet (rare race window).
    const byId = new Map<string, ApprovalRequest>();
    for (const a of allClientside) byId.set(a.id, a);
    for (const a of serverApprovals) byId.set(a.id, a);
    return [...byId.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }, [pending, dismissed, serverApprovals]);

  if (merged.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
        No pending approvals.
      </div>
    );
  }

  return (
    <ApprovalsList
      approvals={merged}
      connectedToolkits={connectedToolkits}
    />
  );
}
