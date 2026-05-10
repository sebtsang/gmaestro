/* eslint-disable */
import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

async function main() {
  let key = process.env.COMPOSIO_API_KEY;
  if (!key) {
    const ep = path.join(os.homedir(), ".gmaestro", ".env");
    if (fs.existsSync(ep)) {
      const m = fs.readFileSync(ep, "utf-8").match(/^COMPOSIO_API_KEY=(.+)$/m);
      if (m) key = m[1].replace(/^["']|["']$/g, "");
    }
  }
  const c = new Composio({ apiKey: key });
  const list = await c.connectedAccounts.list({ toolkitSlugs: ["slack"], userIds: ["default"] });
  console.log(`Slack connections for userId="default": ${list.items.length}`);
  for (const x of list.items) console.log(`  ${x.id} status=${x.status}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
