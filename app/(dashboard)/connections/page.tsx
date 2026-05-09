import { eq } from "drizzle-orm";
import { ConnectionCard } from "@/lib/ui/components/connection-card";
import { ConnectionsLiveRefresh } from "@/lib/ui/components/connections-live-refresh";
import {
  DISPLAYED_TOOLKITS,
  isAuthConfigured,
} from "@/lib/shared/auth-configs";
import {
  TOOLKIT_CATEGORY,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  type ToolkitCategory,
} from "@/lib/ui/components/connection-meta";
import { db, schema } from "@/lib/state/db";
import type { ConnectionStatus } from "@/lib/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const USER_ID = process.env.GMAESTRO_USER_ID ?? "default";

interface ConnectionRow {
  status: ConnectionStatus;
  errorMessage: string | null;
}

async function loadConnections(): Promise<Map<string, ConnectionRow>> {
  const rows = await db
    .select({
      toolkit: schema.connections.toolkit,
      status: schema.connections.status,
      errorMessage: schema.connections.errorMessage,
    })
    .from(schema.connections)
    .where(eq(schema.connections.userId, USER_ID));

  const map = new Map<string, ConnectionRow>();
  for (const row of rows) {
    map.set(row.toolkit.toUpperCase(), {
      status: row.status,
      errorMessage: row.errorMessage,
    });
  }
  return map;
}

export default async function ConnectionsPage() {
  const byToolkit = await loadConnections();

  // Group toolkits by category for visual organization. Anything without a
  // declared category falls into "other" so we never silently drop a slug.
  const byCategory = new Map<ToolkitCategory, string[]>();
  for (const toolkit of DISPLAYED_TOOLKITS) {
    const cat: ToolkitCategory = TOOLKIT_CATEGORY[toolkit] ?? "other";
    const arr = byCategory.get(cat) ?? [];
    arr.push(toolkit);
    byCategory.set(cat, arr);
  }
  const orderedCategories: ToolkitCategory[] = CATEGORY_ORDER.filter((c) =>
    byCategory.has(c),
  );

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-base font-semibold">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect each toolkit once. Personas use them automatically — scoped
          to only the actions they need. Tools marked &ldquo;Setup
          required&rdquo; need an API key on Composio&rsquo;s side first.
        </p>
      </header>

      {orderedCategories.map((category) => (
        <section key={category} className="grid gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {CATEGORY_LABEL[category]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(byCategory.get(category) ?? []).map((toolkit) => {
              const row = byToolkit.get(toolkit);
              return (
                <ConnectionCard
                  key={toolkit}
                  toolkit={toolkit}
                  status={row?.status ?? "disconnected"}
                  errorMessage={row?.errorMessage ?? null}
                  authConfigured={isAuthConfigured(toolkit)}
                />
              );
            })}
          </div>
        </section>
      ))}

      <ConnectionsLiveRefresh />
    </div>
  );
}
