import { NextResponse } from "next/server";
import { env } from "@/lib/shared/env";
import { CompanyContextInputSchema } from "@/lib/shared/schemas";
import type { CompanyContext, GtmMetric } from "@/lib/shared/types";
import {
  loadCompanyContext,
  saveCompanyContext,
} from "@/lib/state/company-context";
import { countAllMetrics } from "@/lib/state/gtm-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ContextResponse {
  context: (Omit<CompanyContext, "updatedAt"> & { updatedAt: string }) | null;
  liveCounts: Record<GtmMetric, number>;
}

function payload(context: CompanyContext | null): ContextResponse {
  const liveCounts = countAllMetrics(
    context?.gtmObjectives.map((o) => ({ metric: o.metric, since: o.since })) ??
      [],
  );
  return {
    context: context
      ? { ...context, updatedAt: context.updatedAt.toISOString() }
      : null,
    liveCounts,
  };
}

export function GET() {
  return NextResponse.json(payload(loadCompanyContext(env().GMAESTRO_USER_ID)));
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CompanyContextInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const saved = saveCompanyContext({
    ...parsed.data,
    userId: env().GMAESTRO_USER_ID,
  });
  return NextResponse.json(payload(saved));
}
