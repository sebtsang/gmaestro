"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { History, ListChecks, Network, Plug, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveRunsStrip } from "@/lib/ui/components/live-runs-strip";
import { RunsDrawer } from "@/lib/ui/components/runs-drawer";

const LINKS = [
  { href: "/", label: "Dashboard", icon: Workflow },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/approvals", label: "Approvals", icon: ListChecks },
] as const;

export function TopNav() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-12 w-full max-w-7xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-2 font-mono text-sm font-semibold">
          <Network className="size-4" />
          <span>gmaestro</span>
        </Link>
        <nav className="flex items-center gap-1">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/"
                ? pathname === "/" || pathname.startsWith("/runs/")
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                <Icon className="size-3" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-2 min-w-0 flex-1 overflow-x-auto">
          <LiveRunsStrip />
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            title="Open runs (⌘K)"
          >
            <History className="size-3" />
            <span>Runs</span>
            <kbd className="ml-1 rounded border border-border bg-muted px-1 font-mono text-[9px]">
              ⌘K
            </kbd>
          </button>
          <span className="font-mono text-[10px] text-muted-foreground">
            local · ~/.gmaestro
          </span>
        </div>
      </div>
      <RunsDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </header>
  );
}
