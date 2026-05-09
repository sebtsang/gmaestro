/**
 * Model resolver — single source of truth for which LLM to call per tier.
 *
 * The Claude Agent SDK is provider-agnostic at the wire level — it talks to
 * any endpoint that speaks the Anthropic Messages API. Two providers are
 * supported here:
 *
 *  - "anthropic"  — the default, calls api.anthropic.com with Claude models.
 *  - "ollama"     — Ollama Cloud (or local), serving open-weight models like
 *                   Kimi K2.6 / Qwen3-Coder / MiniMax via the Anthropic-
 *                   compatible /v1/messages endpoint added on 2026-01-16.
 *                   Free under your Ollama Pro plan.
 *
 * The Claude Agent SDK reads `ANTHROPIC_BASE_URL` to override the endpoint and
 * `ANTHROPIC_AUTH_TOKEN` (or `ANTHROPIC_API_KEY`) for auth. Setting those env
 * vars + flipping `GMAESTRO_LLM_PROVIDER=ollama` switches the entire stack.
 *
 * Per-tier overrides via env let us mix models without touching code:
 *   GMAESTRO_MODEL_OPUS=kimi-k2.6:cloud
 *   GMAESTRO_MODEL_SONNET=qwen3-coder:cloud
 *   GMAESTRO_MODEL_HAIKU=qwen3:cloud
 *
 * Owned by: Foundation. Read by orchestrator + personas.
 */

import "server-only";
import type { ModelTier } from "./types";

export type LlmProvider = "anthropic" | "ollama";

export function getProvider(): LlmProvider {
  const raw = (process.env.GMAESTRO_LLM_PROVIDER ?? "").toLowerCase();
  return raw === "ollama" ? "ollama" : "anthropic";
}

const ANTHROPIC_DEFAULTS: Record<ModelTier, string> = {
  opus: "claude-opus-4-7",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
};

/**
 * Ollama Cloud defaults. Kimi K2.6 outperforms Claude Opus 4.6 on agentic
 * benchmarks (SWE-Bench Pro 58.6% vs 53.4%, HLE-with-tools higher) and was
 * explicitly designed for parallel sub-agent workloads — exactly our use case.
 * Using it for every tier keeps the demo simple; per-tier overrides via env
 * allow swapping in smaller models for the tagger if cost/latency matters.
 */
const OLLAMA_DEFAULTS: Record<ModelTier, string> = {
  opus: "kimi-k2.6:cloud",
  sonnet: "kimi-k2.6:cloud",
  haiku: "kimi-k2.6:cloud",
};

const ENV_KEYS: Record<ModelTier, string> = {
  opus: "GMAESTRO_MODEL_OPUS",
  sonnet: "GMAESTRO_MODEL_SONNET",
  haiku: "GMAESTRO_MODEL_HAIKU",
};

export function getModelForTier(tier: ModelTier): string {
  const override = process.env[ENV_KEYS[tier]];
  if (override && override.trim().length > 0) return override.trim();
  const defaults =
    getProvider() === "ollama" ? OLLAMA_DEFAULTS : ANTHROPIC_DEFAULTS;
  return defaults[tier];
}

/** Convenience for one-off callers that want all three at once. */
export function getModelMap(): Record<ModelTier, string> {
  return {
    opus: getModelForTier("opus"),
    sonnet: getModelForTier("sonnet"),
    haiku: getModelForTier("haiku"),
  };
}
