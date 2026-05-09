import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { RunWorkflowRequestSchema } from "@/lib/shared/schemas";
import { db, schema } from "@/lib/state/db";
import { createRun, markRunFailed, runWorkflow } from "@/lib/state/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Email regex tight enough that it won't paint half a sentence when there's
 * no actual email in the prompt. Captures the local-part + domain.
 */
const EMAIL_RE = /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi;

/**
 * Materialize a lead row for any email mentioned in the prompt that isn't
 * already in the leads table. Without this, the Conductor sees the email in
 * the prompt but finds no matching lead in `WorkContext` and either improvises
 * (writer task with `recipientEmail` instead of `leadId`, which fails
 * persona-input validation) or plans nothing usable.
 *
 * Returns the count of newly-inserted leads.
 */
async function ensureLeadsForPromptEmails(prompt: string): Promise<number> {
  const matches = [...prompt.matchAll(EMAIL_RE)].map((m) => m[1].toLowerCase());
  if (matches.length === 0) return 0;

  let inserted = 0;
  for (const email of new Set(matches)) {
    const existing = await db
      .select({ id: schema.leads.id })
      .from(schema.leads)
      .where(eq(schema.leads.email, email))
      .limit(1);
    if (existing.length > 0) continue;

    // Derive a placeholder name from the local part. "w.sunny0618" → "W Sunny"
    // — good enough for the Conductor's work-context summary; the founder
    // edits the draft on the approval card before sending anyway.
    const local = email.split("@")[0];
    const name =
      local
        .replace(/[._-]+/g, " ")
        .replace(/\d+$/, "")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase()) || local;

    await db.insert(schema.leads).values({
      id: randomUUID(),
      email,
      name,
      company: null,
      source: "manual_import",
      rawMessage: `Drafted from chatbot prompt: "${prompt.slice(0, 240)}"`,
    });
    inserted += 1;
  }
  return inserted;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = RunWorkflowRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const founderId = process.env.GMAESTRO_USER_ID ?? "default";

  // Materialize leads for any emails the founder named in the prompt BEFORE
  // we build WorkContext (which the Conductor reads). Done in the request
  // path, not the detached workflow, so a DB failure surfaces as a clean 500
  // instead of producing a no-op run that hangs in "running" forever.
  try {
    await ensureLeadsForPromptEmails(parsed.data.prompt);
  } catch (err) {
    console.error("[api/runs] ensureLeadsForPromptEmails failed:", err);
    return NextResponse.json(
      { error: "Failed to materialize leads from prompt" },
      { status: 500 },
    );
  }

  const workflowRunId = await createRun(parsed.data.prompt);

  // Fire-and-forget: the workflow runs for minutes; the route returns the id
  // immediately. The .catch is non-negotiable — without it, an unhandled
  // rejection in detached land kills the dev server with no DB trace.
  void runWorkflow(workflowRunId, parsed.data.prompt, founderId).catch(
    async (err) => {
      try {
        await markRunFailed(workflowRunId, err);
      } catch (markErr) {
        console.error(
          `[api/runs] failed to mark run ${workflowRunId} as failed:`,
          markErr,
        );
      }
      console.error(
        `[api/runs] detached workflow ${workflowRunId} failed:`,
        err,
      );
    },
  );

  return NextResponse.json({ workflowRunId }, { status: 202 });
}
