/**
 * Dev-only persona invocation endpoint for the test harness
 * (`scripts/_test-personas.ts`). Lets a tsx script exercise a single
 * `runPersona()` call without itself importing `lib/personas/runtime`
 * (which is `import "server-only"` and so refuses to load outside Next).
 *
 * Refuses to run in production. Body:
 *   { personaId: PersonaId, input: Record<string, unknown> }
 *
 * Returns:
 *   200 { ok: true, output: <persona output> }
 *   500 { ok: false, error: <message> }
 */

import { NextResponse } from "next/server";
import { runPersona } from "@/lib/personas/runtime";
import { fetchResearcherBundle } from "@/lib/personas/researcher/fetch";
import type { PersonaId } from "@/lib/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PERSONAS: ReadonlySet<string> = new Set([
  "researcher",
  "qualifier",
  "strategist",
  "writer",
  "scheduler",
  "brief-writer",
  "activation",
  "crm-logger",
  "pipeline-reporter",
  "slack-digest",
  "feedback-tagger",
  "theme-synthesizer",
  "linear-filer",
]);

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "test-persona is dev-only" },
      { status: 403 },
    );
  }

  let body: { personaId?: string; input?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid JSON body" },
      { status: 400 },
    );
  }

  const { personaId, input } = body;
  if (!personaId || !VALID_PERSONAS.has(personaId)) {
    return NextResponse.json(
      { ok: false, error: `unknown personaId: ${personaId}` },
      { status: 400 },
    );
  }
  if (!input || typeof input !== "object") {
    return NextResponse.json(
      { ok: false, error: "input must be an object" },
      { status: 400 },
    );
  }

  const userId = process.env.GMAESTRO_USER_ID ?? "default";

  try {
    let finalInput = input;
    // Pattern B: researcher needs the Composio fetch bundle pre-baked into
    // its input (the workflow dispatcher does this; we replicate here).
    if (personaId === "researcher") {
      const topic =
        typeof input.topic === "string"
          ? input.topic
          : typeof (input.item as { topic?: string } | undefined)?.topic === "string"
            ? ((input.item as { topic: string }).topic)
            : "";
      const companyProfileRaw = input.companyProfile ?? (input.item as { companyProfile?: unknown } | undefined)?.companyProfile;
      const companyProfile =
        companyProfileRaw && typeof companyProfileRaw === "object" && !Array.isArray(companyProfileRaw)
          ? (companyProfileRaw as Record<string, unknown>)
          : {};
      const companyName =
        typeof companyProfile.companyName === "string"
          ? companyProfile.companyName
          : undefined;
      const competitorUrls = Array.isArray(companyProfile.competitors)
        ? (companyProfile.competitors as unknown[]).filter(
            (u): u is string => typeof u === "string",
          )
        : undefined;
      const bundle = await fetchResearcherBundle(userId, {
        topic,
        companyName,
        competitorUrls,
      });
      finalInput = { ...input, fetchBundle: bundle };
    }

    const output = await runPersona<Record<string, unknown>>(
      personaId as PersonaId,
      finalInput as Record<string, unknown> & {
        workflowRunId?: string;
        nodeId?: string;
      },
      userId,
    );
    return NextResponse.json({ ok: true, output });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
