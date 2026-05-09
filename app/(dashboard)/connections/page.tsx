import { eq } from "drizzle-orm";
import { ConnectionCard } from "@/lib/ui/components/connection-card";
import { ConnectionsLiveRefresh } from "@/lib/ui/components/connections-live-refresh";
import { SUPPORTED_TOOLKITS } from "@/lib/shared/auth-configs";
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

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-base font-semibold">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect each toolkit once. Personas use them automatically — scoped
          to only the actions they need.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SUPPORTED_TOOLKITS.map((toolkit) => {
          const row = byToolkit.get(toolkit);
          return (
            <ConnectionCard
              key={toolkit}
              toolkit={toolkit}
              status={row?.status ?? "disconnected"}
              errorMessage={row?.errorMessage ?? null}
            />
          );
        })}
      </div>

      <ConnectionsLiveRefresh />
    </div>
  );
}
