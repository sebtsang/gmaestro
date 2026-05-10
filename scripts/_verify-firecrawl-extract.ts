/* eslint-disable */
/**
 * Verifies the production extractMarkdown logic against a live Firecrawl call.
 * Run after scripts/_fix-firecrawl.ts.
 */
import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function extractMarkdown(data: unknown): string | undefined {
  let cursor: unknown = data;
  for (let depth = 0; depth < 3; depth++) {
    if (!cursor || typeof cursor !== "object") return undefined;
    const obj = cursor as Record<string, unknown>;
    if (typeof obj.markdown === "string") return obj.markdown;
    if (typeof obj.content === "string") return obj.content;
    cursor = obj.data;
  }
  return undefined;
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
  const composio = new Composio({ apiKey: key });

  const r = (await composio.tools.execute("FIRECRAWL_SCRAPE", {
    userId: "default",
    arguments: {
      url: "https://docs.composio.dev/toolkits/firecrawl",
      formats: ["markdown"],
      waitFor: 5000,
      onlyMainContent: true,
    },
    dangerouslySkipVersionCheck: true,
  } as never)) as Record<string, unknown>;

  const md = extractMarkdown(r.data);
  console.log(`extractMarkdown(r.data) length: ${md?.length ?? 0}`);
  if (md) console.log(`first 300 chars:\n${md.slice(0, 300)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
