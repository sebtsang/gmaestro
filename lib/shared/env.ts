/**
 * Fail-fast environment validation.
 *
 * Imported on first use of any module that needs API keys. If a required key
 * is missing, throws with an actionable message before downstream code runs.
 *
 * For client-only code, this module must NOT be imported (it accesses
 * process.env at module load and would explode in the browser). Use it from
 * server modules and CLI bin only.
 *
 * Provider-aware:
 *
 *   - GMAESTRO_LLM_PROVIDER=anthropic (default): Claude Agent SDK uses the
 *     ANTHROPIC_API_KEY env var if set, otherwise falls through to Claude
 *     Code OAuth credentials (Keychain on macOS, ~/.claude/.credentials.json
 *     elsewhere). The validator marks the key OPTIONAL — running on a
 *     Claude Pro/Max subscription with no env var is a supported path.
 *
 *   - GMAESTRO_LLM_PROVIDER=ollama: routes to Ollama Cloud. OLLAMA_API_KEY
 *     is required; it's force-mirrored into ANTHROPIC_BASE_URL +
 *     ANTHROPIC_AUTH_TOKEN + ANTHROPIC_API_KEY so the Agent SDK uses Ollama's
 *     /v1/messages endpoint with the right auth.
 *
 * Owned by: Foundation. Read-only for parallel sessions.
 */

import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";

const provider = (process.env.GMAESTRO_LLM_PROVIDER ?? "anthropic").toLowerCase();
const isOllama = provider === "ollama";

// ---- Composio fallback: read from agent-native signup file if env empty ----
if (!process.env.COMPOSIO_API_KEY) {
  try {
    const credsPath = path.join(
      os.homedir(),
      ".composio",
      "anonymous_user_data.json",
    );
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8")) as {
        composio?: { api_key?: string };
      };
      if (creds?.composio?.api_key) {
        process.env.COMPOSIO_API_KEY = creds.composio.api_key;
      }
    }
  } catch {
    // ignore — env validation will surface a clean error if still missing
  }
}

// ---- Ollama mode: mirror OLLAMA_API_KEY → Anthropic SDK auth vars ----
//
// FORCE-OVERWRITE the SDK auth vars in ollama mode, even if ANTHROPIC_API_KEY
// was already set. Reason: founders frequently have a real Anthropic key in
// .env (left over from anthropic mode) AND OLLAMA_API_KEY. The previous
// "preserve if set" logic let the Anthropic key leak through to Ollama
// Cloud's /v1/messages endpoint, which 401s — manifests as Conductor failing
// with "Failed to authenticate. API Error: 401 Invalid authentication
// credentials" returned as the LLM's "result" text (which then fails JSON
// parse with a misleading "No JSON object found" error).
if (isOllama && process.env.OLLAMA_API_KEY) {
  if (!process.env.ANTHROPIC_BASE_URL) {
    process.env.ANTHROPIC_BASE_URL = "https://ollama.com";
  }
  process.env.ANTHROPIC_AUTH_TOKEN = process.env.OLLAMA_API_KEY;
  process.env.ANTHROPIC_API_KEY = process.env.OLLAMA_API_KEY;
}

const EnvSchema = z.object({
  // Optional in BOTH modes:
  //   - Ollama: force-mirrored from OLLAMA_API_KEY above; absent here is fine.
  //   - Anthropic: when omitted, the Claude Agent SDK falls through to Claude
  //     Code OAuth credentials (Keychain on macOS, ~/.claude/.credentials.json
  //     elsewhere). Founders on Pro/Max subscriptions don't need an API key.
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_AUTH_TOKEN: z.string().optional(),
  OLLAMA_API_KEY: z.string().optional(),
  GMAESTRO_LLM_PROVIDER: z.enum(["anthropic", "ollama"]).default("anthropic"),
  COMPOSIO_API_KEY: z
    .string()
    .min(1, "COMPOSIO_API_KEY is required. Run `pnpm gmaestro setup`."),
  GMAESTRO_USER_ID: z.string().min(1).default("default"),
  GMAESTRO_BASE_URL: z.string().url().default("http://localhost:3000"),
  /** Optional override: 'tier1' forces sequential dispatch (concurrency=1). */
  GMAESTRO_TIER: z.enum(["auto", "tier1", "tier2plus"]).default("auto"),
  /**
   * Slack channel or user to DM when an approval is raised. Either a channel
   * id (`C…`/`D…`), channel name (`#general`), or a user id (`U…`) — Slack
   * auto-opens a DM for the latter. When unset, no Slack notification fires.
   */
  GMAESTRO_SLACK_CHANNEL: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `\n[gmaestro] Environment validation failed:\n${issues}\n\n` +
        `Make sure ~/.gmaestro/.env (or project .env) contains the required keys.\n` +
        `Run \`pnpm gmaestro setup\` to (re)generate it.\n`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Get the current dispatch concurrency for parallel persona fanout.
 * Tier 1 users have 50 RPM and can't safely fan out 47 calls.
 * Ollama Cloud has its own rate limits — we keep concurrency at 5 to be safe.
 *
 * NOTE: Standalone — does NOT call env() and therefore does NOT require API
 * keys. Workflow code (lib/state/workflows.ts) calls this even in mock mode,
 * where ANTHROPIC_API_KEY isn't set. Coupling it to full env validation would
 * blow up every mock-mode run.
 */
export function getDispatchConcurrency(): number {
  const tier = process.env.GMAESTRO_TIER ?? "auto";
  if (tier === "tier1") return 1;
  if ((process.env.GMAESTRO_LLM_PROVIDER ?? "").toLowerCase() === "ollama") {
    return 5;
  }
  // Default: 10. Tier 2 = 1000 RPM = plenty of headroom.
  return 10;
}
