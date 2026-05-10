/**
 * Canonical metadata for the founder's company profile.
 *
 * Single source of truth for:
 * - Field order (required first, optional after) — used by the settings form
 *   and the dashboard card to render sections in the same sequence.
 * - Human labels (long + short) — short labels are what appears in
 *   "Still missing: company name, ICP." style sentences; long labels head
 *   form rows + card sections.
 * - Length caps + array caps — kept in lockstep with `CompanyProfileUpdateSchema`
 *   in `lib/shared/schemas.ts`, so client-side counters stop founders from
 *   submitting payloads that the server will 400.
 * - Per-persona slice map (`COMPANY_PROFILE_SLICES`) — the dispatcher in
 *   `lib/state/workflows.ts` re-imports this so persona attribution stays in
 *   sync with what each persona actually receives in `input.companyProfile`.
 *
 * Anything that touches a profile field — form, card, error toast, persona
 * dispatch — should read from here. Don't fork.
 */

import type { CompanyProfile, PersonaId } from "./types";

/**
 * Field-form view of CompanyProfile — only the columns the founder edits.
 * Excludes infrastructure columns (`userId`, `createdAt`, `updatedAt`).
 */
export type CompanyProfileFieldKey = Exclude<
  keyof CompanyProfile,
  "userId" | "createdAt" | "updatedAt"
>;

/**
 * Per-persona slice of the founder's company profile that gets spliced into
 * each Specialist's input as `companyProfile: {...}`. Selective rather than
 * blanket — operational personas (Slack Digest, CRM Logger, Pipeline Reporter,
 * Linear Filer, Scheduler) don't need company copy, so their token budgets
 * stay lean.
 *
 * Keep this aligned with the prompt files under `lib/personas/prompts/` —
 * each prompt's "Company context" section reads the fields named here.
 */
export const COMPANY_PROFILE_SLICES: Partial<
  Record<PersonaId, ReadonlyArray<CompanyProfileFieldKey>>
> = {
  researcher: ["companyName", "productDescription"],
  qualifier: ["companyName", "oneLiner", "productDescription", "icp"],
  strategist: [
    "companyName",
    "oneLiner",
    "positioning",
    "valueProps",
    "competitors",
    "voiceTone",
  ],
  writer: ["companyName", "oneLiner", "productDescription", "voiceTone"],
  "brief-writer": [
    "companyName",
    "oneLiner",
    "productDescription",
    "icp",
    "positioning",
    "valueProps",
    "competitors",
    "voiceTone",
  ],
  activation: ["companyName", "oneLiner", "productDescription", "voiceTone"],
  "feedback-tagger": ["companyName", "productDescription"],
  "theme-synthesizer": ["companyName", "productDescription"],
  // Scheduler, CRM Logger, Pipeline Reporter, Slack Digest, Linear Filer:
  // operational personas. They don't reason about customers — they execute.
};

/**
 * Inverted slice map: which personas read each field. Derived once at module
 * load — exported for the form/card to render "Read by X, Y, Z" attribution
 * without re-deriving on every render.
 */
export const PERSONAS_BY_FIELD: Readonly<
  Record<CompanyProfileFieldKey, ReadonlyArray<PersonaId>>
> = (() => {
  // Pre-populate every key with an empty array so callers can index any
  // field without optional chaining (sourceUrl has no readers but still
  // needs to be safe to look up).
  const out: Record<string, PersonaId[]> = {};
  for (const key of [
    "companyName",
    "oneLiner",
    "productDescription",
    "icp",
    "positioning",
    "voiceTone",
    "valueProps",
    "competitors",
    "sourceUrl",
  ] satisfies CompanyProfileFieldKey[]) {
    out[key] = [];
  }
  for (const [personaId, fields] of Object.entries(COMPANY_PROFILE_SLICES) as Array<
    [PersonaId, ReadonlyArray<CompanyProfileFieldKey>]
  >) {
    if (!fields) continue;
    for (const field of fields) {
      out[field].push(personaId);
    }
  }
  return out as Record<CompanyProfileFieldKey, ReadonlyArray<PersonaId>>;
})();

/**
 * UI rendering kind — drives which input control the form picks and how
 * the dashboard card renders the value.
 */
export type CompanyProfileFieldKind =
  | "text"
  | "textarea"
  | "url"
  | "tagsByLine"
  | "tagsByComma";

export interface CompanyProfileFieldMeta {
  key: CompanyProfileFieldKey;
  /** Long label for form rows + card section headers. */
  label: string;
  /** Lower-case label for inline error sentences ("Still missing: X."). */
  shortLabel: string;
  /** Description / hint text shown under the form label. */
  description?: string;
  placeholder?: string;
  required: boolean;
  kind: CompanyProfileFieldKind;
  /** Hard cap from `CompanyProfileUpdateSchema`. Keep in sync. */
  maxLength?: number;
  /** Tag-list caps from `CompanyProfileUpdateSchema`. Keep in sync. */
  maxItems?: number;
  maxItemLength?: number;
}

/**
 * Canonical render order. Required fields first (so a founder filling the
 * form top-to-bottom hits everything they need before reaching optionals),
 * then optionals grouped by topic (positioning + voice → wording-shaping;
 * value props + competitors → angle inputs; sourceUrl → housekeeping).
 *
 * Settings form, dashboard card, and partial-save toast all walk this order.
 */
export const COMPANY_PROFILE_FIELD_ORDER: ReadonlyArray<CompanyProfileFieldKey> = [
  "companyName",
  "oneLiner",
  "productDescription",
  "icp",
  "positioning",
  "voiceTone",
  "valueProps",
  "competitors",
  "sourceUrl",
];

/**
 * The subset that workflow runs require to be non-empty before dispatch.
 * Mirrored in `app/api/runs/route.ts`'s 409 path. Order matches the form so
 * "missing X, Y" reads top-to-bottom.
 */
export const REQUIRED_COMPANY_PROFILE_FIELDS: ReadonlyArray<CompanyProfileFieldKey> =
  ["companyName", "oneLiner", "productDescription", "icp"];

export const COMPANY_PROFILE_FIELDS: Record<
  CompanyProfileFieldKey,
  CompanyProfileFieldMeta
> = {
  companyName: {
    key: "companyName",
    label: "Company name",
    shortLabel: "company name",
    placeholder: "Anvil",
    required: true,
    kind: "text",
    maxLength: 140,
  },
  oneLiner: {
    key: "oneLiner",
    label: "One-liner",
    shortLabel: "one-liner",
    description:
      "≤140 chars. The plain-English summary you'd give in an elevator.",
    placeholder:
      "Analytics for hardware engineers shipping firmware-heavy products.",
    required: true,
    kind: "text",
    maxLength: 140,
  },
  productDescription: {
    key: "productDescription",
    label: "What the product does",
    shortLabel: "product description",
    description:
      "Markdown ok. What it actually does, who it's for, key capabilities.",
    placeholder:
      "Anvil records every firmware build's runtime telemetry and lets engineers diff two builds in 90 seconds…",
    required: true,
    kind: "textarea",
    maxLength: 4000,
  },
  icp: {
    key: "icp",
    label: "ICP (ideal customer)",
    shortLabel: "ICP",
    description: "Markdown ok. Who buys, what makes them a fit.",
    placeholder:
      "Hardware companies 20–500 employees shipping connected products. Buyer is the firmware-engineering lead or VP Engineering. Strong fit signals: previous incidents traced to firmware regressions, multiple production builds per week.",
    required: true,
    kind: "textarea",
    maxLength: 2000,
  },
  positioning: {
    key: "positioning",
    label: "Positioning",
    shortLabel: "positioning",
    description: "“We are X for Y, unlike Z.”",
    placeholder:
      "We're the only telemetry tool that diffs runtime behavior between firmware builds — Datadog and Sentry both stop at the cloud edge.",
    required: false,
    kind: "textarea",
    maxLength: 2000,
  },
  voiceTone: {
    key: "voiceTone",
    label: "Voice / tone",
    shortLabel: "voice / tone",
    description: "How you sound in writing.",
    placeholder:
      "Direct, technically literate, no hype words. Lowercase-first headers. We sign off as the founder, not 'the team'.",
    required: false,
    kind: "textarea",
    maxLength: 1000,
  },
  valueProps: {
    key: "valueProps",
    label: "Value props",
    shortLabel: "value props",
    description: "One per line. Up to 8.",
    placeholder:
      "90-second build-vs-build runtime diff\nNo SDK install on devices in the field\nWorks alongside existing Datadog/Sentry pipes",
    required: false,
    kind: "tagsByLine",
    maxItems: 8,
    maxItemLength: 140,
  },
  competitors: {
    key: "competitors",
    label: "Competitors",
    shortLabel: "competitors",
    description: "Comma-separated. Names of products you're commonly compared against.",
    placeholder: "Datadog, Sentry, New Relic",
    required: false,
    kind: "tagsByComma",
    maxItems: 8,
    maxItemLength: 140,
  },
  sourceUrl: {
    key: "sourceUrl",
    label: "Website URL (source)",
    shortLabel: "website URL",
    description:
      "Stored alongside the profile so 'Auto-fill from website' has a default next time.",
    placeholder: "https://yourcompany.com",
    required: false,
    kind: "url",
  },
};

/**
 * Convenience: the "still missing" sentence the dashboard card and partial-
 * save toast both produce. Keeps wording consistent.
 */
export function formatMissingFieldsList(
  fields: ReadonlyArray<CompanyProfileFieldKey>,
): string {
  return fields.map((f) => COMPANY_PROFILE_FIELDS[f].shortLabel).join(", ");
}
