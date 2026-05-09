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
 * Owned by: Foundation. Read-only for parallel sessions.
 */

import "server-only";
import { z } from "zod";

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z
    .string()
    .min(1, "ANTHROPIC_API_KEY is required. Run `pnpm gmaestro setup`."),
  COMPOSIO_API_KEY: z
    .string()
    .min(1, "COMPOSIO_API_KEY is required. Run `pnpm gmaestro setup`."),
  GMAESTRO_USER_ID: z.string().min(1).default("default"),
  GMAESTRO_BASE_URL: z.string().url().default("http://localhost:3000"),
  /** Optional override: 'tier1' forces sequential dispatch (concurrency=1). */
  GMAESTRO_TIER: z.enum(["auto", "tier1", "tier2plus"]).default("auto"),
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
        `Make sure ~/.gmaestro/.env contains the required keys.\n` +
        `Run \`pnpm gmaestro setup\` to (re)generate it.\n`,
    );
  }

  cached = parsed.data;
  return cached;
}

/**
 * Get the current dispatch concurrency for parallel persona fanout.
 * Tier 1 users have 50 RPM and can't safely fan out 47 calls.
 *
 * NOTE: Standalone — does NOT call env() and therefore does NOT require API
 * keys. Workflow code (lib/state/workflows.ts) calls this even in mock mode,
 * where ANTHROPIC_API_KEY isn't set. Coupling it to full env validation would
 * blow up every mock-mode run.
 */
export function getDispatchConcurrency(): number {
  const tier = process.env.GMAESTRO_TIER ?? "auto";
  if (tier === "tier1") return 1;
  // Default: 10. Tier 2 = 1000 RPM = plenty of headroom.
  return 10;
}
