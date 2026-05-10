/* eslint-disable */
/**
 * Helper for the Slack approval-DM flow.
 *
 * 1. Lists Slack channels + DM targets reachable by the connected Slack app.
 * 2. If `--set <id|name>` is passed, writes GMAESTRO_SLACK_CHANNEL into
 *    ~/.gmaestro/.env so future approvals auto-DM.
 * 3. If `--test` is passed, sends a test DM to the configured channel.
 *
 * Usage:
 *   pnpm tsx scripts/connect-slack-channel.ts                # list
 *   pnpm tsx scripts/connect-slack-channel.ts --set "#general"
 *   pnpm tsx scripts/connect-slack-channel.ts --set U0123456
 *   pnpm tsx scripts/connect-slack-channel.ts --test
 */
import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ENV_PATH = path.join(os.homedir(), ".gmaestro", ".env");

function readComposioKey(): string {
  let key = process.env.COMPOSIO_API_KEY;
  if (!key && fs.existsSync(ENV_PATH)) {
    const m = fs.readFileSync(ENV_PATH, "utf-8").match(/^COMPOSIO_API_KEY=(.+)$/m);
    if (m) key = m[1].replace(/^["']|["']$/g, "");
  }
  if (!key) {
    console.error("No COMPOSIO_API_KEY available.");
    process.exit(1);
  }
  return key;
}

function readEnvVar(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!fs.existsSync(ENV_PATH)) return undefined;
  const m = fs.readFileSync(ENV_PATH, "utf-8").match(new RegExp(`^${name}=(.+)$`, "m"));
  return m?.[1].replace(/^["']|["']$/g, "");
}

function writeEnvVar(name: string, value: string): void {
  let body = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, "utf-8") : "";
  const re = new RegExp(`^${name}=.*$`, "m");
  if (re.test(body)) {
    body = body.replace(re, `${name}=${value}`);
  } else {
    if (body && !body.endsWith("\n")) body += "\n";
    body += `${name}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, body);
  console.log(`Wrote ${name}=${value} → ${ENV_PATH}`);
}

async function main() {
  const args = process.argv.slice(2);
  const setIdx = args.indexOf("--set");
  const setVal = setIdx >= 0 ? args[setIdx + 1] : undefined;
  const test = args.includes("--test");

  const composio = new Composio({ apiKey: readComposioKey() });
  const userId = process.env.GMAESTRO_USER_ID ?? "default";

  if (setVal) {
    writeEnvVar("GMAESTRO_SLACK_CHANNEL", setVal);
  }

  if (test) {
    const channel = readEnvVar("GMAESTRO_SLACK_CHANNEL");
    if (!channel) {
      console.error("GMAESTRO_SLACK_CHANNEL is not set. Run with --set <id> first.");
      process.exit(1);
    }
    console.log(`Sending test DM to "${channel}"...`);
    const r = (await composio.tools.execute("SLACK_SEND_MESSAGE", {
      userId,
      arguments: {
        channel,
        text: ":wave: GMaestro test message — Slack approvals are wired.",
      },
      dangerouslySkipVersionCheck: true,
    } as never)) as Record<string, unknown>;
    console.log(`OK; successful=${r.successful} error=${JSON.stringify(r.error)}`);
    return;
  }

  console.log("=== Slack channels (first 50) ===");
  const r = (await composio.tools.execute("SLACK_LIST_ALL_CHANNELS", {
    userId,
    arguments: { limit: 50, exclude_archived: true, types: "public_channel,private_channel,im" },
    dangerouslySkipVersionCheck: true,
  } as never)) as Record<string, unknown>;
  // Composio double-wraps: r.data.data.channels
  let cursor: unknown = r.data;
  let channels: Array<{ id: string; name?: string; is_im?: boolean; user?: string }> = [];
  for (let depth = 0; depth < 3; depth++) {
    if (!cursor || typeof cursor !== "object") break;
    const obj = cursor as Record<string, unknown>;
    if (Array.isArray(obj.channels)) { channels = obj.channels as typeof channels; break; }
    cursor = obj.data;
  }
  for (const c of channels) {
    const label = c.is_im ? `(DM with user ${c.user ?? "?"})` : `#${c.name ?? "?"}`;
    console.log(`  ${(c.id ?? "?").padEnd(13)} ${label}`);
  }
  if (channels.length === 0) {
    console.log("(none — try a different `types` filter, or paste your channel ID directly)");
  }
  console.log("\nNext step: pnpm tsx scripts/connect-slack-channel.ts --set <id-or-#name>");
  console.log("Then test:  pnpm tsx scripts/connect-slack-channel.ts --test");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
