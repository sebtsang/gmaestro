/**
 * End-to-end persona test harness — content / blog / GEO domain.
 *
 * Drives `POST /api/test-persona` (dev-only endpoint) once per persona,
 * feeding synthetic upstream `previousOutputs` where needed. Each test
 * reports pass/fail with a 1-line preview of the persona's output. Final
 * exit code is non-zero if any persona failed.
 *
 * Why HTTP and not direct import: `lib/personas/runtime.ts` is
 * `import "server-only"`, which refuses to load under tsx. The Next.js
 * dev server already has the SDK + Composio wired up, so we POST to it.
 *
 * Run: pnpm dev (in another shell) + pnpm tsx scripts/_test-personas.ts
 *
 * Unlike the GTM-era harness, this one does NOT read DB fixtures —
 * the content domain drives off the founder's prompt, not a leads table.
 * Pre-pivot reset: if you're switching from a stale DB, run
 * `pnpm gmaestro reset` first.
 */

import "dotenv/config";
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
  console.log(`\nRunning content persona tests (run id: ${TEST_RUN_ID})\n`);

  // Insert a parent workflow_runs row so the FK on activity_events.workflow_run_id
  // resolves when runPersona's emitEvent fires inside the test endpoint.
  db.insert(schema.workflowRuns)
    .values({
      id: TEST_RUN_ID,
      prompt: "test-personas harness",
      state: "running",
    })
    .run();

  // Synthetic seed: a topic + a fake company profile. The CompanyProfile system
  // will eventually populate this from the local DB, but for now we synthesize.
  const topic =
    "Why founder-led GTM beats AI cold email in 2026";
  const companyProfile = {
    companyName: "Anvil",
    oneLiner: "AI content team for early-stage founders",
    productDescription:
      "GMaestro is a local-first multi-persona AI content team that researches, drafts, GEO-optimizes, and publishes blogs across multiple channels with founder-in-loop approval.",
    icp: "Pre-Series A founders running their own GTM with no dedicated marketing team",
    positioning:
      "Unlike Jasper / Copy.ai / Surfer (single-shot SaaS writers), GMaestro is a multi-agent team with founder approval gates and native multi-channel cross-posting.",
    valueProps: [
      "Founder-in-loop quality control",
      "Multi-channel native formatting (not copy-paste)",
      "GEO-aware (optimizes for AI search citations)",
      "Local-first, no hosted SaaS",
    ],
    competitors: [
      "https://www.jasper.ai/blog",
      "https://surferseo.com/blog",
      "https://www.copy.ai/blog",
    ],
    sourceUrl: "https://anvil.co",
    voiceTone:
      "Direct, peer-to-peer, opinionated. Short paragraphs. Dry humor. No corporate jargon.",
  };

  // ---- 1. researcher --------------------------------------------------
  const researcherOut = await timed(
    "researcher",
    {
      topic,
      companyProfile,
      nodeId: "test-researcher",
      workflowRunId: TEST_RUN_ID,
    },
    (out) => {
      const candidates = Array.isArray(out.candidates) ? out.candidates.length : 0;
      const recommended =
        typeof out.recommendedTopic === "string"
          ? out.recommendedTopic.slice(0, 50)
          : "—";
      return `candidates=${candidates} recommended="${recommended}"`;
    },
  );

  // ---- 2. strategist --------------------------------------------------
  const strategistOut = await timed(
    "strategist",
    {
      topic,
      companyProfile,
      nodeId: "test-strategist",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: { researcher: researcherOut ?? {} },
    },
    (out) => {
      const sections = Array.isArray(out.sections) ? out.sections.length : 0;
      const signals = Array.isArray(out.geoSignals) ? out.geoSignals.length : 0;
      const title = typeof out.title === "string" ? out.title.slice(0, 50) : "";
      return `sections=${sections} geoSignals=${signals} title="${title}"`;
    },
  );

  // ---- 3. writer ------------------------------------------------------
  const writerOut = await timed(
    "writer",
    {
      topic,
      companyProfile,
      nodeId: "test-writer",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {
        researcher: researcherOut ?? {},
        strategist: strategistOut ?? {},
      },
    },
    (out) => {
      const title = typeof out.title === "string" ? out.title.slice(0, 50) : "";
      const wordCount =
        typeof out.bodyMarkdown === "string"
          ? out.bodyMarkdown.split(/\s+/).length
          : 0;
      return `title="${title}" words=${wordCount}`;
    },
  );

  // ---- 4. geo-editor --------------------------------------------------
  const geoEditedOut = await timed(
    "geo-editor",
    {
      companyProfile,
      nodeId: "test-geo-editor",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {
        strategist: strategistOut ?? {},
        writer: writerOut ?? {},
      },
    },
    (out) => {
      const notes = Array.isArray(out.geoNotes) ? out.geoNotes.length : 0;
      const ratio =
        typeof out.factDensityRatio === "number"
          ? out.factDensityRatio.toFixed(2)
          : "—";
      return `geoNotes=${notes} factDensity=${ratio}`;
    },
  );

  // ---- 5. formatter (one variant per target) -------------------------
  // Test all 3 confirmed-Composio targets to surface per-target shape issues.
  for (const target of ["github", "reddit", "linkedin"] as const) {
    await timed(
      `formatter[${target}]`,
      {
        target,
        companyProfile,
        nodeId: `test-formatter-${target}`,
        workflowRunId: TEST_RUN_ID,
        previousOutputs: {
          "geo-editor": geoEditedOut ?? writerOut ?? {},
        },
      },
      (out) => {
        const len = typeof out.content === "string" ? out.content.length : 0;
        const meta =
          out.metadata && typeof out.metadata === "object"
            ? Object.keys(out.metadata).join(",")
            : "—";
        return `len=${len} meta=[${meta}]`;
      },
    );
  }

  // ---- 6. pipeline-reporter -----------------------------------------
  await timed(
    "pipeline-reporter",
    {
      nodeId: "test-pipeline-reporter",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {
        "geo-editor": geoEditedOut ?? {},
        formatter__github: { target: "github" },
        formatter__reddit: { target: "reddit" },
      },
    },
    (out) => {
      const summary = typeof out.summary === "string" ? out.summary.slice(0, 60) : "—";
      const metrics =
        out.metrics && typeof out.metrics === "object"
          ? Object.keys(out.metrics).length
          : 0;
      return `metrics=${metrics} summary="${summary}…"`;
    },
  );

  // ---- 7. slack-digest ----------------------------------------------
  await timed(
    "slack-digest",
    {
      nodeId: "test-slack-digest",
      workflowRunId: TEST_RUN_ID,
      previousOutputs: {
        "pipeline-reporter": {
          summary:
            "Shipped 1 blog post, 3 channels live (GitHub PR + r/SaaS + LinkedIn).",
        },
      },
    },
    (out) => {
      const len = typeof out.digestText === "string" ? out.digestText.length : 0;
      const channel = typeof out.channel === "string" ? out.channel : "—";
      return `digestLen=${len} channel=${channel}`;
    },
  );

  // ---- 8. feedback-tagger -------------------------------------------
  await timed(
    "feedback-tagger",
    {
      messageId: `msg-${TEST_RUN_ID}`,
      nodeId: "test-feedback-tagger",
      workflowRunId: TEST_RUN_ID,
      item: {
        text: "Just read your post on r/SaaS — really liked the bit about cold email response rates dropping. Curious how you'd handle pricing for a marketplace play, would love a follow-up.",
        source: "reddit",
      },
    },
    (out) => {
      const themes = Array.isArray(out.themes) ? out.themes.join(",") : "—";
      return `sentiment=${out.sentiment} themes=[${themes}]`;
    },
  );

  // ---- 9. theme-synthesizer ----------------------------------------
  const themeOut = await timed(
    "theme-synthesizer",
    {
      nodeId: "test-theme-synthesizer",
      workflowRunId: TEST_RUN_ID,
      item: {
        feedback: [
          {
            id: "fb-1",
            text: "Curious how you'd handle pricing for a marketplace.",
            themes: ["topic:pricing-model", "audience:asks-followup"],
            sentiment: "pos",
            source: "reddit",
          },
          {
            id: "fb-2",
            text: "Pricing breakdown please?",
            themes: ["topic:pricing-model"],
            sentiment: "pos",
            source: "linkedin",
          },
          {
            id: "fb-3",
            text: "Got cited by Perplexity in the 'AI cold email' query!",
            themes: ["geo:cited-by-perplexity"],
            sentiment: "pos",
            source: "analytics",
          },
        ],
      },
    },
    (out) => {
      const themes = Array.isArray(out.themes) ? out.themes.join(",") : "—";
      const url =
        typeof out.notionPageUrl === "string"
          ? out.notionPageUrl.slice(0, 40)
          : "—";
      return `themes=[${themes}] url=${url}`;
    },
  );

  // ---- 10. linear-filer ---------------------------------------------
  await timed(
    "linear-filer",
    {
      themeId: "theme-pricing-followup",
      nodeId: "test-linear-filer",
      workflowRunId: TEST_RUN_ID,
      item: {
        themeId: "theme-pricing-followup",
        title: "Multiple readers asked about pricing model — draft follow-up post",
        description:
          "Reddit + LinkedIn comments on the GTM post both asked for a pricing breakdown. 2 distinct asks in 24 hours.",
        severity: "medium",
        recommendedTeam: "content",
      },
      previousOutputs: { "theme-synthesizer": themeOut ?? {} },
    },
    (out) => {
      const id = typeof out.issueId === "string" ? out.issueId : "—";
      const url = typeof out.issueUrl === "string" ? out.issueUrl.slice(0, 40) : "—";
      return `id=${id} url=${url}`;
    },
  );

  // ---- summary --------------------------------------------------------
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${passed}/${total} passed.`);
  if (passed < total) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.ok)) {
      console.log(`  - ${r.persona}: ${r.error}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Harness error:", err);
  process.exit(1);
});
