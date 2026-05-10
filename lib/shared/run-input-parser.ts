/**
 * Inverse of `app/api/runs/route.ts:buildStructuredPrompt`. Extracts the
 * 3-input-form fields back out of a synthesized prompt string. Used at
 * read-time by surfaces that need the founder's original inputs (the
 * approval preview wants the company URL to render artifacts as if they
 * lived on the company's blog).
 *
 * Returns null if the prompt doesn't look like a structured-form prompt
 * (e.g., legacy free-text runs from before the form landed).
 */
export interface ParsedRunInputs {
  companyUrl: string;
  docsUrl: string;
  destination: string;
}

export function parseRunInputsFromPrompt(prompt: string): ParsedRunInputs | null {
  const companyMatch = prompt.match(
    /for the company at (https?:\/\/[^\s.]+(?:\.[^\s.]+)+[^\s.,)]*)/i,
  );
  const docsMatch = prompt.match(
    /(?:about the technical content at|technical content at) (https?:\/\/[^\s.]+(?:\.[^\s.]+)+[^\s.,)]*)/i,
  );
  const destMatch = prompt.match(/Destination:\s*(blog-html|reddit|x-thread)/i);
  if (!companyMatch || !docsMatch || !destMatch) return null;
  return {
    companyUrl: companyMatch[1],
    docsUrl: docsMatch[1],
    destination: destMatch[1].toLowerCase(),
  };
}
