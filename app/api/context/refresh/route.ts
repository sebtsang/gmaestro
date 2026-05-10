import { NextResponse } from "next/server";
import { synthesizeCompanyContext } from "@/lib/orchestrator/context-synth";
import { env } from "@/lib/shared/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const proposed = await synthesizeCompanyContext(env().GMAESTRO_USER_ID);
    return NextResponse.json({
      proposed: { ...proposed, updatedAt: proposed.updatedAt.toISOString() },
    });
  } catch (err) {
    console.error("[api/context/refresh] synth failed:", err);
    return NextResponse.json(
      { error: "AI synthesis failed", message: (err as Error).message },
      { status: 500 },
    );
  }
}
