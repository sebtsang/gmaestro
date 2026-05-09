/**
 * Direct Composio API smoke test.
 *
 * Bypasses lib/tools/composio.ts (which uses 'server-only' and can't load in
 * tsx) and exercises the same SDK methods our wrapper does. Verifies:
 *   - composio.mcp.create() with toolkits + allowedTools
 *   - composio.mcp.generate(userId, configId) returns a usable HTTP URL
 */

import { Composio } from "@composio/core";

const apiKey = process.env.COMPOSIO_API_KEY;
if (!apiKey) {
  console.error("Missing COMPOSIO_API_KEY in env.");
  process.exit(1);
}

const TIER_S_TOOLKITS = [
  "GMAIL", "GOOGLECALENDAR", "GOOGLESHEETS", "SLACK", "NOTION",
  "HUBSPOT", "LINEAR", "STRIPE", "GITHUB", "LINKEDIN",
];

const SOME_ALLOWED_ACTIONS = [
  "GMAIL_DRAFT", "GMAIL_SEND", "GMAIL_SEARCH",
  "GOOGLECALENDAR_FIND_FREE_SLOTS", "GOOGLECALENDAR_CREATE_EVENT",
  "SLACK_POST_MESSAGE",
  "NOTION_CREATE_PAGE",
  "HUBSPOT_SEARCH_CONTACTS", "HUBSPOT_CREATE_CONTACT",
  "LINEAR_CREATE_ISSUE",
  "STRIPE_LIST_CUSTOMERS",
  "GITHUB_SEARCH_CODE",
  "LINKEDIN_SEARCH_PERSON", "LINKEDIN_GET_PROFILE", "LINKEDIN_GET_COMPANY",
];

(async () => {
  const composio = new Composio({ apiKey });

  console.log("Step 1: composio.mcp.create(...)");
  let configId: string;
  try {
    const created = await composio.mcp.create("gmaestro-preflight", {
      toolkits: TIER_S_TOOLKITS.map((t) => t.toLowerCase()),
      allowedTools: SOME_ALLOWED_ACTIONS,
      manuallyManageConnections: true,
    } as never);
    configId = String((created as { id?: string }).id ?? "");
    if (!configId) throw new Error("create returned no id");
    console.log("  ✔ created MCP config id:", configId);
  } catch (e) {
    console.error("  ✗ FAILED:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) {
      console.error(e.stack.split("\n").slice(0, 6).join("\n"));
    }
    process.exit(1);
  }

  console.log("\nStep 2: composio.mcp.generate('default', configId)");
  try {
    const instance = await composio.mcp.generate("default", configId);
    const inst = instance as { url?: string; headers?: Record<string, string> };
    console.log("  ✔ url prefix:", inst.url?.slice(0, 80));
    console.log("  ✔ headers:", Object.keys(inst.headers ?? {}));
    console.log("  ✔ url is self-authenticating?",
      inst.url?.includes("token") || inst.url?.includes("sig") || inst.url?.includes("key")
        ? "looks signed (token/sig/key in URL)"
        : "no obvious signing — may need API-key headers in production",
    );
  } catch (e) {
    console.error("  ✗ FAILED:", e instanceof Error ? e.message : e);
    if (e instanceof Error && e.stack) {
      console.error(e.stack.split("\n").slice(0, 6).join("\n"));
    }
    process.exit(1);
  }

  console.log("\nALL OK — Composio MCP setup path works end-to-end.");
})();
