/**
 * GET /api/mock/context — fixture for `NEXT_PUBLIC_USE_MOCKS=1` demos.
 *
 * Mirrors the live route's response shape. Source of truth is
 * `makeMockCompanyContext()` in `lib/shared/mocks.ts`.
 */

import { NextResponse } from "next/server";
import {
  makeMockCompanyContext,
  makeMockGtmLiveCounts,
} from "@/lib/shared/mocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const context = makeMockCompanyContext();
  return NextResponse.json({
    context: { ...context, updatedAt: context.updatedAt.toISOString() },
    liveCounts: makeMockGtmLiveCounts(),
  });
}
