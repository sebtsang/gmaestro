"use client";

import { useState } from "react";
import {
  Activity,
  BarChart3,
  Brain,
  Briefcase,
  Building2,
  Bug,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Code2,
  Compass,
  CreditCard,
  Database,
  DollarSign,
  ExternalLink,
  FileSpreadsheet,
  Flame,
  Globe,
  Hammer,
  Headphones,
  Heart,
  KanbanSquare,
  LineChart,
  ListChecks,
  Loader2,
  Mail,
  MailOpen,
  Megaphone,
  MessageCircle,
  MessageSquare,
  Mic,
  NotebookPen,
  Plug,
  RadioTower,
  Send,
  ShieldQuestion,
  Square,
  Target,
  TrendingUp,
  UserCircle,
  Users,
  Video,
  XCircle,
  PlaySquare,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ConnectionStatus } from "@/lib/shared/types";
import { cn } from "@/lib/utils";

const TOOLKIT_META: Record<
  string,
  { name: string; icon: LucideIcon; tone: string }
> = {
  // ----- Email -----
  GMAIL: { name: "Gmail", icon: Mail, tone: "text-rose-600" },
  OUTLOOK: { name: "Outlook", icon: MailOpen, tone: "text-blue-600" },
  MAILCHIMP: { name: "Mailchimp", icon: Megaphone, tone: "text-yellow-600" },
  CUSTOMERIO: { name: "Customer.io", icon: Heart, tone: "text-rose-500" },
  // ----- Calendar / meetings -----
  GOOGLECALENDAR: { name: "Google Calendar", icon: Calendar, tone: "text-blue-600" },
  CALENDLY: { name: "Calendly", icon: CalendarClock, tone: "text-blue-600" },
  ZOOM: { name: "Zoom", icon: Video, tone: "text-blue-500" },
  // ----- CRM -----
  HUBSPOT: { name: "HubSpot", icon: TrendingUp, tone: "text-orange-600" },
  SALESFORCE: { name: "Salesforce", icon: Building2, tone: "text-sky-600" },
  PIPEDRIVE: { name: "Pipedrive", icon: TrendingUp, tone: "text-emerald-600" },
  ATTIO: { name: "Attio", icon: Database, tone: "text-violet-600" },
  // ----- Knowledge / docs -----
  NOTION: { name: "Notion", icon: NotebookPen, tone: "text-foreground" },
  GOOGLESHEETS: { name: "Google Sheets", icon: FileSpreadsheet, tone: "text-emerald-600" },
  // ----- Messaging -----
  SLACK: { name: "Slack", icon: MessageSquare, tone: "text-violet-600" },
  DISCORD: { name: "Discord", icon: MessageCircle, tone: "text-indigo-600" },
  INTERCOM: { name: "Intercom", icon: MessageSquare, tone: "text-blue-600" },
  // ----- Listening / new lead sources -----
  REDDIT: { name: "Reddit", icon: RadioTower, tone: "text-orange-500" },
  YOUTUBE: { name: "YouTube", icon: PlaySquare, tone: "text-rose-600" },
  LINKEDIN: { name: "LinkedIn", icon: UserCircle, tone: "text-sky-600" },
  // ----- Research / web -----
  APOLLO: { name: "Apollo", icon: Compass, tone: "text-indigo-500" },
  TAVILY: { name: "Tavily", icon: Globe, tone: "text-cyan-600" },
  EXA: { name: "Exa", icon: Brain, tone: "text-violet-500" },
  FIRECRAWL: { name: "Firecrawl", icon: Flame, tone: "text-orange-500" },
  PERPLEXITY: { name: "Perplexity", icon: Brain, tone: "text-teal-500" },
  HUNTER: { name: "Hunter", icon: Target, tone: "text-amber-600" },
  CRUNCHBASE: { name: "Crunchbase", icon: DollarSign, tone: "text-blue-600" },
  CLAY: { name: "Clay", icon: Hammer, tone: "text-rose-500" },
  // ----- Outbound sequencers -----
  LEMLIST: { name: "Lemlist", icon: Send, tone: "text-amber-500" },
  INSTANTLY: { name: "Instantly", icon: Zap, tone: "text-yellow-500" },
  SMARTLEAD: { name: "Smartlead", icon: Send, tone: "text-violet-500" },
  SALESLOFT: { name: "Salesloft", icon: TrendingUp, tone: "text-rose-500" },
  // ----- Analytics -----
  MIXPANEL: { name: "Mixpanel", icon: BarChart3, tone: "text-violet-600" },
  AMPLITUDE: { name: "Amplitude", icon: LineChart, tone: "text-blue-500" },
  POSTHOG: { name: "PostHog", icon: Activity, tone: "text-orange-500" },
  // ----- Call intelligence -----
  GONG: { name: "Gong", icon: Mic, tone: "text-violet-600" },
  FIREFLIES: { name: "Fireflies", icon: Headphones, tone: "text-amber-500" },
  CHORUS: { name: "Chorus", icon: Mic, tone: "text-blue-600" },
  // ----- PM tools -----
  LINEAR: { name: "Linear", icon: Briefcase, tone: "text-indigo-600" },
  ASANA: { name: "Asana", icon: ListChecks, tone: "text-rose-600" },
  JIRA: { name: "Jira", icon: Bug, tone: "text-blue-600" },
  MONDAY: { name: "Monday", icon: Square, tone: "text-orange-500" },
  CLICKUP: { name: "ClickUp", icon: Target, tone: "text-violet-500" },
  TRELLO: { name: "Trello", icon: KanbanSquare, tone: "text-blue-500" },
  // ----- Dev / payments -----
  GITHUB: { name: "GitHub", icon: Code2, tone: "text-foreground" },
  STRIPE: { name: "Stripe", icon: CreditCard, tone: "text-violet-600" },
};

// Re-export so existing call sites that import from connection-card still work.
export {
  TOOLKIT_CATEGORY,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  type ToolkitCategory,
} from "./connection-meta";

// Suppress unused-import warnings (icons we may want for future tools).
void Users;

interface ConnectionCardProps {
  toolkit: string;
  status: ConnectionStatus | "disconnected";
  errorMessage?: string | null;
  /**
   * False when no Composio auth config has been pre-staged for this toolkit.
   * The card renders a disabled "Setup required" button instead of "Connect"
   * — clicking would just 400 from /api/connections/start.
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
  const meta = TOOLKIT_META[toolkit] ?? {
    name: toolkit,
    icon: Plug,
    tone: "text-muted-foreground",
  };
  const Icon = meta.icon;

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
        // Open in a popup so the dashboard stays put.
        const popup = window.open(
          data.redirectUrl,
          `composio-${toolkit}`,
          "width=520,height=720",
        );
        if (!popup) {
          // Fallback if popups are blocked.
          window.location.href = data.redirectUrl;
        }
      }
    } catch {
      // Endpoint may not exist yet (Session 2 territory). Surface gracefully.
    } finally {
      setPending(false);
    }
  };

  const isConnected = status === "connected";

  return (
    <Card className={cn("gap-3 p-4", !authConfigured && "opacity-60")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Icon className={cn("size-4", meta.tone)} />
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
                Opening…
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
