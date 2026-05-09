"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Plug,
  ShieldQuestion,
  XCircle,
} from "lucide-react";

import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TOOLKIT_META, TOOLKIT_LOGO_URL } from "@/lib/ui/components/connection-meta";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/shared/types";



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
            <ToolkitLogo toolkit={toolkit} name={meta.name} />
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
