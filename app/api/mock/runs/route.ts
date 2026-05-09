/**
 * GET /api/mock/runs — fixture history for `NEXT_PUBLIC_USE_MOCKS=1` demos.
 *
 * The home-page recent list, resume pill, and runs drawer call this when
 * MOCK_MODE is on, since real `/api/runs/list` would hit an empty SQLite
 * (mock mode never persists). Source of truth is `MOCK_PAST_RUNS` in
 * `lib/shared/mocks.ts`; this route is a thin re-export so client and
 * server fetches stay in sync.
 */

import { NextResponse } from "next/server";
import { MOCK_PAST_RUNS } from "@/lib/shared/mocks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ runs: MOCK_PAST_RUNS });
}
