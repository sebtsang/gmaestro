/* eslint-disable */
/**
 * Creates a Firecrawl connected account bound to userId="default" using a
 * Firecrawl API key.
 *
 * Why this exists: Firecrawl uses API_KEY auth, not OAuth, so the dashboard's
 * "Connect" button (which assumes a redirect URL) doesn't apply. Connections
 * created via the Composio dashboard playground are NOT bound to a userId, so
 * `tools.execute({ userId: "default", ... })` returns code 1810 "No connected
 * account found for user ID default for toolkit firecrawl". This script
 * creates a properly user-bound connection so persona fetches succeed.
 *
 * Usage:
 *   FIRECRAWL_API_KEY=fc-xxxxx pnpm tsx scripts/connect-firecrawl.ts
 *
 * Or run interactively (the script will prompt):
 *   pnpm tsx scripts/connect-firecrawl.ts
 *
 * Get an API key from: https://firecrawl.dev/app/api-keys
 */
import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

async function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

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

  let fcKey = process.env.FIRECRAWL_API_KEY;
  if (!fcKey) {
    console.log("Get an API key from https://firecrawl.dev/app/api-keys");
    fcKey = await promptHidden("Paste your Firecrawl API key (fc-...): ");
  }
  if (!fcKey || !fcKey.startsWith("fc-")) {
    console.error("Invalid Firecrawl key (should start with 'fc-').");
    process.exit(1);
  }

  const userId = process.env.GMAESTRO_USER_ID ?? "default";
  const authConfigId = "ac_X_lMXeDzr7EF"; // firecrawl

  const composio = new Composio({ apiKey: key });

  console.log(`Creating Firecrawl connection for userId="${userId}"...`);
  const req = await composio.connectedAccounts.initiate(userId, authConfigId, {
    config: {
      authScheme: "API_KEY",
      val: { generic_api_key: fcKey },
    },
  } as never);

  console.log(`Initiated: id=${req.id} status=${req.status}`);

  // For API_KEY toolkits the connection should go ACTIVE immediately.
  console.log("Waiting for ACTIVE status...");
  const connected = await composio.connectedAccounts.waitForConnection(req.id, 30_000);
  console.log(`Connected account: id=${connected.id} status=${connected.status}`);

  // Now smoke-test by hitting the tool
  console.log("\nSmoke testing FIRECRAWL_SCRAPE...");
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
    console.log(`SCRAPE OK in ${elapsed}ms; top-level keys: ${Object.keys(r).join(",")}`);
    const data = r.data as Record<string, unknown> | undefined;
    const md = (r.markdown ?? data?.markdown ?? r.content) as string | undefined;
    console.log(`markdown length: ${md ? md.length : 0}`);
  } catch (err) {
    const elapsed = Date.now() - start;
    console.error(`SCRAPE FAIL in ${elapsed}ms`, err);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
