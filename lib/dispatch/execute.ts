/**
 * Post-approval action dispatcher.
 *
 * When the founder clicks "Approve & send via <provider>" on an approval card,
 * the API route resolves the approval (marks it approved in SQLite) and then
 * invokes `executeProviderAction()` here. We:
 *
 *   1. Look up the provider entry for this (artifactType, toolkit) pair from
 *      `lib/dispatch/providers.ts` — fail fast on unknown providers.
 *   2. Build the Composio action arguments from `approval.proposedAction`,
 *      preferring any founder edits the approval carries.
 *   3. Call `composio.tools.execute(action, { userId, arguments })` directly
 *      — NOT via MCP, NOT via an LLM loop. Deterministic.
 *   4. Stamp `sentAt` on the typed artifact (e.g. outreach_drafts.sent_at).
 *   5. Emit a `tool_call_executed` bus event so the activity feed shows the
 *      Composio call landing — same event type the (now-removed) canUseTool
 *      wrapping used; this is where the chain-of-command visualization is
 *      supposed to fire from in the new architecture.
 *
 * Errors are categorized so the API route can return a useful HTTP status:
 *   - 502 for upstream auth failures (token expired) → triggers "reconnect"
 *     toast on the approval card.
 *   - 500 for unknown errors.
 */

import "server-only";
import { eq } from "drizzle-orm";
import type { ApprovalRequest } from "@/lib/shared/types";
import { db, schema } from "@/lib/state/db";
import { eventBus } from "@/lib/realtime/bus";
import { getComposio } from "@/lib/tools/composio";
import { findProvider } from "./providers";

export type DispatchResult =
  | { ok: true; output: unknown }
  | { ok: false; error: string; status: 400 | 502 | 500 };

export async function executeProviderAction(
  approval: ApprovalRequest,
  provider: string,
  userId: string,
): Promise<DispatchResult> {
  const match = findProvider(approval.artifactType, provider);
  if (!match) {
    return {
      ok: false,
      status: 400,
      error: `No provider "${provider}" configured for artifact ${approval.artifactType}`,
    };
  }

  const proposed = mergeFounderEdits(approval);
  const args = match.buildArgs(proposed);

  // Validate the action has the inputs it needs before we hit Composio.
  // Some artifacts arrive without their recipient/timestamp populated when
  // upstream personas degraded; better to 400 with a clear message than to
  // ship a half-formed Composio call and read its provider-specific error.
  const missing = Object.entries(args)
    .filter(([, v]) => v == null || v === "")
    .map(([k]) => k);
  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      error: `Cannot dispatch ${match.action}: missing required field(s) ${missing.join(", ")}`,
    };
  }

  let output: unknown;
  try {
    const composio = getComposio();
    output = await composio.tools.execute(match.action, {
      userId,
      arguments: args,
      // Composio's manual execute path rejects "latest" toolkit versions
      // unless this flag is set or a concrete version is pinned. Pinning
      // versions per provider is operationally noisy for a hackathon-scope
      // tool catalog that may grow weekly. The downside (a Composio toolkit
      // bump can break args mapping) is acceptable here — the dispatcher
      // surfaces the error cleanly and the founder can re-approve once the
      // provider mapping is updated.
      dangerouslySkipVersionCheck: true,
    });
  } catch (err) {
    const { message, isAuth } = extractComposioError(err);
    console.error(
      `[dispatch] ${match.action} via ${match.label} failed: ${message}`,
    );
    return { ok: false, status: isAuth ? 502 : 500, error: message };
  }

  await stampArtifactSent(approval).catch((err) => {
    // Sending succeeded; failure to stamp sent_at is a logging concern, not a
    // failure for the caller. Surface in console so it's debuggable.
    console.warn(
      `[dispatch] failed to stamp ${approval.artifactType}/${approval.artifactId} sentAt: ${
        err instanceof Error ? err.message : err
      }`,
    );
  });

  eventBus.emit("tool_call_executed", {
    workflowRunId: approval.workflowRunId,
    nodeId: `dispatch__${approval.id}`,
    personaId: "dispatcher",
    toolName: `mcp__composio__${match.action}`,
    outcome: "executed",
    note: `via ${match.label} after founder approval`,
  });

  return { ok: true, output };
}

/**
 * If the founder edited the draft on the approval card before approving, the
 * edits arrive as a flat string of `### key\nvalue` sections (see ApprovalCard
 * `diffDraft`). Parse that back onto the proposedAction so the dispatched
 * action uses the founder's final wording, not the persona's first draft.
 */
function mergeFounderEdits(
  approval: ApprovalRequest,
): Record<string, unknown> {
  const proposed = approval.proposedAction ?? {};
  const notes = approval.founderNotes;
  if (!notes || !notes.startsWith("edits:")) return proposed;

  const editsBody = notes.slice("edits:".length).trim();
  const sections = editsBody.split(/^###\s+/m).filter(Boolean);
  const merged: Record<string, unknown> = { ...proposed };
  for (const section of sections) {
    const newlineIdx = section.indexOf("\n");
    if (newlineIdx === -1) continue;
    const key = section.slice(0, newlineIdx).trim();
    const value = section.slice(newlineIdx + 1).trim();
    if (key) merged[key] = value;
  }
  return merged;
}

async function stampArtifactSent(approval: ApprovalRequest): Promise<void> {
  if (approval.artifactType === "OutreachDraft") {
    await db
      .update(schema.outreachDrafts)
      .set({ sentAt: new Date(), approvalStatus: "approved" })
      .where(eq(schema.outreachDrafts.id, approval.artifactId));
    return;
  }
  // Other artifact tables don't yet have a "sentAt" or analogue — extend as
  // BookedMeeting/ActivationNudge dispatch lands.
}

function isAuthFailure(message: string): boolean {
  return /401|403|unauthor|expired|revoked|disconnect|not[\s_-]?connected|no\s+(connected|active)\s+(account|connection)|connectedaccount.*notfound|\b1810\b|\b1811\b/i.test(
    message,
  );
}

/**
 * Composio wraps the underlying error in `.cause` and attaches a `.code`
 * field — the surface message is often generic ("Error executing the tool
 * GMAIL_SEND_EMAIL"). Walk both to give the founder a useful toast.
 *
 * Returns `{message, isAuth}` where `message` flattens cause chain + code +
 * possibleFixes, and `isAuth` triggers the 502 + "reconnect" UX path.
 */
function extractComposioError(err: unknown): {
  message: string;
  isAuth: boolean;
} {
  if (!(err instanceof Error)) {
    const s = String(err);
    return { message: s, isAuth: isAuthFailure(s) };
  }

  const parts: string[] = [err.message];
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && code.length > 0) parts.push(`(${code})`);

  let cur: unknown = (err as { cause?: unknown }).cause;
  let depth = 0;
  while (cur instanceof Error && depth < 3) {
    parts.push(`→ ${cur.message}`);
    cur = (cur as { cause?: unknown }).cause;
    depth += 1;
  }

  const possibleFixes = (err as { possibleFixes?: unknown }).possibleFixes;
  if (Array.isArray(possibleFixes) && possibleFixes.length > 0) {
    parts.push(`Fix: ${possibleFixes[0]}`);
  }

  const message = parts.join(" ");
  const codeIndicatesAuth =
    typeof code === "string" &&
    /CONNECTED_ACCOUNT_NOT_FOUND|AUTH|EXPIRED|UNAUTHORIZED|REVOKED/i.test(code);
  return { message, isAuth: codeIndicatesAuth || isAuthFailure(message) };
}
