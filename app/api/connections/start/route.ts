import { NextResponse } from "next/server";
import {
  generateConnectLink,
  IntegrationNotConfiguredError,
} from "@/lib/tools/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Mints a Composio Connect Link OAuth URL for the given toolkit and returns
 * `{ redirectUrl }` for the dashboard to open in a popup.
 *
 * The URL is single-use — calling this again mints a fresh one. Composio's
 * callback hits /api/composio/callback which upserts the `connections` row.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const toolkit = url.searchParams.get("toolkit");
  if (!toolkit) {
    return NextResponse.json(
      { error: "Missing required ?toolkit query param" },
      { status: 400 },
    );
  }

  const userId = process.env.GMAESTRO_USER_ID ?? "default";

  try {
    const redirectUrl = await generateConnectLink(userId, toolkit);
    return NextResponse.json({ redirectUrl });
  } catch (err) {
    if (err instanceof IntegrationNotConfiguredError) {
      return NextResponse.json(
        { error: err.message, toolkit: err.toolkit },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/connections/start] failed for ${toolkit}:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
