/**
 * Reset the local demo state to a known seed.
 *
 *   pnpm tsx scripts/reset-demo.ts
 *
 * Truncates everything that accumulates during a run (workflow_runs cascades
 * to nodes / events / approvals via FK), the lead pipeline tables, and trial
 * data. Then re-runs the seed script. Target: <5s end to end.
 */

import { db, schema, sqlite } from "./_script-db";
import { spawnSync } from "node:child_process";
import path from "node:path";

const TABLES_TO_CLEAR: string[] = [
  // workflow_runs deletes cascade through the FK chain to nodes/events/approvals.
  "workflow_runs",
  "founder_voice_edits",
  "outreach_drafts",
  "outreach_strategies",
  "qualified_leads",
  "enriched_leads",
  "booked_meetings",
  "prep_briefs",
  "activation_nudges",
  "trial_signals",
  "voice_samples",
  "leads",
  // Connections persist across resets — don't blow them away.
];

function main() {
  console.time("reset-demo");

  // Use raw SQL via better-sqlite3 for speed. Drizzle's delete() works too,
  // but a single PRAGMA + DELETE batch wrapped in a transaction is a few ms
  // faster on a real disk.
  const tx = sqlite.transaction(() => {
    sqlite.pragma("foreign_keys = ON");
    for (const table of TABLES_TO_CLEAR) {
      sqlite.prepare(`DELETE FROM ${table}`).run();
    }
  });
  tx();

  // sanity probe
  const remainingRuns = db.select().from(schema.workflowRuns).all().length;
  if (remainingRuns !== 0) {
    throw new Error(
      `Expected 0 workflow_runs after reset, got ${remainingRuns}`,
    );
  }

  // Re-seed by invoking the sibling script as a child so its console output
  // shows up cleanly. spawnSync keeps timing accurate.
  const seedPath = path.join(process.cwd(), "scripts", "seed-demo.ts");
  const result = spawnSync("pnpm", ["tsx", seedPath], {
    stdio: "inherit",
    env: { ...process.env },
  });
  if (result.status !== 0) {
    throw new Error(`seed-demo exited with ${result.status}`);
  }

  console.timeEnd("reset-demo");
}

try {
  main();
  process.exit(0);
} catch (err) {
  console.error(err);
  process.exit(1);
}
