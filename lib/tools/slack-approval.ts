/**
 * Slack approval DM helper.
 *
 * When the Approval Gate (Session 1) creates an `ApprovalRequest`, it can
 * (optionally) ping the founder on Slack with a one-line summary + link to
 * the dashboard. This is a deterministic action — no LLM in the loop — so we
 * call Composio directly via `composio.tools.execute()` instead of routing
 * through Claude Agent SDK + MCP.
 */

import "server-only";
import { getComposio, withRateLimit } from "./composio";
import { env } from "@/lib/shared/env";
import type { ApprovalRequest } from "@/lib/shared/types";

/**
 * DM the founder on Slack with the approval summary + link.
 *
 * @param founderSlackUserId  Slack user ID (`U…`) or channel ID (`C…`/`D…`).
 * @param approval            The approval request we want to surface.
 * @param dashboardUrl        Optional override; defaults to env.GMAESTRO_BASE_URL.
 */
export async function sendApprovalDM(
  founderSlackUserId: string,
  approval: ApprovalRequest,
  dashboardUrl?: string,
): Promise<void> {
  const composio = getComposio();
  const url = dashboardUrl ?? env().GMAESTRO_BASE_URL;
  const text = formatApprovalText(approval, url);

  await withRateLimit("SLACK_SEND_MESSAGE", async () => {
    await composio.tools.execute("SLACK_SEND_MESSAGE", {
      userId: env().GMAESTRO_USER_ID,
      arguments: {
        channel: founderSlackUserId,
        text,
      },
    });
  });
}

function formatApprovalText(a: ApprovalRequest, dashboardUrl: string): string {
  return [
    `*GMaestro needs your approval* (${a.blastRadius})`,
    `Artifact: ${a.artifactType} — ${a.reason}`,
    `Review & decide: ${dashboardUrl}/approvals/${a.id}`,
  ].join("\n");
}
