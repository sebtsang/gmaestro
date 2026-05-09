import { NextResponse } from "next/server";
import { ResolveApprovalRequestSchema } from "@/lib/shared/schemas";
import { executeProviderAction } from "@/lib/dispatch/execute";
import { env } from "@/lib/shared/env";
import { getApproval, resolveApproval } from "@/lib/state/approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = ResolveApprovalRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const existing = await getApproval(id);
  if (!existing) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  await resolveApproval(
    id,
    parsed.data.status,
    parsed.data.edits,
    parsed.data.founderNotes,
  );

  // Post-approval Composio dispatch. Only fires when the founder both approved
  // (or approved-with-edits) AND named a provider on the approval card. Reject
  // never dispatches; approvals without a provider mark approved locally only.
  const isApproval =
    parsed.data.status === "approved" || parsed.data.status === "edited";
  const provider = parsed.data.provider?.trim();
  if (isApproval && provider) {
    // Re-read the approval so the dispatcher sees the updated status +
    // founderNotes (which is where founder edits land via resolveApproval).
    const updated = (await getApproval(id)) ?? existing;
    const result = await executeProviderAction(
      updated,
      provider,
      env().GMAESTRO_USER_ID,
    );
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, dispatchError: result.error, provider },
        { status: result.status },
      );
    }
    return NextResponse.json({ ok: true, dispatched: provider });
  }

  return NextResponse.json({ ok: true });
}
