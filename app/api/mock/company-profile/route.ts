/**
 * GET /api/mock/company-profile — fixture for `NEXT_PUBLIC_USE_MOCKS=1`.
 * Mirrors the live route's response shape; source of truth is
 * `makeMockCompanyProfile()` in `lib/shared/mocks.ts`.
 */

import { NextResponse } from "next/server";
import { makeMockCompanyProfile } from "@/lib/shared/mocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ profile: makeMockCompanyProfile() });
}
