import { NextResponse } from "next/server";
import { RunWorkflowRequestSchema } from "@/lib/shared/schemas";
import { createRun, markRunFailed, runWorkflow } from "@/lib/state/workflows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
