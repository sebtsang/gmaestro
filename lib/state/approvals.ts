import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import type {
  ApprovalArtifactType,
  ApprovalRequest,
  ApprovalStatus,
  BlastRadius,
} from "@/lib/shared/types";

const POLL_INTERVAL_MS = 500;
const DEFAULT_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

type ResolvableStatus = Exclude<ApprovalStatus, "pending">;

export interface RaiseApprovalParams {
  workflowRunId: string;
  artifactType: ApprovalArtifactType;
  artifactId: string;
  blastRadius: BlastRadius;
  reason: string;
  proposedAction: Record<string, unknown>;
}

function rowToApprovalRequest(
  row: typeof schema.approvalRequests.$inferSelect,
): ApprovalRequest {
  return {
    id: row.id,
    workflowRunId: row.workflowRunId,
    artifactType: row.artifactType,
    artifactId: row.artifactId,
    blastRadius: row.blastRadius,
    reason: row.reason,
    proposedAction: row.proposedAction,
    status: row.status,
    founderNotes: row.founderNotes,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? null,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function raiseApproval(
  params: RaiseApprovalParams,
): Promise<string> {
  const id = randomUUID();
  await db.insert(schema.approvalRequests).values({
    id,
    workflowRunId: params.workflowRunId,
    artifactType: params.artifactType,
    artifactId: params.artifactId,
    blastRadius: params.blastRadius,
    reason: params.reason,
    proposedAction: params.proposedAction,
    status: "pending",
  });
  return id;
}

async function readApproval(approvalId: string): Promise<ApprovalRequest> {
  const rows = await db
    .select()
    .from(schema.approvalRequests)
    .where(eq(schema.approvalRequests.id, approvalId))
    .limit(1);
  if (rows.length === 0) {
    throw new Error(`Approval ${approvalId} not found`);
  }
  return rowToApprovalRequest(rows[0]);
}

export async function awaitApproval(
  approvalId: string,
  opts: { timeoutMs?: number } = {},
): Promise<ApprovalRequest> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  while (true) {
    const current = await readApproval(approvalId);
    if (current.status !== "pending") {
      return current;
    }
    if (Date.now() >= deadline) {
      await resolveApproval(
        approvalId,
        "expired",
        undefined,
        "auto-expired after timeout",
      );
      return readApproval(approvalId);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export async function resolveApproval(
  approvalId: string,
  status: ResolvableStatus,
  edits?: string,
  founderNotes?: string,
): Promise<void> {
  // The approval row only stores `founderNotes`. Caller-supplied `edits`
  // belong on the artifact (e.g. outreach_drafts.founder_edits) and Session 2
  // wires that up — we surface `edits` in the API for symmetry with the Zod
  // schema and merge it into the notes if no notes were provided.
  const notes = founderNotes ?? (edits ? `edits: ${edits}` : null);
  await db
    .update(schema.approvalRequests)
    .set({
      status,
      founderNotes: notes,
      resolvedAt: new Date(),
    })
    .where(eq(schema.approvalRequests.id, approvalId));
}

export async function getApproval(
  approvalId: string,
): Promise<ApprovalRequest | null> {
  try {
    return await readApproval(approvalId);
  } catch {
    return null;
  }
}
