/* eslint-disable */
/**
 * Creates a Composio-managed auth config for the Reddit toolkit, then prints
 * the id to paste into lib/shared/auth-configs.ts.
 *
 * Idempotent: if a Reddit auth config already exists for this API key, we
 * return that id instead of creating a duplicate.
 */
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
  if (!key) { console.error("No COMPOSIO_API_KEY"); process.exit(1); }

  const composio = new Composio({ apiKey: key });
  const list = await composio.authConfigs.list({ limit: 100 } as never);
  const items = (list as { items?: Array<Record<string, unknown>> }).items ?? [];
  for (const ac of items) {
    const slug = String((ac as { toolkit?: { slug?: string } }).toolkit?.slug ?? "").toLowerCase();
    if (slug === "reddit") {
      console.log(`Reddit auth config already exists: ${(ac as { id?: string }).id}`);
      return;
    }
  }

  const created = await composio.authConfigs.create("reddit", {
    name: "REDDIT",
    type: "use_composio_managed_auth",
  } as never);
  const id = (created as { id?: string }).id;
  console.log(`Created REDDIT auth config: ${id}`);
  console.log(`\nPaste into lib/shared/auth-configs.ts SHARED_AUTH_CONFIG_IDS:`);
  console.log(`  REDDIT: ${JSON.stringify(id)},`);
}

main().catch((e) => { console.error(e); process.exit(1); });
