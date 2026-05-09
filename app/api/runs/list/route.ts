/**
 * GET /api/runs/list?search=&limit=
 *
 * Used by the runs drawer + the home-page resume pill. Returns past + active
 * runs, newest first, optionally filtered by case-insensitive substring match
 * against title or prompt.
 *
 * NOTE: We could not name this `app/api/runs/route.ts GET` because POST
 * already lives there with its own runtime constraints. Splitting into
 * `/list` keeps the existing detached-fanout POST untouched.
 */

import { NextResponse } from "next/server";
import { desc, like, or } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawSearch = url.searchParams.get("search")?.trim() ?? "";
  const rawLimit = url.searchParams.get("limit");

  let limit = DEFAULT_LIMIT;
  if (rawLimit) {
    const parsed = Number.parseInt(rawLimit, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      limit = Math.min(parsed, MAX_LIMIT);
    }
  }

  const baseQuery = db
    .select({
      id: schema.workflowRuns.id,
      title: schema.workflowRuns.title,
      prompt: schema.workflowRuns.prompt,
      state: schema.workflowRuns.state,
      startedAt: schema.workflowRuns.startedAt,
      completedAt: schema.workflowRuns.completedAt,
    })
    .from(schema.workflowRuns)
    .orderBy(desc(schema.workflowRuns.startedAt))
    .limit(limit);

  const rows = rawSearch
    ? await baseQuery.where(
        or(
          like(schema.workflowRuns.title, `%${rawSearch}%`),
          like(schema.workflowRuns.prompt, `%${rawSearch}%`),
        ),
      )
    : await baseQuery;

  return NextResponse.json({
    runs: rows.map((r) => ({
      id: r.id,
      title: r.title,
      prompt: r.prompt,
      state: r.state,
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    })),
  });
}
