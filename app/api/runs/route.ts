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

  // Build a prompt-shaped string for the run row (drives the recent-runs UI
  // + the Conductor's prompt input). For the new 3-input form, we synthesize
  // a structured prompt the Conductor can reason about. For legacy callers
  // sending a freeform `prompt`, pass it through.
  const { companyUrl, docsUrl, destination, prompt: legacyPrompt } = parsed.data;
  const promptString = legacyPrompt ?? buildStructuredPrompt({
    companyUrl: companyUrl!,
    docsUrl: docsUrl!,
    destination: destination!,
  });

  // Materialize leads for any emails in legacy prompts BEFORE WorkContext
  // is built. New 3-input flow has no email parsing.
  if (legacyPrompt) {
    try {
      await ensureLeadsForPromptEmails(legacyPrompt);
    } catch (err) {
      console.error("[api/runs] ensureLeadsForPromptEmails failed:", err);
      return NextResponse.json(
        { error: "Failed to materialize leads from prompt" },
        { status: 500 },
      );
    }
  }

  const workflowRunId = await createRun(promptString);

  // Fire-and-forget: the workflow runs for minutes; the route returns the id
  // immediately. The .catch is non-negotiable — without it, an unhandled
  // rejection in detached land kills the dev server with no DB trace.
  void runWorkflow(workflowRunId, promptString, founderId).catch(
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

/**
 * Synthesize a Conductor-readable prompt from the structured 3-input payload.
 * The Conductor doesn't need to know the inputs are structured — it just sees
 * a clear instruction with the URLs + destination baked in.
 */
function buildStructuredPrompt(input: {
  companyUrl: string;
  docsUrl: string;
  destination: "blog-html" | "reddit" | "x-thread";
}): string {
  const destinationLabel = {
    "blog-html": "a deep technical blog post (~2,000 words)",
    reddit: "a Reddit thread (~250 words)",
    "x-thread": "an X thread (5–10 tweets)",
  }[input.destination];
  return [
    `Write ${destinationLabel} for the company at ${input.companyUrl}.`,
    `The blog is about the technical content at ${input.docsUrl}.`,
    `Match the company's existing voice (extracted from their blog automatically).`,
    `Destination: ${input.destination}.`,
  ].join(" ");
}
