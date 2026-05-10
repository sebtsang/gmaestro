/* eslint-disable */
/**
 * Diagnostic + repair: delete all firecrawl connections, then create a fresh
 * one bound to userId="default" with the user-supplied API key, then prove
 * tools.execute works.
 */
import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  let key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    const envPath = path.join(os.homedir(), ".gmaestro", ".env");
    if (fs.existsSync(envPath)) {
      const m = fs.readFileSync(envPath, "utf-8").match(/^COMPOSIO_API_KEY=(.+)$/m);
      if (m) key = m[1].replace(/^["']|["']$/g, "");
    }
  }
  if (!key) {
    console.error("No COMPOSIO_API_KEY available.");
    process.exit(1);
  }
  const fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) {
    console.error("FIRECRAWL_API_KEY env var required.");
    process.exit(1);
  }

  const userId = "default";
  const authConfigId = "ac_X_lMXeDzr7EF";
  const composio = new Composio({ apiKey: key });

  console.log("=== Step 1: list and delete all firecrawl connections ===");
  const list = await composio.connectedAccounts.list({ toolkitSlugs: ["firecrawl"] });
  console.log(`Found ${list.items.length} existing connections.`);
  for (const c of list.items) {
    console.log(`  Deleting ${c.id}...`);
    await composio.connectedAccounts.delete(c.id);
  }
  console.log("All cleared.");

  // Brief delay to let Composio's index settle.
  await new Promise((r) => setTimeout(r, 1500));

  console.log("\n=== Step 2: create fresh connection bound to userId=default ===");
  const req = await composio.connectedAccounts.initiate(userId, authConfigId, {
    config: {
      authScheme: "API_KEY",
      val: { generic_api_key: fcKey },
    },
  } as never);
  console.log(`Initiated: id=${req.id} status=${req.status}`);

  const connected = await composio.connectedAccounts.waitForConnection(req.id, 30_000);
  console.log(`Connected: id=${connected.id} status=${connected.status}`);

  console.log("\n=== Step 3: smoke-test FIRECRAWL_SCRAPE ===");
  const start = Date.now();
  try {
    const r = (await composio.tools.execute("FIRECRAWL_SCRAPE", {
      userId,
      arguments: {
        url: "https://docs.composio.dev/toolkits/firecrawl",
        formats: ["markdown"],
        waitFor: 5000,
        onlyMainContent: true,
      },
      dangerouslySkipVersionCheck: true,
    } as never)) as Record<string, unknown>;
    const elapsed = Date.now() - start;
    console.log(`OK in ${elapsed}ms; top-level keys: ${Object.keys(r).join(",")}`);
    console.log(`successful: ${r.successful}`);
    console.log(`error: ${JSON.stringify(r.error)}`);
    console.log(`data keys: ${r.data && typeof r.data === "object" ? Object.keys(r.data).join(",") : "(not object)"}`);
    console.log(`raw response (first 1500 chars):`);
    console.log(JSON.stringify(r, null, 2).slice(0, 1500));
  } catch (err) {
    const elapsed = Date.now() - start;
    const e = err as { message?: string };
    console.error(`FAIL in ${elapsed}ms — ${e.message}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
