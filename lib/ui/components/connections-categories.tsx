"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ConnectionCard } from "@/lib/ui/components/connection-card";
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

export function ConnectionsCategories({ groups }: ConnectionsCategoriesProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (cat: string) =>
    setCollapsed((prev) => ({ ...prev, [cat]: !prev[cat] }));

  return (
    <div className="grid gap-3">
      {groups.map(({ category, label, toolkits }) => {
        const isCollapsed = collapsed[category] ?? false;
        return (
          <section
            key={category}
            className="rounded-xl border border-border bg-muted/40 px-4 py-3"
          >
            <button
              type="button"
              onClick={() => toggle(category)}
              className="flex w-full items-center gap-2 text-left"
            >
              {isCollapsed ? (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </span>
              <span className="ml-auto text-xs tabular-nums text-muted-foreground/50">
                {toolkits.length}
              </span>
            </button>

            {!isCollapsed && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
            )}
          </section>
        );
      })}
    </div>
  );
}
