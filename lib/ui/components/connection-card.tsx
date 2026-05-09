"use client";

import { useState } from "react";
import {
  Briefcase,
  Calendar,
  CalendarClock,
  CheckCircle2,
  Code2,
  CreditCard,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  NotebookPen,
  Plug,
  ShieldQuestion,
  TrendingUp,
  UserCircle,
  XCircle,
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
  GMAIL: { name: "Gmail", icon: Mail, tone: "text-rose-600" },
  GOOGLECALENDAR: { name: "Google Calendar", icon: Calendar, tone: "text-blue-600" },
  GOOGLESHEETS: { name: "Google Sheets", icon: FileSpreadsheet, tone: "text-emerald-600" },
  SLACK: { name: "Slack", icon: MessageSquare, tone: "text-violet-600" },
  NOTION: { name: "Notion", icon: NotebookPen, tone: "text-foreground" },
  HUBSPOT: { name: "HubSpot", icon: TrendingUp, tone: "text-orange-600" },
  LINEAR: { name: "Linear", icon: Briefcase, tone: "text-indigo-600" },
  STRIPE: { name: "Stripe", icon: CreditCard, tone: "text-violet-600" },
  GITHUB: { name: "GitHub", icon: Code2, tone: "text-foreground" },
  LINKEDIN: { name: "LinkedIn", icon: UserCircle, tone: "text-sky-600" },
  DISCORD: { name: "Discord", icon: MessageCircle, tone: "text-indigo-600" },
  INTERCOM: { name: "Intercom", icon: MessageSquare, tone: "text-blue-600" },
  CALENDLY: { name: "Calendly", icon: CalendarClock, tone: "text-blue-600" },
};

interface ConnectionCardProps {
  toolkit: string;
  status: ConnectionStatus | "disconnected";
  errorMessage?: string | null;
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
    <Card className="gap-3 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <Icon className={cn("size-4", meta.tone)} />
          </div>
          <div className="text-sm font-medium">{meta.name}</div>
        </div>
        {statusBadge(status)}
      </div>

      {errorMessage ? (
        <div className="rounded-md bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-700 dark:text-rose-300">
          {errorMessage}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        {isConnected ? (
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
