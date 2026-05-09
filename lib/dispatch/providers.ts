/**
 * Maps each approval artifact type to the Composio actions that can fulfill it,
 * one per provider toolkit. Drives both:
 *  - the approval card's provider picker UI (which providers does the founder
 *    have a choice between for THIS artifact?)
 *  - the post-approval dispatcher (which Composio action do we call when the
 *    founder picks "gmail"?)
 *
 * Adding a new provider for an artifact type = one entry here. No persona
 * changes, no LLM-side scope changes. The LLM never sees these — the
 * dispatcher uses them deterministically after founder approval.
 */

export interface ProviderAction {
  /** Toolkit slug as it appears in the local `connections` table. */
  toolkit: string;
  /** Composio action slug to call via `composio.tools.execute(action, ...)`. */
  action: string;
  /** Human label shown on the approval card's provider picker. */
  label: string;
  /**
   * Build the Composio action arguments from the approval's `proposed_action`.
   * The approval row carries the persona's full typed output (writer's draft,
   * scheduler's meeting, etc.) plus optional `_leadContext` / `_upstreamOutputs`
   * card metadata — this fn pulls out just the fields the action needs.
   */
  buildArgs: (proposed: Record<string, unknown>) => Record<string, unknown>;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Per-artifact provider catalog. Order = preference (first connected provider
 * is auto-selected if only one match). Add new providers here and the picker
 * picks them up automatically.
 */
export const PROVIDERS_BY_ARTIFACT: Record<string, ProviderAction[]> = {
  OutreachDraft: [
    {
      toolkit: "gmail",
      action: "GMAIL_SEND_EMAIL",
      label: "Gmail",
      buildArgs: (p) => ({
        recipient_email: asString(p.to) ?? asString(p.recipient_email),
        subject: asString(p.subject) ?? "",
        body: asString(p.body) ?? "",
      }),
    },
    {
      toolkit: "outlook",
      action: "OUTLOOK_SEND_EMAIL",
      label: "Outlook",
      buildArgs: (p) => ({
        to_email: asString(p.to) ?? asString(p.recipient_email),
        subject: asString(p.subject) ?? "",
        body: asString(p.body) ?? "",
      }),
    },
  ],
  CustomDeal: [
    {
      toolkit: "googlecalendar",
      action: "GOOGLECALENDAR_CREATE_EVENT",
      label: "Google Calendar",
      buildArgs: (p) => ({
        summary: asString(p.title) ?? asString(p.subject) ?? "Meeting",
        start_datetime: asString(p.startsAt),
        end_datetime: asString(p.endsAt),
        attendees: Array.isArray(p.attendees) ? p.attendees : [],
        description: asString(p.description) ?? "",
      }),
    },
  ],
  ActivationNudge: [
    {
      toolkit: "gmail",
      action: "GMAIL_SEND_EMAIL",
      label: "Gmail",
      buildArgs: (p) => ({
        recipient_email: asString(p.to) ?? asString(p.recipient_email),
        subject: asString(p.subject) ?? "",
        body: asString(p.body) ?? "",
      }),
    },
    {
      toolkit: "intercom",
      action: "INTERCOM_REPLY_TO_CONVERSATION",
      label: "Intercom",
      buildArgs: (p) => ({
        conversation_id: asString(p.conversationId),
        message_body: asString(p.body) ?? "",
      }),
    },
  ],
  CRMUpdate: [
    {
      toolkit: "hubspot",
      action: "HUBSPOT_CREATE_CONTACT",
      label: "HubSpot",
      buildArgs: (p) => ({
        properties: p.properties ?? {
          email: asString(p.email),
          firstname: asString(p.firstName),
          lastname: asString(p.lastName),
          company: asString(p.company),
        },
      }),
    },
  ],
};

export function getProvidersForArtifact(
  artifactType: string,
): ProviderAction[] {
  return PROVIDERS_BY_ARTIFACT[artifactType] ?? [];
}

export function findProvider(
  artifactType: string,
  toolkit: string,
): ProviderAction | null {
  const candidates = getProvidersForArtifact(artifactType);
  return candidates.find((c) => c.toolkit === toolkit) ?? null;
}
