/* eslint-disable */
import { desc } from "drizzle-orm";
import { db, schema } from "./_script-db";

const runs = db
  .select()
  .from(schema.workflowRuns)
  .orderBy(desc(schema.workflowRuns.startedAt))
  .limit(5)
  .all();

console.log("=== recent runs ===");
for (const r of runs) {
  console.log(
    JSON.stringify(
      {
        id: r.id,
        state: r.state,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        errorMessage: r.errorMessage,
        prompt: typeof r.prompt === "string" ? r.prompt.slice(0, 200) : r.prompt,
      },
      null,
      2,
    ),
  );
}

const approvals = db
  .select()
  .from(schema.approvalRequests)
  .orderBy(desc(schema.approvalRequests.createdAt))
  .limit(5)
  .all();

console.log("\n=== recent approvals ===");
for (const a of approvals) {
  console.log(
    JSON.stringify(
      {
        id: a.id,
        workflowRunId: a.workflowRunId,
        artifactType: a.artifactType,
        status: a.status,
        reason: a.reason,
        createdAt: a.createdAt,
      },
      null,
      2,
    ),
  );
}

const events = db
  .select()
  .from(schema.activityEvents)
  .orderBy(desc(schema.activityEvents.timestamp))
  .limit(15)
  .all();

console.log("\n=== last 15 activity events ===");
for (const e of events) {
  console.log(
    `${new Date(e.timestamp).toISOString()} run=${e.workflowRunId.slice(0, 8)} node=${e.nodeId ?? "-"} ${e.type}`,
  );
}

// Drill into the most recent run that completed: dump ALL events
const runId = "3d337ad7-ee57-4613-b3cd-384ed0c2e183";

const allEvents = db
  .select()
  .from(schema.activityEvents)
  .where(require("drizzle-orm").eq(schema.activityEvents.workflowRunId, runId))
  .orderBy(schema.activityEvents.timestamp)
  .all();
console.log(`\n=== all ${allEvents.length} events for run ${runId.slice(0, 8)} (chronological) ===`);
for (const e of allEvents) {
  console.log(
    `${new Date(e.timestamp).toISOString()} node=${(e.nodeId ?? "-").padEnd(20)} ${e.type}`,
  );
}

// Show persisted plan
const runRow = db
  .select()
  .from(schema.workflowRuns)
  .where(require("drizzle-orm").eq(schema.workflowRuns.id, runId))
  .get();
if (runRow?.plan) {
  console.log("\n=== persisted plan tasks ===");
  const plan = runRow.plan as { tasks?: Array<{ id: string; specialistId: string; dependsOn?: string[]; triggerRule?: string }> };
  for (const t of plan.tasks ?? []) {
    console.log(
      `  ${t.id.padEnd(30)} persona=${t.specialistId.padEnd(20)} deps=[${(t.dependsOn ?? []).join(",")}] trigger=${t.triggerRule ?? "all_success"}`,
    );
  }
}
const completed = db
  .select()
  .from(schema.activityEvents)
  .where(
    require("drizzle-orm").and(
      require("drizzle-orm").eq(schema.activityEvents.workflowRunId, runId),
      require("drizzle-orm").eq(schema.activityEvents.type, "persona_completed"),
    ),
  )
  .all();

console.log(`\n=== persona_completed payloads for run ${runId} ===`);
for (const e of completed) {
  console.log(`\n--- ${e.nodeId} ---`);
  const out = (e.payload as { output?: Record<string, unknown> })?.output;
  if (!out) {
    console.log("(no output)");
    continue;
  }
  // Print compact summary + critical approval-relevant fields
  console.log("approvalStatus:", out.approvalStatus);
  console.log("error:", out.error);
  console.log("title:", out.title);
  console.log("id:", out.id);
  if (e.nodeId === "geo-editor") {
    console.log("--- FULL geo-editor output keys ---");
    console.log(Object.keys(out));
  }
}
