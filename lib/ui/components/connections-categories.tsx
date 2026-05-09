"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ConnectionCard } from "@/lib/ui/components/connection-card";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/shared/types";

interface ToolkitRow {
  toolkit: string;
  status: ConnectionStatus | "disconnected";
  errorMessage: string | null;
  authConfigured: boolean;
}

export interface CategoryGroup {
  category: string;
  label: string;
  toolkits: ToolkitRow[];
}

interface ConnectionsCategoriesProps {
  groups: CategoryGroup[];
}

// Inline logo URLs mirrored from connection-card — needed to render the
// collapsed mini strip without importing the full card component.
const TOOLKIT_LOGO_URL: Record<string, string> = {
  GMAIL: "https://www.gstatic.com/images/branding/product/2x/gmail_2020q4_32dp.png",
  GOOGLECALENDAR: "https://www.gstatic.com/images/branding/product/2x/calendar_2020q4_32dp.png",
  GOOGLESHEETS: "https://www.gstatic.com/images/branding/product/2x/sheets_2020q4_32dp.png",
  NOTION: "https://cdn.simpleicons.org/notion",
  HUBSPOT: "https://cdn.simpleicons.org/hubspot",
  LINEAR: "https://cdn.simpleicons.org/linear",
  STRIPE: "https://cdn.simpleicons.org/stripe",
  GITHUB: "https://cdn.simpleicons.org/github",
  DISCORD: "https://cdn.simpleicons.org/discord",
  INTERCOM: "https://cdn.simpleicons.org/intercom",
  CALENDLY: "https://cdn.simpleicons.org/calendly",
  MAILCHIMP: "https://cdn.simpleicons.org/mailchimp",
  ZOOM: "https://cdn.simpleicons.org/zoom",
  REDDIT: "https://cdn.simpleicons.org/reddit",
  YOUTUBE: "https://cdn.simpleicons.org/youtube",
  PERPLEXITY: "https://cdn.simpleicons.org/perplexity",
  CRUNCHBASE: "https://cdn.simpleicons.org/crunchbase",
  MIXPANEL: "https://cdn.simpleicons.org/mixpanel",
  POSTHOG: "https://cdn.simpleicons.org/posthog",
  ASANA: "https://cdn.simpleicons.org/asana",
  JIRA: "https://cdn.simpleicons.org/jira",
  CLICKUP: "https://cdn.simpleicons.org/clickup",
  TRELLO: "https://cdn.simpleicons.org/trello",
  OUTLOOK: "https://www.google.com/s2/favicons?domain=outlook.com&sz=64",
  SALESFORCE: "https://www.google.com/s2/favicons?domain=salesforce.com&sz=64",
  PIPEDRIVE: "https://www.google.com/s2/favicons?domain=pipedrive.com&sz=64",
  SALESLOFT: "https://www.google.com/s2/favicons?domain=salesloft.com&sz=64",
  AMPLITUDE: "https://www.google.com/s2/favicons?domain=amplitude.com&sz=64",
  MONDAY: "https://www.google.com/s2/favicons?domain=monday.com&sz=64",
  ATTIO: "https://www.google.com/s2/favicons?domain=attio.com&sz=64",
  APOLLO: "https://www.google.com/s2/favicons?domain=apollo.io&sz=64",
  TAVILY: "https://www.google.com/s2/favicons?domain=tavily.com&sz=64",
  EXA: "https://www.google.com/s2/favicons?domain=exa.ai&sz=64",
  FIRECRAWL: "https://www.google.com/s2/favicons?domain=firecrawl.dev&sz=64",
  HUNTER: "https://www.google.com/s2/favicons?domain=hunter.io&sz=64",
  CLAY: "https://www.google.com/s2/favicons?domain=clay.com&sz=64",
  CUSTOMERIO: "https://www.google.com/s2/favicons?domain=customer.io&sz=64",
  LEMLIST: "https://www.google.com/s2/favicons?domain=lemlist.com&sz=64",
  INSTANTLY: "https://www.google.com/s2/favicons?domain=instantly.ai&sz=64",
  SMARTLEAD: "https://www.google.com/s2/favicons?domain=smartlead.ai&sz=64",
  GONG: "https://www.google.com/s2/favicons?domain=gong.io&sz=64",
  FIREFLIES: "https://www.google.com/s2/favicons?domain=fireflies.ai&sz=64",
  CHORUS: "https://www.google.com/s2/favicons?domain=chorus.ai&sz=64",
};

// Inline SVGs for brands the CDN intermittently removes.
const LINKEDIN_SVG = (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" fill="#0A66C2" />
  </svg>
);
const SLACK_SVG = (
  <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zm2.521-10.123a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.123 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.123a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" fill="#4A154B" />
  </svg>
);
const INLINE_SVG: Record<string, React.ReactNode> = {
  LINKEDIN: LINKEDIN_SVG,
  SLACK: SLACK_SVG,
};

function MiniLogo({ toolkit }: { toolkit: string }) {
  const [failed, setFailed] = useState(false);
  if (INLINE_SVG[toolkit]) return <>{INLINE_SVG[toolkit]}</>;
  const src = TOOLKIT_LOGO_URL[toolkit];
  if (!src || failed) return null;
  return (
    <img
      src={src}
      alt=""
      width={16}
      height={16}
      className="size-4 object-contain"
      onError={() => setFailed(true)}
    />
  );
}

export function ConnectionsCategories({ groups }: ConnectionsCategoriesProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const allCollapsed = groups.every(({ category }) => collapsed[category]);

  const toggle = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsed({});
    } else {
      setCollapsed(Object.fromEntries(groups.map(({ category }) => [category, true])));
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={toggleAll}
          className="text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {allCollapsed ? "Expand all" : "Collapse all"}
        </button>
      </div>

      {groups.map(({ category, label, toolkits }) => {
        const isCollapsed = collapsed[category] ?? false;
        const connectedCount = toolkits.filter((t) => t.status === "connected").length;

        return (
          <section
            key={category}
            className={cn(
              "rounded-xl border bg-muted/40 transition-colors",
              !isCollapsed && "border-border",
              isCollapsed && "border-border/60",
            )}
          >
            <button
              type="button"
              onClick={() => toggle(category)}
              className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/60 rounded-xl transition-colors"
            >
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                  isCollapsed && "-rotate-90",
                )}
              />
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>

              {isCollapsed && (
                <div className="mx-2 flex items-center gap-1">
                  {toolkits.slice(0, 6).map(({ toolkit }) => (
                    <div key={toolkit} className="size-4 shrink-0">
                      <MiniLogo toolkit={toolkit} />
                    </div>
                  ))}
                  {toolkits.length > 6 && (
                    <span className="text-[10px] text-muted-foreground/50">
                      +{toolkits.length - 6}
                    </span>
                  )}
                </div>
              )}

              <div className="ml-auto flex items-center gap-2">
                {connectedCount > 0 && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                    {connectedCount} connected
                  </span>
                )}
                <span className="text-xs tabular-nums text-muted-foreground/50">
                  {toolkits.length}
                </span>
              </div>
            </button>

            {!isCollapsed && (
              <>
                <div className="mx-4 border-t border-border/60" />
                <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                  {toolkits.map(({ toolkit, status, errorMessage, authConfigured }) => (
                    <ConnectionCard
                      key={toolkit}
                      toolkit={toolkit}
                      status={status}
                      errorMessage={errorMessage}
                      authConfigured={authConfigured}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
