/**
 * Inserts a test OutreachDraft approval row populated with rich `_leadContext`
 * and `_upstreamOutputs` so you can verify the approval card's "Who this is
 * for" + "Why this draft" sections without waiting on a 5-minute smoke run.
 *
 *   pnpm tsx scripts/_insert_test_approval.ts
 *
 * Cleanup: `sqlite3 ~/.gmaestro/gmaestro.db "delete from approval_requests
 * where artifact_id='draft_test_rawmsg'"`.
 */

import Database from "better-sqlite3";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import path from "node:path";

const dbPath = path.join(homedir(), ".gmaestro/gmaestro.db");
const db = new Database(dbPath);

const proposed = {
  id: "draft_test_rawmsg",
  leadId: "seed-lead-001",
  channel: "email",
  subject: "saw the HN comment — fintech infra angle",
  body: "hey jordan,\n\nsaw your note about the fintech infra pain on the launch thread — exactly the workload we keep hearing from B2B SaaS folks. no pitch, just curious if a 15-min call this week is worth it for you?\n\n— Aaron",
  to: "jordan.lee+0@anvil.example",
  rationale:
    "Direct reference to the rawMessage HN-launch + fintech-SaaS detail; soft 15-min CTA matching the inbound_form source.",
  _leadContext: {
    leadId: "seed-lead-001",
    email: "jordan.lee+0@anvil.example",
    name: "Jordan Lee",
    company: "Anvil",
    source: "inbound_form",
    rawMessage:
      "Saw your launch on HN — would love a demo. We're a B2B SaaS in fintech.",
  },
  _upstreamOutputs: {
    qualifier: {
      tier: "warm",
      fitScore: 7,
      intentSignals: [
        "explicitly asked for a demo",
        "mentioned fintech-SaaS context",
      ],
    },
    strategist: {
      tier: "warm",
      angle: "fintech-infra alignment",
      callToAction: "book_call",
      customHooks: [
        "HN-launch reference",
        "fintech-SaaS workload alignment",
      ],
    },
  },
};

const runId = (
  db.prepare("select id from workflow_runs limit 1").get() as
    | { id: string }
    | undefined
)?.id;
if (!runId) {
  console.error(
    "no workflow_runs rows — run a smoke first or seed a workflow_run",
  );
  process.exit(1);
}

const id = randomUUID();
db.prepare(
  "insert into approval_requests (id, workflow_run_id, artifact_type, artifact_id, blast_radius, reason, proposed_action, status, created_at) values (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
).run(
  id,
  runId,
  "OutreachDraft",
  "draft_test_rawmsg",
  "external",
  "Send Gmail draft to a real prospect.",
  JSON.stringify(proposed),
  Date.now(),
);
console.log("inserted approval", id);
