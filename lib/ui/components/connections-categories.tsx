"use client";

import { useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ConnectionCard } from "@/lib/ui/components/connection-card";
import { TOOLKIT_LOGO_URL } from "@/lib/ui/components/connection-meta";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/shared/types";

interface ToolkitRow {
  toolkit: string;
  name: string;
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
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const originalCount = new Map(groups.map((g) => [g.category, g.toolkits.length]));

  const filteredGroups = q
    ? groups
        .map((group) => {
          const categoryMatches = group.label.toLowerCase().includes(q);
          const toolkits = categoryMatches
            ? group.toolkits
            : group.toolkits.filter((t) => t.name.toLowerCase().includes(q));
          return { ...group, toolkits, categoryMatches };
        })
        .filter((g) => g.toolkits.length > 0)
    : groups.map((g) => ({ ...g, categoryMatches: false }));

  const allCollapsed = filteredGroups.every(({ category }) => collapsed[category]);

  const toggle = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  const toggleAll = () => {
    if (allCollapsed) {
      setCollapsed({});
    } else {
      setCollapsed(Object.fromEntries(filteredGroups.map(({ category }) => [category, true])));
    }
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tools or categories..."
            className="h-12 w-full rounded-xl border border-border bg-background pl-12 pr-12 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              <X className="size-5" />
            </button>
          )}
        </div>
        {!q && (
          <button
            type="button"
            onClick={toggleAll}
            className="shrink-0 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            {allCollapsed ? "Expand all" : "Collapse all"}
          </button>
        )}
      </div>

      {filteredGroups.length === 0 && (
        <div className="rounded-xl border border-dashed border-border/60 py-10 text-center text-sm text-muted-foreground">
          No tools found for &ldquo;{query}&rdquo;
        </div>
      )}

      {filteredGroups.map(({ category, label, toolkits, categoryMatches }) => {
        const isCollapsed = q ? false : (collapsed[category] ?? false);
        const connectedCount = toolkits.filter((t) => t.status === "connected").length;
        const isFiltered = q && !categoryMatches && toolkits.length < (originalCount.get(category) ?? 0);

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
                  {toolkits.length}{isFiltered ? ` of ${originalCount.get(category)}` : ""}
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
