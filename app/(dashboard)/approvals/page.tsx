import { desc, eq } from "drizzle-orm";
import { ApprovalsList } from "@/lib/ui/components/approvals-list";
import { db, schema } from "@/lib/state/db";
import type { ApprovalRequest } from "@/lib/shared/types";

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

      {approvals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center text-sm text-muted-foreground">
          No pending approvals.
        </div>
      ) : (
        <ApprovalsList approvals={approvals} />
      )}
    </div>
  );
}
