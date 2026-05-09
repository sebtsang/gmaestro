/**
 * Mock-mode revision endpoint — calls the configured LLM provider (Ollama
 * Cloud or Anthropic) to actually rewrite a draft per founder feedback.
 *
 * Used by `<LiveApprovalSurface>` when the user clicks "Request changes" while
 * `NEXT_PUBLIC_USE_MOCKS=1`. The rest of the demo stays mocked — only this one
 * call fires a real model so feedback is genuinely followed instead of being
 * keyword-matched against canned heuristics.
 *
 * Endpoint: POSTs to `${ANTHROPIC_BASE_URL || api.anthropic.com}/v1/messages`
 * with the model resolved by `getModelForTier("sonnet")`. Auth is whichever
 * `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` is set (`lib/shared/env.ts`
 * mirrors `OLLAMA_API_KEY` into both when in ollama mode).
 *
 * Returns { body, subject } — the rewritten draft. Caller is responsible for
 * the heuristic fallback if this errors.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { extractJson } from "@/lib/shared/extract-json";
import { getModelForTier } from "@/lib/shared/models";
import "@/lib/shared/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  currentBody: z.string().min(1).max(20_000),
  currentSubject: z.string().max(500).optional(),
  founderNote: z.string().min(1).max(2_000),
  kind: z.enum(["OutreachDraft", "ActivationNudge"]).default("OutreachDraft"),
});

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string }>;
  error?: { message?: string };
}

function buildPrompt(opts: {
  kind: "OutreachDraft" | "ActivationNudge";
  currentBody: string;
  currentSubject?: string;
  founderNote: string;
}): string {
  const artifact =
    opts.kind === "ActivationNudge"
      ? "in-product activation nudge"
      : "cold outreach email";

  return [
    `You are revising a ${artifact} for a founder running their own GTM. The founder gave you feedback. Rewrite the draft to follow it precisely. Do not over-explain.`,
    "",
    `<current_subject>`,
    opts.currentSubject ?? "(no subject)",
    `</current_subject>`,
    "",
    `<current_body>`,
    opts.currentBody,
    `</current_body>`,
    "",
    `<founder_feedback>`,
    opts.founderNote,
    `</founder_feedback>`,
    "",
    "Output ONLY a JSON object with two string fields: `subject` and `body`. No prose, no markdown fences, no explanation. The body should preserve newlines as `\\n`.",
  ].join("\n");
}

function extractText(resp: AnthropicMessagesResponse): string {
  if (!resp.content) return "";
  return resp.content
    .filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text!)
    .join("");
}

const RewriteSchema = z.object({
  subject: z.string().optional(),
  body: z.string().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { currentBody, currentSubject, founderNote, kind } = parsed.data;

  const baseUrl = (
    process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com"
  ).replace(/\/+$/, "");
  const authToken =
    process.env.ANTHROPIC_AUTH_TOKEN ?? process.env.ANTHROPIC_API_KEY;
  if (!authToken) {
    return NextResponse.json(
      { error: "No LLM auth token configured" },
      { status: 503 },
    );
  }

  const model = getModelForTier("sonnet");
  const prompt = buildPrompt({ kind, currentBody, currentSubject, founderNote });

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": authToken,
        authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        model,
        // Generous budget — Ollama Cloud reasoning models burn ~100-300 tokens
        // on a thinking block before emitting text. 1024 was too tight for
        // longer prior bodies; 4096 leaves comfortable headroom.
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(55_000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Upstream fetch failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 },
    );
  }

  if (!upstream.ok) {
    const text = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: `Upstream ${upstream.status}`,
        detail: text.slice(0, 500),
      },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as AnthropicMessagesResponse;
  const raw = extractText(data);

  let out: { subject?: string; body?: string };
  try {
    out = RewriteSchema.parse(extractJson(raw));
  } catch {
    out = {};
  }

  if (!out.body) {
    return NextResponse.json(
      { error: "Model returned no usable body", raw: raw.slice(0, 500) },
      { status: 502 },
    );
  }

  return NextResponse.json({ body: out.body, subject: out.subject });
}
