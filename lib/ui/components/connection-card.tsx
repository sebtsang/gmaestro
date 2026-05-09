"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TOOLKIT_META } from "@/lib/ui/components/connection-meta";
import { ToolkitLogo } from "@/lib/ui/components/toolkit-logo";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/shared/types";

interface ConnectionCardProps {
  toolkit: string;
  status: ConnectionStatus | "disconnected";
  errorMessage?: string | null;
  authConfigured?: boolean;
}

const BADGE_EMERALD = "bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300";
const BADGE_AMBER = "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300";
const BADGE_ROSE = "bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300";

function statusBadge(status: ConnectionStatus | "disconnected") {
  switch (status) {
    case "connected":
      return (
        <Badge variant="secondary" className={BADGE_EMERALD}>
          <CheckCircle2 className="size-3" />
          Connected
        </Badge>
      );
    case "pending":
      return (
        <Badge variant="secondary" className={BADGE_AMBER}>
          <Loader2 className="size-3 animate-spin" />
          Pending
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="secondary" className={BADGE_ROSE}>
          <XCircle className="size-3" />
          Failed
        </Badge>
      );
    case "revoked":
      return (
        <Badge variant="secondary" className={BADGE_ROSE}>
          <XCircle className="size-3" />
          Revoked
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="bg-muted text-muted-foreground">
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
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        toast.error(
          body.error ?? `Couldn't start ${meta.name} connect (HTTP ${res.status}).`,
        );
        return;
      }
      const data = (await res.json()) as { redirectUrl?: string };
      if (!data.redirectUrl) {
        toast.error(`Composio didn't return a connect URL for ${meta.name}.`);
        return;
      }
      const popup = window.open(
        data.redirectUrl,
        `composio-${toolkit}`,
        "width=520,height=720",
      );
      if (!popup) {
        // Popup blocked — fall back to full-page redirect.
        window.location.href = data.redirectUrl;
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : `Couldn't connect to ${meta.name}.`,
      );
    } finally {
      setPending(false);
    }
  };

  const isConnected = status === "connected";

  function renderButton() {
    if (!authConfigured) {
      return (
        <a
          href="https://app.composio.dev/your_apps"
          target="_blank"
          rel="noopener noreferrer"
          title="Create an auth config in Composio, then add the ID to SHARED_AUTH_CONFIG_IDS in lib/shared/auth-configs.ts."
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          <ArrowUpRight />
          Set up on Composio
        </a>
      );
    }
    if (isConnected) {
      return (
        <Button variant="ghost" size="sm" onClick={startConnect} disabled={pending}>
          Reconnect
        </Button>
      );
    }
    return (
      <Button size="sm" onClick={startConnect} disabled={pending}>
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
    );
  }

  return (
    <Card className={cn("gap-3 p-4", !authConfigured && "border-amber-200/70 dark:border-amber-800/50")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-muted p-2">
            <ToolkitLogo toolkit={toolkit} name={meta.name} size="md" fallback="plug" />
          </div>
          <div className="text-sm font-medium">{meta.name}</div>
        </div>
        {authConfigured ? (
          statusBadge(status)
        ) : (
          <Badge variant="secondary" className={BADGE_AMBER}>
            <ShieldQuestion className="size-3" />
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
        {renderButton()}
      </div>
    </Card>
  );
}
