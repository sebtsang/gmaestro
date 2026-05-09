/**
 * Probe what tools the Composio MCP HTTP endpoint actually exposes for our
 * default user. Specifically: confirm that COMPOSIO_MULTI_EXECUTE_TOOL,
 * COMPOSIO_SEARCH_TOOLS, and COMPOSIO_GET_TOOL_SCHEMAS are visible — these
 * are the meta-tools we'll lean on for the batch refactor.
 *
 *   pnpm tsx scripts/_probe-mcp-tools.ts
 */

import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function loadComposioKey(): string {
  if (process.env.COMPOSIO_API_KEY) return process.env.COMPOSIO_API_KEY;
  try {
    const credsPath = path.join(
      os.homedir(),
      ".composio",
      "anonymous_user_data.json",
    );
    const data = JSON.parse(fs.readFileSync(credsPath, "utf-8")) as {
      composio?: { api_key?: string };
    };
    if (data?.composio?.api_key) return data.composio.api_key;
  } catch {
    // fall through
  }
  throw new Error(
    "No COMPOSIO_API_KEY in env and ~/.composio/anonymous_user_data.json missing",
  );
}

const META_TOOLS = [
  "COMPOSIO_MULTI_EXECUTE_TOOL",
  "COMPOSIO_SEARCH_TOOLS",
  "COMPOSIO_GET_TOOL_SCHEMAS",
  "COMPOSIO_MANAGE_CONNECTIONS",
];

async function main() {
  const composio = new Composio({ apiKey: loadComposioKey() });

  console.log("→ listing existing MCP configs (looking for gmaestro-default)");
  const configs = await composio.mcp.list({
    name: "gmaestro-default",
    limit: 5,
    page: 1,
    toolkits: [],
    authConfigs: [],
  });
  console.log(
    `  found ${configs.items?.length ?? 0} matching config(s):`,
    configs.items?.map((c) => c.id) ?? [],
  );
  const mcpConfig = configs.items?.find((c) => c.name === "gmaestro-default");
  if (!mcpConfig) {
    console.log(
      "  no gmaestro-default config — orchestrator hasn't created it yet",
    );
  }

  console.log(
    "\n→ enumerate Composio tool catalog (filtering for COMPOSIO_* meta tools)",
  );
  // composio.tools.get with no filter pulls everything; we just want meta tools.
  // Use the search filter on toolkit "composio".
  const toolList = await composio.tools.getRawComposioTools({
    toolkits: ["composio"],
    limit: 50,
  });
  const raw = toolList as unknown as
    | { items?: Array<{ slug?: string }> }
    | Array<{ slug?: string }>;
  const arr = Array.isArray(raw) ? raw : (raw.items ?? []);
  const slugs: string[] = arr.map((t) => t.slug ?? "").filter(Boolean);

  console.log(`  composio toolkit exposes ${slugs.length} tools:`);
  for (const s of slugs) console.log(`    - ${s}`);

  console.log("\n→ verify each meta tool we want to lean on:");
  for (const want of META_TOOLS) {
    const present = slugs.includes(want);
    console.log(`  ${present ? "✓" : "✗"} ${want}`);
  }

  process.exit(0);
}

void main().catch((err) => {
  console.error("probe failed:", err);
  process.exit(1);
});
