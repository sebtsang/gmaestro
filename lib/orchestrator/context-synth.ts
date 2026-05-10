/**
 * Returns a *proposed* CompanyContext — never saves. The founder reviews
 * and saves via PUT /api/context.
 */

import "server-only";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { extractJson } from "@/lib/shared/extract-json";
import { getModelForTier } from "@/lib/shared/models";
import { CompanyContextSchema } from "@/lib/shared/schemas";
import type { CompanyContext } from "@/lib/shared/types";
import { listLeads } from "@/lib/state/leads";
import { getVoiceSamples } from "@/lib/state/voice";
import { loadCompanyContext } from "@/lib/state/company-context";

const SYNTH_TIMEOUT_MS = 30_000;
const VOICE_SAMPLE_LIMIT = 8;
const HOT_LEAD_LIMIT = 20;

const SYSTEM_PROMPT = `You analyze a founder's voice samples and recent hot leads to synthesize a CompanyContext snapshot for a GTM (go-to-market) AI tool.

Return a single JSON object (no prose, no fences) with this shape:

{
  "companyOverview": "1–2 sentence description of what the founder's company does",
  "keyFacts": ["short bullet 1", "short bullet 2", ...],
  "icps": [
    {
      "name": "ICP label",
      "priority": "hot" | "warm" | "cold",
      "description": "1 sentence",
      "industry": ["industry tags"],
      "companySizeRange": "5-30",
      "seniority": ["Founder", "CEO"]
    }
  ],
  "gtmObjectives": [
    {
      "metric": "demos_booked" | "qualified_hot_leads" | "outreach_sent",
      "target": <positive integer>,
      "label": "human-readable label",
      "since": "ISO datetime, e.g. 2026-01-01T00:00:00Z"
    }
  ]
}

Rules:
- Identify 2–4 distinct ICPs, ranked by priority. The "hot" priority should reflect the founder's most-pursued segment based on the leads they're actually working with.
- Identify 2–3 GTM objectives. Pick reasonable quarterly targets if the data doesn't suggest specific numbers.
- Use only the three metric values shown above.
- Be specific and concrete. Avoid generic placeholders like "B2B companies" — extract real industry signals from the data.
- If the data is sparse, lean on the existing context (if provided) and make conservative refinements.
- Output JSON only. No markdown fences, no explanatory text.`;

interface SynthInputs {
  existing: CompanyContext | null;
  voiceSamples: Array<{ category: string; body: string; context?: string | null }>;
  hotLeads: Array<{ name: string; company?: string | null; rawMessage?: string | null }>;
}

function buildUserPrompt(userId: string, inputs: SynthInputs): string {
  const lines: string[] = [];
  lines.push(`Founder userId: ${userId}`);
  lines.push("");

  if (inputs.existing) {
    lines.push("## Existing CompanyContext (refine, don't replace blindly)");
    lines.push(JSON.stringify(inputs.existing, null, 2));
    lines.push("");
  }

  if (inputs.voiceSamples.length > 0) {
    lines.push(
      `## Voice samples (${inputs.voiceSamples.length}, most recent first)`,
    );
    for (const v of inputs.voiceSamples.slice(0, VOICE_SAMPLE_LIMIT)) {
      lines.push(
        `- [${v.category}]${v.context ? ` (${v.context})` : ""}: ${v.body.slice(0, 280)}`,
      );
    }
    lines.push("");
  }

  if (inputs.hotLeads.length > 0) {
    lines.push(`## Recent hot leads (${inputs.hotLeads.length})`);
    for (const l of inputs.hotLeads.slice(0, HOT_LEAD_LIMIT)) {
      lines.push(
        `- ${l.name}${l.company ? ` @ ${l.company}` : ""}${l.rawMessage ? ` — ${l.rawMessage.slice(0, 200)}` : ""}`,
      );
    }
    lines.push("");
  }

  if (
    !inputs.existing &&
    inputs.voiceSamples.length === 0 &&
    inputs.hotLeads.length === 0
  ) {
    lines.push(
      "No prior data. Produce a sensible default for a YC-style early-stage B2B SaaS founder.",
    );
  }

  lines.push("Return the CompanyContext JSON now.");
  return lines.join("\n");
}

async function callSynthModel(userPrompt: string): Promise<string> {
  const options: Options = {
    model: getModelForTier("sonnet"),
    systemPrompt: SYSTEM_PROMPT,
    allowedTools: [],
    maxTurns: 1,
    permissionMode: "bypassPermissions",
  };

  const collect = (async () => {
    const stream = query({ prompt: userPrompt, options });
    let text = "";
    for await (const message of stream) {
      if (message.type === "assistant" && message.message?.content) {
        for (const block of message.message.content) {
          if (block.type === "text") text += block.text;
        }
      }
      if (message.type === "result") break;
    }
    return text;
  })();

  return Promise.race([
    collect,
    new Promise<string>((_, reject) =>
      setTimeout(
        () => reject(new Error("context-synth timeout")),
        SYNTH_TIMEOUT_MS,
      ),
    ),
  ]);
}

function tryParse(
  raw: string,
  userId: string,
):
  | { ok: true; value: CompanyContext }
  | { ok: false; reason: string } {
  let json: unknown;
  try {
    json = extractJson(raw);
  } catch (err) {
    return { ok: false, reason: `extract-json failed: ${(err as Error).message}` };
  }
  const candidate = {
    ...(json as Record<string, unknown>),
    userId,
    updatedAt: new Date(),
  };
  const parsed = CompanyContextSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `zod failed: ${parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join("; ")}`,
    };
  }
  return { ok: true, value: parsed.data };
}

export async function synthesizeCompanyContext(
  userId: string,
): Promise<CompanyContext> {
  const existing = loadCompanyContext(userId);

  // Mock mode and unkeyed installs return the existing context (or a
  // sensible default) instead of 500ing — matches title.ts.
  if (
    process.env.GMAESTRO_MOCK_CONDUCTOR === "1" ||
    !process.env.ANTHROPIC_API_KEY
  ) {
    if (existing) return { ...existing, updatedAt: new Date() };
    const { makeMockCompanyContext } = await import("@/lib/shared/mocks");
    return { ...makeMockCompanyContext(), userId };
  }

  const voiceSamples = getVoiceSamples(userId);
  const hotLeads = listLeads({ tier: "hot", limit: HOT_LEAD_LIMIT });

  const inputs: SynthInputs = {
    existing,
    voiceSamples: voiceSamples.map((v) => ({
      category: v.category,
      body: v.body,
      context: v.context,
    })),
    hotLeads: hotLeads.map((l) => ({
      name: l.name,
      company: l.company,
      rawMessage: l.rawMessage,
    })),
  };

  const userPrompt = buildUserPrompt(userId, inputs);
  const raw = await callSynthModel(userPrompt);

  const first = tryParse(raw, userId);
  if (first.ok) return first.value;

  // Retry feeds the parse error back so the model can self-correct (rule #9).
  const retryPrompt = `${userPrompt}\n\nYour previous response failed validation: ${first.reason}\n\nReturn corrected JSON only.`;
  const retryRaw = await callSynthModel(retryPrompt);
  const second = tryParse(retryRaw, userId);
  if (second.ok) return second.value;

  throw new Error(`context-synth failed after retry: ${second.reason}`);
}
