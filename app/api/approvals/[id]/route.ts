import { NextResponse } from "next/server";
import { ResolveApprovalRequestSchema } from "@/lib/shared/schemas";
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

  return NextResponse.json({ ok: true });
}
