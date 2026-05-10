/* eslint-disable */
/**
 * One-off: hit Firecrawl with the same args our company-fetch uses, dump
 * the raw response so we can see what it actually returns for the failing
 * Composio docs URL.
 */

import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const URL = process.argv[2] ?? "https://docs.composio.dev/toolkits/firecrawl";

async function main() {
  let key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    const credsPath = path.join(os.homedir(), ".composio", "anonymous_user_data.json");
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
      key = creds?.composio?.api_key;
    }
  }
  if (!key) {
    const envPath = path.join(os.homedir(), ".gmaestro", ".env");
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, "utf-8");
      const m = envText.match(/^COMPOSIO_API_KEY=(.+)$/m);
      if (m) key = m[1].replace(/^["']|["']$/g, "");
    }
  }
  if (!key) {
    console.error("No COMPOSIO_API_KEY available.");
    process.exit(1);
  }

  const composio = new Composio({ apiKey: key });
  const userId = process.env.GMAESTRO_USER_ID ?? "default";

  // Three call variants to isolate the lookup mechanism:
  const variants: Array<{ label: string; opts: Record<string, unknown> }> = [
    {
      label: "userId='default' only (current code path)",
      opts: { userId, arguments: { url: URL, formats: ["markdown"] } },
    },
    {
      label: "userId + connectedAccountId='ca_dKdOhUkXJoMY' (force the default-user connection)",
      opts: {
        userId,
        connectedAccountId: "ca_dKdOhUkXJoMY",
        arguments: { url: URL, formats: ["markdown"] },
      },
    },
    {
      label: "connectedAccountId only, no userId",
      opts: {
        connectedAccountId: "ca_dKdOhUkXJoMY",
        arguments: { url: URL, formats: ["markdown"] },
      },
    },
  ];

  for (const v of variants) {
    console.log(`\n=== ${v.label} ===`);
    const start = Date.now();
    try {
      const r = (await composio.tools.execute("FIRECRAWL_SCRAPE", {
        ...v.opts,
        dangerouslySkipVersionCheck: true,
      } as never)) as Record<string, unknown>;
      const elapsed = Date.now() - start;
      console.log(`OK in ${elapsed}ms — top-level keys: ${Object.keys(r).join(",")}`);
      const md = (r.markdown ?? (r.data as Record<string, unknown>)?.markdown ?? r.content) as string | undefined;
      if (md) console.log(`  markdown len: ${md.length} chars; first 200: ${md.slice(0, 200)}`);
    } catch (err) {
      const elapsed = Date.now() - start;
      const e = err as { message?: string; cause?: { error?: { error?: { message?: string } } } };
      const inner = e.cause?.error?.error?.message ?? e.message;
      console.log(`FAIL in ${elapsed}ms — ${inner}`);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
