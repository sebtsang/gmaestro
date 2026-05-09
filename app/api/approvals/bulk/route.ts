import { NextResponse } from "next/server";
import { BulkResolveApprovalsRequestSchema } from "@/lib/shared/schemas";
import { getApproval, resolveApproval } from "@/lib/state/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bulk-resolve a batch of pending approvals from a single click. Founder
 * picks per-row reject toggles in the UI; everything else gets approved.
 *
 * The request body lists the FULL set of decisions (one per approvalId)
 * rather than relying on "and approve all the rest" semantics — that keeps
 * the endpoint stateless and lets the UI optimistically reconcile.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BulkResolveApprovalsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const results = await Promise.all(
    parsed.data.decisions.map(async (d) => {
      const existing = await getApproval(d.approvalId);
      if (!existing) {
        return { approvalId: d.approvalId, ok: false, reason: "not_found" };
      }
      if (existing.status !== "pending") {
        return {
          approvalId: d.approvalId,
          ok: false,
          reason: "already_resolved",
        };
      }
      await resolveApproval(d.approvalId, d.status, undefined, d.founderNotes);
      return { approvalId: d.approvalId, ok: true, status: d.status };
    }),
  );

  const resolvedCount = results.filter((r) => r.ok).length;
  return NextResponse.json({ ok: true, resolvedCount, results });
}
