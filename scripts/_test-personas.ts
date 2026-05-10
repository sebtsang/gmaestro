/**
 * End-to-end persona test harness.
 *
 * Drives `POST /api/test-persona` (dev-only endpoint) once per persona,
 * reading lead/trial fixtures from the local DB and feeding synthetic
 * upstream `previousOutputs` where needed. Each test reports pass/fail
 * with a 1-line preview of the persona's output. Final exit code is
 * non-zero if any persona failed.
 *
 * Why HTTP and not direct import: `lib/personas/runtime.ts` is
 * `import "server-only"`, which refuses to load under tsx. The Next.js
 * dev server already has the SDK + DB + Composio wired up, so we POST
 * to it instead.
 *
 * Run: pnpm dev (in another shell) + pnpm tsx scripts/_test-personas.ts
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, schema } from "./_script-db";

const BASE_URL = process.env.GMAESTRO_BASE_URL ?? "http://localhost:3000";
const TEST_RUN_ID = `test-personas-${Date.now().toString(36)}`;
const FETCH_TIMEOUT_MS = 240_000;

interface TestResult {
  persona: string;
  ok: boolean;
  ms: number;
  preview?: string;
  error?: string;
}

const results: TestResult[] = [];

interface InvokeResult {
  ok: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

async function invokePersona(
  personaId: string,
  input: Record<string, unknown>,
): Promise<InvokeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/test-persona`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId, input }),
      signal: ctrl.signal,
    });
    const json = (await res.json()) as InvokeResult;
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error ?? `HTTP ${res.status}` };
    }
    return json;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function timed(
  persona: string,
  input: Record<string, unknown>,
  derivePreview: (out: Record<string, unknown>) => string,
): Promise<Record<string, unknown> | null> {
  const start = Date.now();
  const r = await invokePersona(persona, input);
  const ms = Date.now() - start;
  if (r.ok && r.output) {
    const preview = derivePreview(r.output);
    console.log(`✓ ${persona.padEnd(20)} ${ms.toString().padStart(5)}ms  ${preview}`);
    results.push({ persona, ok: true, ms, preview });
    return r.output;
  }
  const error = r.error ?? "unknown error";
  const trimmed = error.length > 200 ? error.slice(0, 200) + "…" : error;
  console.log(`✗ ${persona.padEnd(20)} ${ms.toString().padStart(5)}ms  ${trimmed}`);
  results.push({ persona, ok: false, ms, error });
  return null;
}

async function main() {
  console.log(`\nRunning persona tests (run id: ${TEST_RUN_ID})\n`);

  // Insert a parent workflow_runs row so the FK on activity_events.workflow_run_id
  // resolves when runPersona's emitEvent fires inside the test endpoint.
  // Cleaned up at the end of main().
  db.insert(schema.workflowRuns)
    .values({
      id: TEST_RUN_ID,
      prompt: "test-personas harness",
      state: "running",
    })
    .run();

  // ---- fixtures --------------------------------------------------------
  const leadRow = db.select().from(schema.leads).limit(1).all()[0];
  if (!leadRow) {
    console.error("No leads in DB — run `pnpm tsx scripts/seed-demo.ts` first.");
    process.exit(1);
  }
  const lead = {
    leadId: leadRow.id,
    item: {
      leadId: leadRow.id,
      email: leadRow.email,
      name: leadRow.name,
      company: leadRow.company,
      source: leadRow.source,
      rawMessage: leadRow.rawMessage,
    },
    workflowRunId: TEST_RUN_ID,
  };
  const trial = db.select().from(schema.trialSignals).limit(1).all()[0];

  // ---- 1. researcher --------------------------------------------------
  const researcherOut = await timed(
    "researcher",
    { ...lead, nodeId: "test-researcher" },
    (out) =>
      `domain=${out.companyDomain ?? "—"} signals=${
        Array.isArray(out.intentSignals) ? out.intentSignals.length : 0
      }`,
  );

  // ---- 2. qualifier ---------------------------------------------------
  const qualifierOut = await timed(
    "qualifier",
    {
      ...lead,
      nodeId: "test-qualifier",
      previousOutputs: { researcher: researcherOut ?? {} },
    },
    (out) => `tier=${out.tier} fit=${out.fitScore} intent=${out.intentScore}`,
  );

  // ---- 3. strategist --------------------------------------------------
  const strategistOut = await timed(
    "strategist",
    {
      ...lead,
      nodeId: "test-strategist",
      previousOutputs: {
        researcher: researcherOut ?? {},
        qualifier: qualifierOut ?? {},
      },
    },
    (out) => {
      const angle = typeof out.angle === "string" ? out.angle.slice(0, 40) : "";
      return `cta=${out.callToAction} angle="${angle}"`;
    },
  );

  // ---- 4. writer ------------------------------------------------------
  const writerOut = await timed(
    "writer",
    {
      ...lead,
      nodeId: "test-writer",
      previousOutputs: {
        researcher: researcherOut ?? {},
        qualifier: qualifierOut ?? {},
        strategist: strategistOut ?? {},
      },
    },
    (out) => {
      const subj = typeof out.subject === "string" ? out.subject.slice(0, 50) : "";
      return `subject="${subj}"`;
    },
  );

  // ---- 5. scheduler ---------------------------------------------------
  await timed(
    "scheduler",
    {
      ...lead,
      draftId: (writerOut?.id as string | undefined) ?? `draft-${TEST_RUN_ID}`,
      nodeId: "test-scheduler",
      previousOutputs: { writer: writerOut ?? {} },
    },
    (out) =>
      `meetingId=${out.id} startsAt=${String(out.startsAt).slice(0, 16)}`,
  );

  // ---- 6. brief-writer -----------------------------------------------
  await timed(
    "brief-writer",
    {
      meetingId: `meet-${TEST_RUN_ID}`,
      nodeId: "test-brief-writer",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {
        researcher: researcherOut ?? {},
        qualifier: qualifierOut ?? {},
        writer: writerOut ?? {},
      },
    },
    (out) => {
      const tp = Array.isArray(out.talkingPoints) ? out.talkingPoints.length : 0;
      return `talkingPoints=${tp} url=${typeof out.notionPageUrl === "string" ? out.notionPageUrl.slice(0, 40) : "—"}`;
    },
  );

  // ---- 7. activation --------------------------------------------------
  if (trial) {
    const trialLead = db
      .select()
      .from(schema.leads)
      .all()
      .find((l) => l.id === trial.leadId);
    await timed(
      "activation",
      {
        leadId: trial.leadId,
        item: {
          trialSignalId: trial.id,
          leadId: trial.leadId,
          email: trialLead?.email,
          name: trialLead?.name,
          company: trialLead?.company,
          stalledAtStep: trial.stalledAtStep,
          stripeStatus: trial.stripeStatus,
        },
        nodeId: "test-activation",
        workflowRunId: TEST_RUN_ID,
      },
      (out) => {
        const subj = typeof out.subject === "string" ? out.subject.slice(0, 40) : "—";
        return `channel=${out.channel} subject="${subj}"`;
      },
    );
  } else {
    console.log("⊘ activation           skipped — no trial_signals in DB");
  }

  // ---- 8. crm-logger -------------------------------------------------
  await timed(
    "crm-logger",
    {
      ...lead,
      nodeId: "test-crm-logger",
      previousOutputs: {
        qualifier: qualifierOut ?? {},
        writer: writerOut ?? {},
      },
    },
    (out) => `action=${out.action} contactId=${out.crmContactId ?? "—"}`,
  );

  // ---- 9. pipeline-reporter ------------------------------------------
  await timed(
    "pipeline-reporter",
    {
      nodeId: "test-pipeline-reporter",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {},
    },
    (out) => {
      const summary = typeof out.summary === "string" ? out.summary.slice(0, 70) : "—";
      return `summary="${summary}…"`;
    },
  );

  // ---- 10. slack-digest ----------------------------------------------
  await timed(
    "slack-digest",
    {
      nodeId: "test-slack-digest",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {
        "pipeline-reporter": { summary: "5 leads enriched, 3 hot, 2 warm" },
      },
    },
    (out) => `channel=${out.channel} ts=${out.messageTs}`,
  );

  // ---- 11. feedback-tagger -------------------------------------------
  await timed(
    "feedback-tagger",
    {
      messageId: "synthetic-msg-1",
      nodeId: "test-feedback-tagger",
      workflowRunId: TEST_RUN_ID,
      item: {
        messageId: "synthetic-msg-1",
        text: "Just tried the dashboard — DAG view crashed when I clicked a node. Otherwise loving the persona breakdown though, super clear",
        source: "intercom",
      },
    },
    (out) => {
      const themes = Array.isArray(out.themes) ? out.themes.join(", ") : "—";
      return `sentiment=${out.sentiment} themes=[${themes}]`;
    },
  );

  // ---- 12. theme-synthesizer ----------------------------------------
  await timed(
    "theme-synthesizer",
    {
      nodeId: "test-theme-synthesizer",
      workflowRunId: TEST_RUN_ID,
      item: {
        feedback: [
          { id: "f1", text: "DAG view crashes on node click", themes: ["bug:dag"], sentiment: "negative" },
          { id: "f2", text: "Approval card is great, very clear", themes: ["feedback:ui"], sentiment: "positive" },
          { id: "f3", text: "Wish I could resend without editing", themes: ["feature:resend"], sentiment: "neutral" },
        ],
      },
    },
    (out) =>
      `notion=${typeof out.notionPageUrl === "string" ? out.notionPageUrl.slice(0, 50) : "—"}`,
  );

  // ---- 13. linear-filer ----------------------------------------------
  await timed(
    "linear-filer",
    {
      themeId: "theme-bug-dag-1",
      nodeId: "test-linear-filer",
      workflowRunId: TEST_RUN_ID,
      item: {
        themeId: "theme-bug-dag-1",
        title: "DAG view crashes on node click",
        description: "Multiple users report dashboard crash when clicking a DAG node.",
        severity: "high",
        recommendedTeam: "frontend",
      },
    },
    (out) =>
      `issueId=${out.issueId} url=${typeof out.issueUrl === "string" ? out.issueUrl.slice(0, 45) : "—"}`,
  );

  // ---- summary ---------------------------------------------------------
  const ok = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const totalMs = results.reduce((acc, r) => acc + r.ms, 0);

  console.log(
    `\n${ok}/${results.length} passed${failed ? ` (${failed} failed)` : ""}  total: ${(totalMs / 1000).toFixed(1)}s`,
  );

  if (failed > 0) {
    console.log("\nfailures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  ${r.persona}: ${r.error?.slice(0, 400)}`);
    }
  }

  // Clean up the test run row + any cascading rows so repeat runs stay
  // diffable.
  try {
    db.delete(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, TEST_RUN_ID))
      .run();
  } catch {
    // best-effort cleanup
  }

  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("test harness crashed:", err);
  process.exit(2);
});
