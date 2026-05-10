import { NextResponse } from "next/server";
import { CompanyProfileUpdateSchema } from "@/lib/shared/schemas";
import {
  getCompanyProfile,
  upsertCompanyProfile,
} from "@/lib/state/company-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getFounderId(): string {
  return process.env.GMAESTRO_USER_ID ?? "default";
}

export async function GET() {
  const profile = getCompanyProfile(getFounderId());
  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CompanyProfileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const profile = upsertCompanyProfile(getFounderId(), parsed.data);
  return NextResponse.json({ profile });
}
