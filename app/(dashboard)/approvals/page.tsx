import { desc, eq } from "drizzle-orm";
import { ApprovalsPageClient } from "@/lib/ui/components/approvals-page-client";
import { db, schema } from "@/lib/state/db";
import type { ApprovalRequest } from "@/lib/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const IS_MOCK_MODE = process.env.NEXT_PUBLIC_USE_MOCKS === "1";

async function loadPendingApprovals(): Promise<ApprovalRequest[]> {
  // In mock mode the DB is bypassed entirely — approvals only exist client-
  // side via the shared SSE store. Skipping the read avoids a stale-row
  // surprise in case someone left rows from a real run.
  if (IS_MOCK_MODE) return [];

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

export default async function ApprovalsPage() {
  const approvals = await loadPendingApprovals();

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

      <ApprovalsPageClient serverApprovals={approvals} />
    </div>
  );
}
