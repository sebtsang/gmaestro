import { desc, eq } from "drizzle-orm";
import { ApprovalsList } from "@/lib/ui/components/approvals-list";
import { db, schema } from "@/lib/state/db";
import type { ApprovalRequest } from "@/lib/shared/types";
import { reconcileToolkits } from "@/lib/state/connections-refresh";
import { PROVIDERS_BY_ARTIFACT } from "@/lib/dispatch/providers";
import { env } from "@/lib/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadPendingApprovals(): Promise<ApprovalRequest[]> {
  const rows = await db
    .select()
    .from(schema.approvalRequests)
    .where(eq(schema.approvalRequests.status, "pending"))
    .orderBy(desc(schema.approvalRequests.createdAt));
  return rows.map((r) => ({
    id: r.id,
    workflowRunId: r.workflowRunId,
    artifactType: r.artifactType,
    artifactId: r.artifactId,
    blastRadius: r.blastRadius,
    reason: r.reason,
    proposedAction: r.proposedAction as Record<string, unknown>,
    status: r.status,
    founderNotes: r.founderNotes,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
  }));
}

/**
 * Reconcile dispatch-relevant toolkits against Composio on every page load.
 * The local `connections` table can drift (old runs leave stale rows; tokens
 * expire silently). We hit Composio for truth, upsert, and return the set of
 * toolkits that are actually connected RIGHT NOW so the picker only offers
 * choices that will actually work.
 *
 * Capped at 6s total (in reconcileToolkits) so a slow Composio API doesn't
 * hang the page.
 */
async function loadConnectedToolkits(): Promise<string[]> {
  const dispatchToolkits = Array.from(
    new Set(
      Object.values(PROVIDERS_BY_ARTIFACT).flatMap((entries) =>
        entries.map((e) => e.toolkit),
      ),
    ),
  );
  const reconciled = await reconcileToolkits(
    env().GMAESTRO_USER_ID,
    dispatchToolkits,
  );
  const live = reconciled
    .filter((r) => r.status === "connected")
    .map((r) => r.toolkit);
  // DEV-ONLY override: GMAESTRO_FAKE_CONNECTED="gmail,outlook" lets us test
  // the picker UI without real OAuth. Production builds ignore this.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.GMAESTRO_FAKE_CONNECTED
  ) {
    return process.env.GMAESTRO_FAKE_CONNECTED.split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  return live;
}

export default async function ApprovalsPage() {
  const [approvals, connectedToolkits] = await Promise.all([
    loadPendingApprovals(),
    loadConnectedToolkits(),
  ]);

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-base font-semibold">Approvals</h1>
        <p className="text-sm text-muted-foreground">
          Anything that touches a customer or shared system pauses here.
        </p>
        <p className="text-sm italic text-muted-foreground">
          You can edit drafts in place - the team learns from your edits.
        </p>
      </header>

      {approvals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No pending approvals.
        </div>
      ) : (
        <ApprovalsList
          approvals={approvals}
          connectedToolkits={connectedToolkits}
        />
      )}
    </div>
  );
}
