/**
 * Mock-mode feedback heuristics.
 *
 * The mock approval builder can't call an LLM, but we still want the demo to
 * feel responsive to founder notes. This module parses the founder's
 * Request-changes note for common keywords and applies matching transforms
 * to the current draft body / subject. The transforms are intentionally
 * simple and best-effort — the goal is "the body visibly responds to my
 * instruction", not "this is real revision quality".
 *
 * Heuristics are composed in a fixed order so several keywords in the same
 * note (e.g. "shorter and more casual, drop the founder line") all fire.
 * Order matters: structural deletions run BEFORE shortening so the deletion
 * isn't hidden by a paragraph that gets stripped anyway, and tone swaps run
 * BEFORE punctuation cleanup so casual swaps don't reintroduce exclamation
 * marks after the user asked for none.
 *
 * The chain stacks across revisions: each Request-changes transforms the
 * CURRENT body, not the original. So "shorter" then "more casual" then
 * "drop the founder line" produces a body that's progressively shorter, more
 * casual, AND missing the founder line.
 */

import type { ApprovalArtifactType } from "@/lib/shared/types";

export interface HeuristicResult {
  body: string;
  subject?: string;
  /** Names of heuristics that fired (i.e. mutated the body), in order. */
  applied: string[];
  /**
   * Whether the note contained at least one heuristic-known keyword, even if
   * no transform actually mutated the body. Distinguishes "I understood the
   * instruction and the body already complied" (true, applied=[]) from "I
   * have no idea what you want" (false, applied=[]). Callers should fall
   * back to template rotation only in the second case.
   */
  recognized: boolean;
}

// ---------------------------------------------------------------------------
//  Tokenization helpers
// ---------------------------------------------------------------------------

const WORD_BOUNDARY = /[\s,.;:!?\-—()"'/]+/;

function tokensOf(note: string): string[] {
  return note
    .toLowerCase()
    .split(WORD_BOUNDARY)
    .filter((t) => t.length > 0);
}

function hasAny(tokens: Set<string>, candidates: readonly string[]): boolean {
  for (const c of candidates) if (tokens.has(c)) return true;
  return false;
}

const REMOVE_VERBS = ["drop", "remove", "no", "skip", "kill", "cut", "delete", "strip", "without"] as const;
const ADD_VERBS = ["add", "include", "mention", "with"] as const;
const SHORTER = ["shorter", "concise", "brief", "tighten", "tighter", "shorten", "trim", "punchier"] as const;
const LONGER = ["longer", "expand", "elaborate", "detailed"] as const;
const CASUAL = ["casual", "friendly", "chill", "relaxed", "informal", "warmer"] as const;
const FORMAL = ["formal", "professional", "polished", "buttoned", "corporate"] as const;
const BOLDER = ["bold", "bolder", "direct", "assertive", "stronger", "punchy", "aggressive"] as const;
const SOFTER = ["softer", "gentler", "polite", "warmer"] as const;

// ---------------------------------------------------------------------------
//  Body utilities (line / sentence / paragraph manipulation)
// ---------------------------------------------------------------------------

/**
 * Split a body into sentence units while preserving the original paragraph
 * boundaries. Used by the "N sentences" enforcer.
 */
function splitSentences(body: string): string[] {
  // Sentence boundary = `.`, `!`, or `?` followed by whitespace, then a
  // capital letter or end-of-string. Greedy enough for our hand-written
  // template copy.
  const re = /[^.!?]+[.!?]+(?=\s|$)/g;
  const matches = body.match(re);
  if (matches && matches.length > 0) return matches.map((s) => s.trim());
  // Fallback: each paragraph line is its own unit.
  return body
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function paragraphsOf(body: string): string[] {
  return body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

function joinParagraphs(paragraphs: string[]): string {
  return paragraphs.join("\n\n");
}

/**
 * Remove a line / paragraph that contains any of the given (case-insensitive)
 * tokens. Returns the new body and a boolean indicating whether anything
 * was removed.
 */
function removeContaining(body: string, needles: readonly string[]): { body: string; removed: boolean } {
  const paragraphs = paragraphsOf(body);
  const lower = needles.map((n) => n.toLowerCase());
  const kept = paragraphs.filter(
    (p) => !lower.some((needle) => p.toLowerCase().includes(needle)),
  );
  return { body: joinParagraphs(kept), removed: kept.length !== paragraphs.length };
}

// ---------------------------------------------------------------------------
//  Specific transforms
// ---------------------------------------------------------------------------

function dropFounderSignature(body: string): { body: string; changed: boolean } {
  // Match the trailing signature in any common form.
  const re = /\n+[\s]*-+\s*\[?\s*Founder(\s+Name)?\s*\]?\s*\.?\s*$/i;
  if (re.test(body)) return { body: body.replace(re, ""), changed: true };
  // Fallback: match a final paragraph that's literally "[Founder]" or "- [Founder]".
  const r2 = removeContaining(body, ["[Founder]", "[Founder Name]", "- Founder"]);
  return { body: r2.body, changed: r2.removed };
}

function dropGreeting(body: string): { body: string; changed: boolean } {
  // First line if it looks like a greeting.
  const lines = body.split("\n");
  if (lines.length === 0) return { body, changed: false };
  const first = lines[0].trim().toLowerCase();
  if (/^(hey|hi|hello|dear|good (morning|afternoon|evening))\b/.test(first)) {
    // Drop the greeting line and any following blank lines.
    let i = 1;
    while (i < lines.length && lines[i].trim() === "") i += 1;
    return { body: lines.slice(i).join("\n"), changed: true };
  }
  return { body, changed: false };
}

function shortenBody(body: string): { body: string; changed: boolean } {
  const paragraphs = paragraphsOf(body);
  if (paragraphs.length <= 2) {
    // Already short — strip the second sentence of the longest paragraph.
    const longestIdx = paragraphs.reduce(
      (best, p, i, arr) => (p.length > arr[best].length ? i : best),
      0,
    );
    const sents = splitSentences(paragraphs[longestIdx]);
    if (sents.length > 1) {
      const next = [...paragraphs];
      next[longestIdx] = sents.slice(0, Math.max(1, sents.length - 1)).join(" ");
      return { body: joinParagraphs(next), changed: true };
    }
    return { body, changed: false };
  }
  // Drop middle paragraphs, keep first + last (signature usually).
  const kept = [paragraphs[0], paragraphs[paragraphs.length - 1]];
  return { body: joinParagraphs(kept), changed: true };
}

function enforceSentenceCount(body: string, n: number): { body: string; changed: boolean } {
  if (n <= 0) return { body, changed: false };
  const paragraphs = paragraphsOf(body);
  // Identify the signature paragraph (last one starting with `- `) so we
  // don't count it in the sentence cap.
  const isSignature = (p: string) => /^[-—]\s*/.test(p.trim());
  const sigIdx = paragraphs.length - 1;
  const hasSig = paragraphs.length > 0 && isSignature(paragraphs[sigIdx]);
  const bodyParas = hasSig ? paragraphs.slice(0, sigIdx) : paragraphs;

  // Detect a greeting paragraph (e.g. "Hey Jordan,") so we can preserve it
  // verbatim and exclude it from the sentence-count budget.
  const isGreetingPara = (p: string) =>
    p.length < 30 &&
    /,$/.test(p.trim()) &&
    /^(hey|hi|hello|dear|good (morning|afternoon|evening))\b/i.test(p.trim());
  const hasGreeting = bodyParas.length > 0 && isGreetingPara(bodyParas[0]);
  const greeting = hasGreeting ? bodyParas[0] : null;
  const contentParas = hasGreeting ? bodyParas.slice(1) : bodyParas;

  const allSentences: string[] = [];
  for (const p of contentParas) {
    const sents = splitSentences(p);
    for (const s of sents) allSentences.push(s);
  }
  if (allSentences.length === 0) return { body, changed: false };

  const trimmed = allSentences.slice(0, n);
  const out: string[] = [];
  if (greeting) out.push(greeting);
  out.push(trimmed.join(" "));
  if (hasSig) out.push(paragraphs[sigIdx]);
  return { body: joinParagraphs(out), changed: trimmed.length !== allSentences.length };
}

function enforceParagraphCount(body: string, n: number): { body: string; changed: boolean } {
  const paragraphs = paragraphsOf(body);
  if (paragraphs.length <= n) return { body, changed: false };
  // Keep first n - 1 paragraphs + last (signature).
  if (n <= 1) return { body: paragraphs[0], changed: true };
  const head = paragraphs.slice(0, n - 1);
  const tail = paragraphs[paragraphs.length - 1];
  return { body: joinParagraphs([...head, tail]), changed: true };
}

type Swap = readonly [RegExp, string];

const CASUAL_SWAPS: readonly Swap[] = [
  [/\bcongrats on the\b/gi, "huge congrats on the"],
  [/\bMind if I\b/g, "Cool if I"],
  [/\bIf there's a better time\b/gi, "If now's a bad time"],
  [/\bjust say the word\b/gi, "just shout"],
  [/\bI run\b/g, "I'm running"],
  [/\bquick question\b/gi, "quick one"],
  [/\bWould you be open to\b/gi, "Down for"],
  [/\bplease let me know\b/gi, "lmk"],
];

const FORMAL_SWAPS: readonly Swap[] = [
  [/\bHey\b/g, "Hi"],
  [/\bcongrats\b/gi, "congratulations"],
  [/\blmk\b/gi, "please let me know"],
  [/\bgonna\b/gi, "going to"],
  [/\bwanna\b/gi, "want to"],
  [/\bthx\b/gi, "thank you"],
  [/\bjust shout\b/gi, "please reply at your convenience"],
  [/\bquick one\b/gi, "a brief question"],
];

const BOLDER_SWAPS: readonly Swap[] = [
  [/\bMind if I\b/gi, "I'd like to"],
  [/\bCool if I\b/gi, "I'd like to"],
  [/\bjust say the word\b/gi, "reply YES"],
  [/\bNo pressure either way\b/gi, "Worth a 10-minute call"],
  [/\bHappy to skip if\b/gi, "Skip only if"],
  [/\bWould love to\b/gi, "Want to"],
];

const SOFTER_SWAPS: readonly Swap[] = [
  [/\bI'd like to\b/g, "Would love to"],
  [/\breply YES\b/g, "let me know if it'd help"],
  [/\bI'm running\b/g, "I run"],
];

function applySwaps(
  body: string,
  swaps: readonly Swap[],
): { body: string; changed: boolean } {
  let changed = false;
  let next = body;
  for (const [re, replacement] of swaps) {
    if (re.test(next)) {
      next = next.replace(re, replacement);
      changed = true;
    }
  }
  return { body: next, changed };
}

function makeCasual(body: string) {
  return applySwaps(body, CASUAL_SWAPS);
}
function makeFormal(body: string) {
  return applySwaps(body, FORMAL_SWAPS);
}
function makeBolder(body: string) {
  return applySwaps(body, BOLDER_SWAPS);
}
function makeSofter(body: string) {
  return applySwaps(body, SOFTER_SWAPS);
}

function stripExclamations(body: string): { body: string; changed: boolean } {
  if (!body.includes("!")) return { body, changed: false };
  // Replace `!` with `.` to keep sentence boundaries; collapse `..` to `.`.
  const next = body.replace(/!+/g, ".").replace(/\.\.+/g, ".");
  return { body: next, changed: true };
}

function appendMention(body: string, topic: string): { body: string; changed: boolean } {
  if (!topic) return { body, changed: false };
  const paragraphs = paragraphsOf(body);
  if (paragraphs.length === 0) return { body, changed: false };
  const isSignature = (p: string) => /^[-—]\s*/.test(p.trim());
  const sigIdx = paragraphs.length - 1;
  const hasSig = isSignature(paragraphs[sigIdx]);
  const sentence = `Also worth mentioning ${topic}.`;
  if (hasSig) {
    const head = paragraphs.slice(0, sigIdx);
    return {
      body: joinParagraphs([...head, sentence, paragraphs[sigIdx]]),
      changed: true,
    };
  }
  return { body: joinParagraphs([...paragraphs, sentence]), changed: true };
}

// ---------------------------------------------------------------------------
//  Note parsing
// ---------------------------------------------------------------------------

const NUMBER_WORD_SENTENCES: ReadonlyArray<readonly [RegExp, number]> = [
  [/\bone\s+sentences?\b/, 1],
  [/\btwo\s+sentences?\b/, 2],
  [/\bthree\s+sentences?\b/, 3],
  [/\bfour\s+sentences?\b/, 4],
  [/\bfive\s+sentences?\b/, 5],
];

/** Extract a target sentence count from notes like "make it 2 sentences". */
function parseSentenceCount(noteLower: string): number | null {
  const m = noteLower.match(/(\d+)\s*(sentence|sentences)/);
  if (m) return Number.parseInt(m[1], 10);
  for (const [re, n] of NUMBER_WORD_SENTENCES) {
    if (re.test(noteLower)) return n;
  }
  return null;
}

function parseParagraphCount(noteLower: string): number | null {
  const m = noteLower.match(/(\d+)\s*(paragraph|paragraphs)/);
  if (m) return Number.parseInt(m[1], 10);
  if (/\bone[-\s]paragraph\b|\bsingle[-\s]paragraph\b/.test(noteLower)) return 1;
  return null;
}

/** Parse "add <topic>" / "include <topic>" / "mention <topic>". */
function parseAddTopic(noteLower: string, original: string): string | null {
  const m = original.match(
    /\b(?:add|include|mention)\s+(.+?)(?:[,.;]|$)/i,
  );
  if (!m) return null;
  let topic = m[1].trim();
  // Strip leading filler.
  topic = topic.replace(/^(a|the|something about|that|some)\s+/i, "");
  if (topic.length === 0 || topic.length > 80) return null;
  if (/^(it|this|that)$/i.test(topic)) return null;
  // Suppress when the note is actually telling us to add a structural element
  // we handle elsewhere.
  if (/\b(sentence|paragraph|founder|signature|greeting|exclamation)\b/i.test(topic)) {
    return null;
  }
  return topic;
  // (noteLower is the lowered string; we use `original` to preserve case in
  // the appended sentence.)
}

/**
 * Parse a free-form `drop X` / `remove X` / `no X` / `without X` instruction
 * for tokens we DON'T have a dedicated handler for. Returns the noun / phrase
 * to strip, or null. Conservative — only trips when a verb of removal is
 * followed by a short noun phrase that ALSO appears in the body.
 */
function parseFreeFormRemoval(
  noteLower: string,
  body: string,
): string | null {
  const m = noteLower.match(
    /\b(?:drop|remove|no|skip|kill|cut|delete|strip|without)\s+(?:the\s+)?([a-z][a-z0-9 \-']{1,40})/,
  );
  if (!m) return null;
  let candidate = m[1].trim();
  // Strip trailing connectives.
  candidate = candidate.replace(/\s+(and|but|please|line|word|words|bit)\b.*$/, "");
  // Skip targets we have dedicated handlers for.
  if (
    /\b(founder|signature|sign[-\s]?off|greeting|opener|hey|hi|exclamation|exclamations|paragraph|sentence)\b/.test(
      candidate,
    )
  ) {
    return null;
  }
  if (candidate.length < 2) return null;
  // Require the candidate to actually appear in the body (case-insensitive),
  // otherwise we'd happily "remove" things that aren't there.
  if (!body.toLowerCase().includes(candidate)) return null;
  return candidate;
}

// ---------------------------------------------------------------------------
//  Public API
// ---------------------------------------------------------------------------

/**
 * Apply heuristic transforms to `body` based on the founder's `note`.
 *
 * Returns `{ body, subject, applied }`. If no heuristic fires, `applied` is
 * empty and the caller should fall back to its own "vary the body so it at
 * least changes between revisions" behavior.
 */
export function applyFeedbackHeuristics(
  body: string,
  subject: string | undefined,
  note: string,
  _kind: ApprovalArtifactType = "OutreachDraft",
): HeuristicResult {
  const trimmedNote = note.trim();
  if (trimmedNote.length === 0) {
    return { body, subject, applied: [], recognized: false };
  }

  const noteLower = trimmedNote.toLowerCase();
  const tokens = new Set(tokensOf(trimmedNote));
  const applied: string[] = [];

  let nextBody = body;
  let nextSubject = subject;

  // Detect recognized keywords up-front so callers can distinguish "no-op
  // because already compliant" from "no idea what was asked".
  const recognized =
    hasAny(tokens, REMOVE_VERBS) ||
    hasAny(tokens, ADD_VERBS) ||
    hasAny(tokens, SHORTER) ||
    hasAny(tokens, LONGER) ||
    hasAny(tokens, CASUAL) ||
    hasAny(tokens, FORMAL) ||
    hasAny(tokens, BOLDER) ||
    hasAny(tokens, SOFTER) ||
    /\b(\d+)\s*(sentence|sentences|paragraph|paragraphs)\b/.test(noteLower) ||
    /\b(exclamation|exclamations|exclamation-marks?)\b/.test(noteLower) ||
    /\bsubject\s*[:=]/i.test(trimmedNote);

  // 1) Structural deletions first — applied before length adjustments so
  //    the deletion isn't masked by a paragraph that gets stripped anyway.
  const wantsRemove = hasAny(tokens, REMOVE_VERBS);
  if (
    wantsRemove &&
    hasAny(tokens, ["founder", "signature", "sign-off", "signoff", "name"])
  ) {
    const r = dropFounderSignature(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("drop-founder-signature");
    }
  }
  if (
    wantsRemove &&
    hasAny(tokens, ["greeting", "opener", "hey", "hi", "salutation"])
  ) {
    const r = dropGreeting(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("drop-greeting");
    }
  }
  if (
    wantsRemove &&
    hasAny(tokens, ["exclamation", "exclamations", "exclamation-marks", "exclamations!"])
  ) {
    const r = stripExclamations(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("strip-exclamations");
    }
  }
  // Free-form removal (e.g. "drop the company-size opener", "remove the loom").
  // Only trips if no dedicated handler matched the same verb, AND the target
  // noun actually appears in the body.
  if (wantsRemove && applied.length === 0) {
    const target = parseFreeFormRemoval(noteLower, nextBody);
    if (target) {
      const r = removeContaining(nextBody, [target]);
      if (r.removed) {
        nextBody = r.body;
        applied.push(`drop-line-containing:${target}`);
      }
    }
  }

  // 2) Length / structure enforcement.
  const sentenceCount = parseSentenceCount(noteLower);
  if (sentenceCount !== null) {
    const r = enforceSentenceCount(nextBody, sentenceCount);
    if (r.changed) {
      nextBody = r.body;
      applied.push(`sentences:${sentenceCount}`);
    }
  } else {
    const paraCount = parseParagraphCount(noteLower);
    if (paraCount !== null) {
      const r = enforceParagraphCount(nextBody, paraCount);
      if (r.changed) {
        nextBody = r.body;
        applied.push(`paragraphs:${paraCount}`);
      }
    } else if (hasAny(tokens, SHORTER)) {
      const r = shortenBody(nextBody);
      if (r.changed) {
        nextBody = r.body;
        applied.push("shorten");
      }
    }
  }

  // 3) Tone swaps.
  if (hasAny(tokens, CASUAL)) {
    const r = makeCasual(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("casual");
    }
  }
  if (hasAny(tokens, FORMAL)) {
    const r = makeFormal(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("formal");
    }
  }
  if (hasAny(tokens, BOLDER)) {
    const r = makeBolder(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("bolder");
    }
  }
  if (hasAny(tokens, SOFTER)) {
    const r = makeSofter(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("softer");
    }
  }

  // 4) Punctuation cleanup AFTER tone swaps so casual swaps that introduce
  //    `!` get cleaned up if the note also said "no exclamation marks".
  if (
    hasAny(tokens, ["exclamation", "exclamations", "exclamation-marks"]) &&
    !applied.includes("strip-exclamations")
  ) {
    const r = stripExclamations(nextBody);
    if (r.changed) {
      nextBody = r.body;
      applied.push("strip-exclamations");
    }
  }

  // 5) Append-content (add / include / mention X).
  if (hasAny(tokens, ADD_VERBS)) {
    const topic = parseAddTopic(noteLower, trimmedNote);
    if (topic) {
      const r = appendMention(nextBody, topic);
      if (r.changed) {
        nextBody = r.body;
        applied.push(`add:${topic}`);
      }
    }
  }

  // 6) Subject tweaks.
  if (nextSubject && /\bsubject\b/i.test(noteLower)) {
    // Heuristic: if the founder said "subject:", quote the rest as the new
    // subject. Otherwise just append a "(revised)" marker.
    const m = trimmedNote.match(/\bsubject\s*[:=]\s*(.+)/i);
    if (m) {
      nextSubject = m[1].trim().replace(/['"]/g, "").slice(0, 80);
      applied.push("subject:set");
    }
  }
  if (hasAny(tokens, LONGER)) {
    // We don't have great content to elaborate with, but we can at least
    // expand a single sentence into two so the body visibly grows.
    const expanded = nextBody.replace(
      /(this week's inbound)\??/i,
      "$1, plus what we'd say to the warm-but-stalled trial users",
    );
    if (expanded !== nextBody) {
      nextBody = expanded;
      applied.push("expand");
    }
  }

  return { body: nextBody, subject: nextSubject, applied, recognized };
}

/**
 * Generate a "revision lead-in" sentence the builder can prepend so the
 * founder's note is visibly acknowledged. Different copy depending on
 * which heuristics fired so the modal doesn't always say the same thing.
 */
export function revisionLeadIn(applied: string[], note: string): string {
  const cleanNote = note.trim().replace(/\s+/g, " ").slice(0, 140);
  if (applied.length === 0) {
    return `Per your note ("${cleanNote}"):`;
  }
  if (applied.some((a) => a.startsWith("sentences:"))) {
    return `Tightened to your length ("${cleanNote}"):`;
  }
  if (applied.includes("shorten")) {
    return `Tightened ("${cleanNote}"):`;
  }
  if (applied.includes("casual")) {
    return `More casual take ("${cleanNote}"):`;
  }
  if (applied.includes("formal")) {
    return `Polished ("${cleanNote}"):`;
  }
  if (applied.includes("bolder")) {
    return `Bolder ("${cleanNote}"):`;
  }
  if (applied.includes("strip-exclamations")) {
    return `Tone dialed down ("${cleanNote}"):`;
  }
  return `Per your note ("${cleanNote}"):`;
}
