/**
 * OAuth callback for Composio Connect Link.
 *
 * After the user finishes OAuth in the popup, Composio redirects here with
 * query params describing the result. We do NOT mirror state into a local
 * table — Composio's `connectedAccounts.list` is the source of truth (read
 * via `lib/tools/connections.ts`). What this handler DOES do:
 *
 *   1. Poll Composio for the canonical post-OAuth status (their redirect
 *      arrives before the connection flips to ACTIVE in their store, so the
 *      status query param is unreliable).
 *   2. Once we have the new ACTIVE connected_account id, call
 *      `connectedAccounts.delete()` for every other (EXPIRED, FAILED,
 *      stale INITIALIZING) record on the same (userId, toolkit) pair —
 *      keeps Composio tidy and keeps `getConnectionStatuses()` from picking
 *      up confusing leftovers.
 *   3. Invalidate the in-process connection cache so the next dashboard
 *      render hits Composio for fresh state.
 *   4. Return a self-closing HTML page that postMessages the parent window
 *      so the connections grid re-renders.
 */

import { getComposio } from "@/lib/tools/composio";
import { invalidateConnections } from "@/lib/tools/connections";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USER_ID = process.env.GMAESTRO_USER_ID ?? "default";

type CallbackStatus = "connected" | "pending" | "failed" | "revoked";

function pickStatusFromRedirect(raw: string | null): CallbackStatus {
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
 * Composio's redirect lies — it sends status="INITIALIZING" or omits the
 * param even when the OAuth completed. Source of truth is
 * `composio.connectedAccounts.list()`. Poll for up to ~6s on first arrival
 * to catch the propagation delay; fall back to the redirect's claim if
 * Composio's API is also slow.
 *
 * Returns the WHOLE list (not just the active one) so the caller can use
 * it to drive stale-record cleanup without a second API call.
 */
async function fetchCanonicalState(toolkit: string): Promise<{
  status: CallbackStatus;
  active: { id: string } | null;
  all: Array<{ id: string; status: string }>;
}> {
  try {
    const composio = getComposio();
    let lastItems: Array<{ id: string; status: string }> = [];
    for (let attempt = 0; attempt < 4; attempt++) {
      const resp = await composio.connectedAccounts.list({
        userIds: [USER_ID],
        toolkitSlugs: [toolkit.toLowerCase()],
      });
      lastItems =
        (resp as { items?: Array<{ id: string; status: string }> }).items ?? [];
      const active = lastItems.find((i) => i.status === "ACTIVE");
      if (active) {
        return { status: "connected", active, all: lastItems };
      }
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500));
    }
    return { status: "pending", active: null, all: lastItems };
  } catch {
    return { status: "pending", active: null, all: [] };
  }
}

/**
 * After a successful reconnect, prune EVERY other connected_account record
 * for the same (userId, toolkit) pair. Without this, Composio accumulates
 * INITIALIZING/EXPIRED/FAILED records over time — `connectedAccounts.list`
 * keeps returning them, our picker has to do best-of-status logic, and a
 * subtle bug surface stays open.
 *
 * Failures are swallowed (with a warn). Worst case: stale records linger
 * one more reconnect cycle, the founder sees no behavioral difference.
 */
async function deleteStaleAccounts(
  toolkit: string,
  keepId: string,
  all: Array<{ id: string; status: string }>,
): Promise<void> {
  const stale = all.filter((i) => i.id !== keepId);
  if (stale.length === 0) return;
  const composio = getComposio();
  await Promise.all(
    stale.map(async (s) => {
      try {
        await composio.connectedAccounts.delete(s.id);
      } catch (err) {
        console.warn(
          `[callback:${toolkit}] failed to delete stale account ${s.id} (${s.status}): ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }),
  );
}

function htmlResponse(toolkit: string, status: CallbackStatus): Response {
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
  const rawStatus =
    url.searchParams.get("status") ??
    url.searchParams.get("connection_status") ??
    "ACTIVE";

  if (!toolkit) {
    return htmlResponse("", "failed");
  }

  // Ask Composio for canonical state (their redirect's status is unreliable).
  const canonical = await fetchCanonicalState(toolkit);
  const status =
    canonical.status === "pending"
      ? pickStatusFromRedirect(rawStatus)
      : canonical.status;

  // If a fresh ACTIVE landed, prune every other record for this toolkit so
  // the list response stops pumping out stale INITIALIZING/EXPIRED leftovers.
  if (canonical.active) {
    await deleteStaleAccounts(toolkit, canonical.active.id, canonical.all);
  }

  // Drop the in-process cache so the next dashboard render fetches fresh
  // state instead of serving the pre-OAuth miss.
  invalidateConnections(USER_ID);

  return htmlResponse(toolkit, status);
}
