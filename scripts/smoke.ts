/**
 * End-to-end smoke test for the primary demo scenario.
 *
 *   pnpm gmaestro dev   # in another shell
 *   pnpm tsx scripts/smoke.ts
 *
 * POSTs the primary prompt to /api/runs (Session 1's territory), polls
 * /api/runs/[id] until done, then prints a summary of derived counts.
 *
 * NOTE: Sessions 1 + 2 must be merged for this to fully pass. Until then,
 * this script will hit a 404 on POST /api/runs and exit cleanly with a
 * "not yet wired up" message.
 */

const PRIMARY_PROMPT =
  "I'm a YC W26 founder. A handful of demo requests came in from our HN launch. Process them — short, personalized Gmail draft per lead.";

const BASE_URL = process.env.GMAESTRO_BASE_URL ?? "http://localhost:3000";
const POLL_MS = 1_000;
const MAX_WAIT_MS = 5 * 60_000;

interface RunRecord {
  id: string;
  state: string;
}

async function postRun(): Promise<RunRecord | null> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: PRIMARY_PROMPT }),
    });
  } catch (err) {
    console.error(
      `✗ Could not reach ${BASE_URL}. Is \`pnpm gmaestro dev\` running?`,
    );
    console.error(err instanceof Error ? err.message : err);
    return null;
  }

  if (res.status === 404) {
    console.warn(
      "⚠ POST /api/runs returned 404 — Session 1's orchestrator route isn't merged yet.",
    );
    return null;
  }
  if (!res.ok) {
    console.error(`✗ POST /api/runs → HTTP ${res.status}`);
    return null;
  }
  const data = (await res.json()) as RunRecord;
  return data;
}

async function pollRun(id: string): Promise<RunRecord | null> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (Date.now() < deadline) {
    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/api/runs/${id}`);
    } catch {
      await sleep(POLL_MS);
      continue;
    }
    if (res.ok) {
      const data = (await res.json()) as RunRecord;
      process.stdout.write(`\r[${data.state}]                    `);
      if (data.state === "done" || data.state === "failed") {
        process.stdout.write("\n");
        return data;
      }
    }
    await sleep(POLL_MS);
  }
  process.stdout.write("\n");
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

interface CountsResponse {
  enriched?: number;
  qualified?: number;
  drafted?: number;
  approvalsRaised?: number;
}

async function loadCounts(runId: string): Promise<CountsResponse | null> {
  // Optional endpoint that Session 1 may add later.
  try {
    const res = await fetch(`${BASE_URL}/api/runs/${runId}/counts`);
    if (!res.ok) return null;
    return (await res.json()) as CountsResponse;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`smoke → POST /api/runs at ${BASE_URL}`);
  const created = await postRun();
  if (!created) process.exit(2);

  console.log(`smoke → run id ${created.id}; polling…`);
  const final = await pollRun(created.id);
  if (!final) {
    console.error(`✗ run did not complete within ${MAX_WAIT_MS / 1000}s`);
    process.exit(1);
  }

  if (final.state !== "done") {
    console.error(`✗ run finished in state '${final.state}'`);
    process.exit(1);
  }

  const counts = await loadCounts(created.id);
  console.log("\nresult");
  console.log("──────");
  if (counts) {
    console.log(`enriched      : ${counts.enriched ?? "?"}`);
    console.log(`qualified     : ${counts.qualified ?? "?"}`);
    console.log(`drafted       : ${counts.drafted ?? "?"}`);
    console.log(`approvals     : ${counts.approvalsRaised ?? "?"}`);

    const ok =
      (counts.enriched ?? 0) >= 40 &&
      (counts.qualified ?? 0) >= 40 &&
      (counts.approvalsRaised ?? 0) >= 10;
    if (!ok) {
      console.error("✗ counts below expected thresholds");
      process.exit(1);
    }
  } else {
    console.log("(no counts endpoint — skipping threshold checks)");
  }

  console.log("\n✔ smoke OK");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
