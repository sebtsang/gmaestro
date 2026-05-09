/**
 * Best-effort JSON extraction from LLM output.
 *
 * Tries direct parse → ```json fences → "first `{` to last `}`" slice.
 * Throws if none of those produce valid JSON. Used by both the orchestrator
 * (parsing the Conductor's plan) and mock-mode revisions (parsing the
 * Writer's rewrite).
 */

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to extraction
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return JSON.parse(fenceMatch[1].trim());
  }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }
  throw new Error("No JSON object found in LLM output");
}
