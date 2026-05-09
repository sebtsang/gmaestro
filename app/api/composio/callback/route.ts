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
  const connectedAccountId =
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

  const status = pickStatus(rawStatus);

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
