/* eslint-disable */
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
  const composio = new Composio({ apiKey: key });
  const list = await composio.connectedAccounts.list({ toolkitSlugs: ["firecrawl"] });
  console.log(`Found ${list.items.length} firecrawl connections:`);
  for (const c of list.items) {
    console.log("\n--- raw ---");
    console.log(JSON.stringify(c, null, 2));
  }

  console.log("\n=== filtered by userIds=['default'] ===");
  const filtered = await composio.connectedAccounts.list({
    toolkitSlugs: ["firecrawl"],
    userIds: ["default"],
  });
  console.log(`Found ${filtered.items.length} for userId="default":`);
  for (const c of filtered.items) {
    console.log(`  ${c.id} status=${c.status}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
