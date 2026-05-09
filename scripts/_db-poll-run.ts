/**
 * Poll the workflow_runs / workflow_nodes tables for a run id and report
 * status histograms until terminal. Bypasses the missing GET /api/runs/[id]
 * route by reading SQLite directly via the script-local db client.
 */

import { count, eq } from "drizzle-orm";
import { db, schema } from "./_script-db";

const runId = process.argv[2];
if (!runId) {
  console.error("usage: tsx scripts/_db-poll-run.ts <runId>");
  process.exit(2);
}

async function main() {
  let prev = "";
  const start = Date.now();

  while (true) {
    const run = db
      .select({
        state: schema.workflowRuns.state,
        errorMessage: schema.workflowRuns.errorMessage,
      })
      .from(schema.workflowRuns)
      .where(eq(schema.workflowRuns.id, runId))
      .get();

    if (!run) {
      console.log(`run not found yet (id=${runId})`);
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    const histo = db
      .select({ status: schema.workflowNodes.status, n: count() })
      .from(schema.workflowNodes)
      .where(eq(schema.workflowNodes.workflowRunId, runId))
      .groupBy(schema.workflowNodes.status)
      .all();

    const histoStr = histo
      .map((h) => `${h.status}=${h.n}`)
      .sort()
      .join(" ");
    const line = `[${Math.floor((Date.now() - start) / 1000)}s] state=${run.state} ${histoStr}`;
    if (line !== prev) {
      console.log(line);
      prev = line;
    }

    if (run.state === "done" || run.state === "failed") {
      if (run.errorMessage) console.log(`error: ${run.errorMessage}`);
      process.exit(run.state === "done" ? 0 : 1);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

void main();
