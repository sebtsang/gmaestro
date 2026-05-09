"use client";

import { useState } from "react";
import {
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ConnectionStatus } from "@/lib/shared/types";

// Google product icons come from gstatic -- the S2 favicon service returns
// the generic Google G for any *.google.com domain.
// LinkedIn and Slack are served as inline SVGs because the simple-icons CDN
// intermittently removes these brands due to trademark enforcement.
// All other brands use the simple-icons CDN. Where simple-icons doesn't host
// a logo (smaller / niche tools), the card falls back to the Plug icon.
const TOOLKIT_LOGO_URL: Record<string, string> = {
  // Email
  GMAIL: "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_32dp.png",
  OUTLOOK: "https://cdn.simpleicons.org/microsoftoutlook",
  MAILCHIMP: "https://cdn.simpleicons.org/mailchimp",
  CUSTOMERIO: "https://cdn.simpleicons.org/customerio",
  // Calendar / meetings
  GOOGLECALENDAR: "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_32dp.png",
  CALENDLY: "https://cdn.simpleicons.org/calendly",
  ZOOM: "https://cdn.simpleicons.org/zoom",
  // CRM
  HUBSPOT: "https://cdn.simpleicons.org/hubspot",
  SALESFORCE: "https://cdn.simpleicons.org/salesforce",
  PIPEDRIVE: "https://cdn.simpleicons.org/pipedrive",
  // Knowledge
  NOTION: "https://cdn.simpleicons.org/notion",
  GOOGLESHEETS: "https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_32dp.png",
  // Messaging
  DISCORD: "https://cdn.simpleicons.org/discord",
  INTERCOM: "https://cdn.simpleicons.org/intercom",
  // Listening / lead sources
  REDDIT: "https://cdn.simpleicons.org/reddit",
  YOUTUBE: "https://cdn.simpleicons.org/youtube",
  // Research / web
  PERPLEXITY: "https://cdn.simpleicons.org/perplexity",
  CRUNCHBASE: "https://cdn.simpleicons.org/crunchbase",
  // Analytics
  MIXPANEL: "https://cdn.simpleicons.org/mixpanel",
  AMPLITUDE: "https://cdn.simpleicons.org/amplitude",
  POSTHOG: "https://cdn.simpleicons.org/posthog",
  // PM
  LINEAR: "https://cdn.simpleicons.org/linear",
  ASANA: "https://cdn.simpleicons.org/asana",
  JIRA: "https://cdn.simpleicons.org/jira",
  CLICKUP: "https://cdn.simpleicons.org/clickup",
  TRELLO: "https://cdn.simpleicons.org/trello",
  // Dev / payments
  GITHUB: "https://cdn.simpleicons.org/github",
  STRIPE: "https://cdn.simpleicons.org/stripe",
};

const TOOLKIT_META: Record<string, { name: string }> = {
  GMAIL: { name: "Gmail" },
  OUTLOOK: { name: "Outlook" },
  MAILCHIMP: { name: "Mailchimp" },
  CUSTOMERIO: { name: "Customer.io" },
  GOOGLECALENDAR: { name: "Google Calendar" },
  GOOGLESHEETS: { name: "Google Sheets" },
  CALENDLY: { name: "Calendly" },
  ZOOM: { name: "Zoom" },
  SLACK: { name: "Slack" },
  DISCORD: { name: "Discord" },
  INTERCOM: { name: "Intercom" },
  NOTION: { name: "Notion" },
  HUBSPOT: { name: "HubSpot" },
  SALESFORCE: { name: "Salesforce" },
  PIPEDRIVE: { name: "Pipedrive" },
  ATTIO: { name: "Attio" },
  REDDIT: { name: "Reddit" },
  YOUTUBE: { name: "YouTube" },
  LINKEDIN: { name: "LinkedIn" },
  APOLLO: { name: "Apollo" },
  TAVILY: { name: "Tavily" },
  EXA: { name: "Exa" },
  FIRECRAWL: { name: "Firecrawl" },
  PERPLEXITY: { name: "Perplexity" },
  HUNTER: { name: "Hunter" },
  CRUNCHBASE: { name: "Crunchbase" },
  CLAY: { name: "Clay" },
  LEMLIST: { name: "Lemlist" },
  INSTANTLY: { name: "Instantly" },
  SMARTLEAD: { name: "Smartlead" },
  SALESLOFT: { name: "Salesloft" },
  MIXPANEL: { name: "Mixpanel" },
  AMPLITUDE: { name: "Amplitude" },
  POSTHOG: { name: "PostHog" },
  GONG: { name: "Gong" },
  FIREFLIES: { name: "Fireflies" },
  CHORUS: { name: "Chorus" },
  LINEAR: { name: "Linear" },
  ASANA: { name: "Asana" },
  JIRA: { name: "Jira" },
  MONDAY: { name: "Monday" },
  CLICKUP: { name: "ClickUp" },
  TRELLO: { name: "Trello" },
  GITHUB: { name: "GitHub" },
  STRIPE: { name: "Stripe" },
};

function LinkedInLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path
        d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
        fill="#0A66C2"
      />
    </svg>
  );
}

function SlackLogo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <path
        d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.123 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.123a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"
        fill="#4A154B"
      />
    </svg>
  );
}

const INLINE_LOGOS: Partial<Record<string, () => React.JSX.Element>> = {
  LINKEDIN: LinkedInLogo,
  SLACK: SlackLogo,
};

function ToolkitLogo({ toolkit, name }: { toolkit: string; name: string }) {
  const [failed, setFailed] = useState(false);
  const InlineLogo = INLINE_LOGOS[toolkit];

  if (InlineLogo) return <InlineLogo />;

  const src = TOOLKIT_LOGO_URL[toolkit];
  if (!src || failed) {
    return <Plug className="size-6 text-muted-foreground" />;
  }

  return (
    <img
      src={src}
      alt={name}
      width={24}
      height={24}
      className="size-6"
      onError={() => setFailed(true)}
    />
  );
}

interface ConnectionCardProps {
  toolkit: string;
  status: ConnectionStatus | "disconnected";
  errorMessage?: string | null;
  /**
   * False when no Composio auth config has been pre-staged for this toolkit.
   * The card renders a disabled "API key needed" button with a "Setup required"
   * badge — clicking would just 400 from /api/connections/start.
   */
  authConfigured?: boolean;
}

function statusBadge(status: ConnectionStatus | "disconnected") {
  switch (status) {
    case "connected":
      return (
        <Badge
          variant="secondary"
          className="bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
        >
          <CheckCircle2 className="size-3" />
          Connected
        </Badge>
      );
    case "pending":
      return (
        <Badge
          variant="secondary"
          className="bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
        >
          <Loader2 className="size-3 animate-spin" />
          Pending
        </Badge>
      );
    case "failed":
      return (
        <Badge
          variant="secondary"
          className="bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
        >
          <XCircle className="size-3" />
          Failed
        </Badge>
      );
    case "revoked":
      return (
        <Badge
          variant="secondary"
          className="bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
        >
          <XCircle className="size-3" />
          Revoked
        </Badge>
      );
    default:
      return (
        <Badge
          variant="secondary"
          className="bg-muted text-muted-foreground"
        >
          <ShieldQuestion className="size-3" />
          Disconnected
        </Badge>
      );
  }
}

export function ConnectionCard({
  toolkit,
  status,
  errorMessage,
  authConfigured = true,
}: ConnectionCardProps) {
  const meta = TOOLKIT_META[toolkit] ?? { name: toolkit };
  const [pending, setPending] = useState(false);

  const startConnect = async () => {
    setPending(true);
    try {
      const res = await fetch(
        `/api/connections/start?toolkit=${encodeURIComponent(toolkit)}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { redirectUrl?: string };
      if (data.redirectUrl) {
        const popup = window.open(
          data.redirectUrl,
          `composio-${toolkit}`,
          "width=520,height=720",
        );
        if (!popup) {
          window.location.href = data.redirectUrl;
        }
      }
    } catch {
      // Surface gracefully -- connection errors are non-fatal.
    } finally {
      setPending(false);
    }
  };

  const isConnected = status === "connected";

  return (
    <Card className={`gap-3 p-4 ${authConfigured ? "" : "opacity-60"}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <ToolkitLogo toolkit={toolkit} name={meta.name} />
          </div>
          <div className="text-sm font-medium">{meta.name}</div>
        </div>
        {authConfigured ? (
          statusBadge(status)
        ) : (
          <Badge
            variant="secondary"
            className="bg-muted text-muted-foreground"
          >
            Setup required
          </Badge>
        )}
      </div>

      {errorMessage ? (
        <div className="rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {!authConfigured ? (
          <Button
            size="sm"
            variant="outline"
            disabled
            title="No Composio auth config wired yet. Add via scripts/foundation/setup-auth-configs.ts."
          >
            API key needed
          </Button>
        ) : isConnected ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={startConnect}
            disabled={pending}
          >
            Reconnect
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={startConnect}
            disabled={pending}
          >
            {pending ? (
              <>
                <Loader2 className="animate-spin" />
                Opening...
              </>
            ) : (
              <>
                <ExternalLink />
                Connect
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}
