/* eslint-disable */
import { Composio } from "@composio/core";
import fs from "node:fs"; import os from "node:os"; import path from "node:path";
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
  const r = await c.tools.get("default", { toolkits: ["slack"], limit: 200 });
  const items = Array.isArray(r) ? r : (r as any).items ?? [];
  if (items[0]) console.log("first item keys:", Object.keys(items[0]));
  for (const t of items) {
    const slug = (t as any).function?.name ?? (t as any).slug ?? (t as any).name ?? JSON.stringify(t).slice(0, 80);
    if (/CHANNEL|CONVERSATION|LIST|USER/i.test(slug)) console.log(`  ${slug}`);
  }
  console.log(`Total: ${items.length}`);
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });
