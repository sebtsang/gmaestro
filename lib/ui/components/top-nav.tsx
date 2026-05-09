"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, Network, Plug, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "Dashboard", icon: Workflow },
  { href: "/connections", label: "Connections", icon: Plug },
  { href: "/approvals", label: "Approvals", icon: ListChecks },
] as const;

export function TopNav() {
  const pathname = usePathname();

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
              href === "/" ? pathname === "/" : pathname.startsWith(href);
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
        <div className="ml-auto font-mono text-[10px] text-muted-foreground">
          local · ~/.gmaestro
        </div>
      </div>
    </header>
  );
}
