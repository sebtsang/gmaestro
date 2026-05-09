"use client";

import { useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { ConnectionCard } from "@/lib/ui/components/connection-card";
import { POPULAR_CATEGORY_ID } from "@/lib/ui/components/connection-meta";
import { ToolkitLogo } from "@/lib/ui/components/toolkit-logo";
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


export function ConnectionsCategories({ groups }: ConnectionsCategoriesProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      groups.filter((g) => g.category !== POPULAR_CATEGORY_ID).map((g) => [g.category, true]),
    ),
  );
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

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

  const originalCount = q
    ? new Map(groups.map((g) => [g.category, g.toolkits.length]))
    : null;

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
        const isFiltered = q && !categoryMatches && toolkits.length < (originalCount?.get(category) ?? 0);

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
                      <ToolkitLogo toolkit={toolkit} size="sm" />
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
                  {toolkits.length}{isFiltered ? ` of ${originalCount?.get(category)}` : ""}
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
