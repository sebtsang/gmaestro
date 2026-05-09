/**
 * OAuth callback for Composio Connect Link.
 *
 * After the user finishes OAuth in the popup, Composio redirects here with
 * query params describing the result. We upsert a row in the local
 * `connections` table, then return a tiny self-closing HTML page that
 * postMessages the parent window so the connections grid re-renders.
 *
 * Composio's actual callback contract sends `connectedAccountId` + `status`;
 * we accept either that or our own `toolkit` query param if Session 2's
 * connect helper passes one explicitly.
 */

import { eq, and } from "drizzle-orm";
import { db, schema } from "@/lib/state/db";
import type { ConnectionStatus } from "@/lib/shared/types";
import { getComposio } from "@/lib/tools/composio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_ID = process.env.GMAESTRO_USER_ID ?? "default";

function pickStatus(raw: string | null): ConnectionStatus {
  switch (raw) {
    case "ACTIVE":
    case "active":
    case "connected":
      return "connected";
    case "FAILED":
    case "failed":
      return "failed";
    case "REVOKED":
    case "revoked":
      return "revoked";
    default:
      return "pending";
  }
}

/**
 * Composio's redirect lies — it sends status="INITIALIZING" or omits the param
 * even when the OAuth completed. Source-of-truth is composio.connectedAccounts.list().
 * Poll for up to ~6s on first arrival to catch the propagation delay; fall back
 * to whatever the redirect said if Composio's API is also slow.
 */
async function fetchCanonicalStatus(
  toolkit: string,
): Promise<{ status: ConnectionStatus; connectedAccountId: string | null }> {
  try {
    const composio = getComposio();
    for (let attempt = 0; attempt < 4; attempt++) {
      const resp = await composio.connectedAccounts.list({
        userIds: [USER_ID],
        toolkitSlugs: [toolkit.toLowerCase()],
      });
      const items =
        (resp as { items?: Array<{ id: string; status: string }> }).items ?? [];
      const active = items.find((i) => i.status === "ACTIVE");
      if (active) {
        return { status: "connected", connectedAccountId: active.id };
      }
      // No ACTIVE yet — wait a beat and re-poll. ~1.5s × 4 = 6s max.
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
    }
  } catch {
    // Network / API blip — fall back to redirect's claim.
  }
  return { status: "pending", connectedAccountId: null };
}

function htmlResponse(toolkit: string, status: ConnectionStatus): Response {
  const safeToolkit = toolkit.replace(/[^A-Za-z0-9_]/g, "");
  const safeStatus = status.replace(/[^a-z]/g, "");
  const body = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Connected · GMaestro</title>
    <style>
      body { font-family: ui-sans-serif, system-ui; padding: 32px; color: #111; }
      .ok { color: #047857; }
      .fail { color: #be123c; }
      pre { font-size: 12px; color: #6b7280; }
    </style>
  </head>
  <body>
    <h2 class="${safeStatus === "connected" ? "ok" : "fail"}">
      ${safeStatus === "connected" ? "Connected." : "Hmm — that didn't go through."}
    </h2>
    <p>You can close this tab and return to GMaestro.</p>
    <pre>toolkit: ${safeToolkit}\nstatus: ${safeStatus}</pre>
    <script>
      try {
        if (window.opener && !window.opener.closed) {
          window.opener.postMessage(
            { type: "composio:connected", toolkit: ${JSON.stringify(safeToolkit)}, status: ${JSON.stringify(safeStatus)} },
            "*",
          );
        }
      } catch (e) {}
      setTimeout(() => { try { window.close(); } catch (e) {} }, 600);
    </script>
  </body>
</html>`;
  return new Response(body, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const toolkit = (
    url.searchParams.get("toolkit") ??
    url.searchParams.get("appName") ??
    ""
  ).toUpperCase();
  const redirectAccountId =
    url.searchParams.get("connectedAccountId") ??
    url.searchParams.get("connection_id") ??
    null;
  const rawStatus =
    url.searchParams.get("status") ??
    url.searchParams.get("connection_status") ??
    "ACTIVE";
  const errorMessage = url.searchParams.get("errorMessage");

  if (!toolkit) {
    return htmlResponse("", "failed");
  }

  // Composio's redirect frequently arrives before the connection has flipped
  // to ACTIVE in their store, and the status query param is unreliable. Ask
  // Composio's API for the canonical state. Falls back to the redirect's
  // claim if the API is unreachable.
  const canonical = await fetchCanonicalStatus(toolkit);
  const status =
    canonical.status === "pending" ? pickStatus(rawStatus) : canonical.status;
  const connectedAccountId = canonical.connectedAccountId ?? redirectAccountId;

  // Upsert: if a row already exists for (userId, toolkit), update it.
  const existing = await db
    .select({ id: schema.connections.id })
    .from(schema.connections)
    .where(
      and(
        eq(schema.connections.userId, USER_ID),
        eq(schema.connections.toolkit, toolkit),
      ),
    )
    .limit(1);

  const now = new Date();
  if (existing.length === 0) {
    await db.insert(schema.connections).values({
      id: `conn_${toolkit.toLowerCase()}_${now.getTime().toString(36)}`,
      userId: USER_ID,
      toolkit,
      connectedAccountId,
      status,
      errorMessage,
      connectedAt: status === "connected" ? now : null,
    });
  } else {
    await db
      .update(schema.connections)
      .set({
        connectedAccountId,
        status,
        errorMessage,
        connectedAt: status === "connected" ? now : null,
      })
      .where(eq(schema.connections.id, existing[0].id));
  }

  return htmlResponse(toolkit, status);
}
