import {
  ConnectionsCategories,
  type CategoryGroup,
} from "@/lib/ui/components/connections-categories";
import { ConnectionsLiveRefresh } from "@/lib/ui/components/connections-live-refresh";
import {
  DISPLAYED_TOOLKITS,
  isAuthConfigured,
} from "@/lib/shared/auth-configs";
import {
  TOOLKIT_CATEGORY,
  TOOLKIT_META,
  CATEGORY_ORDER,
  CATEGORY_LABEL,
  POPULAR_CATEGORY_ID,
  POPULAR_TOOLKITS,
  type ToolkitCategory,
} from "@/lib/ui/components/connection-meta";
import {
  getConnectionStatuses,
  type ToolkitConnection,
} from "@/lib/tools/connections";
import type { ConnectionStatus } from "@/lib/shared/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const USER_ID = process.env.GMAESTRO_USER_ID ?? "default";

/**
 * Map Composio's status enum onto the card's. Kept narrow so the UI doesn't
 * have to know about Composio internals.
 */
function toCardStatus(
  status: ToolkitConnection["status"],
): ConnectionStatus | "disconnected" {
  switch (status) {
    case "ACTIVE":
      return "connected";
    case "INITIALIZING":
      return "pending";
    case "EXPIRED":
      return "revoked";
    case "FAILED":
      return "failed";
    case "MISSING":
      return "disconnected";
  }
}

export default async function ConnectionsPage() {
  // Composio is the source of truth — no local connections table read.
  // We only ask about the slugs we display, which keeps the API call's
  // payload bounded. Failures here render every card as "disconnected"
  // (never throws) so a Composio outage doesn't 500 the whole page.
  let byToolkit = new Map<string, ToolkitConnection["status"]>();
  try {
    const statuses = await getConnectionStatuses(
      USER_ID,
      DISPLAYED_TOOLKITS.map((t) => t.toLowerCase()),
    );
    byToolkit = new Map(
      statuses.map((s) => [s.toolkit.toLowerCase(), s.status]),
    );
  } catch (err) {
    console.warn(
      `[connections] live status lookup failed; rendering all cards as disconnected: ${
        err instanceof Error ? err.message : err
      }`,
    );
  }

  // Group toolkits by category for visual organization. Anything without a
  // declared category falls into "other" so we never silently drop a slug.
  const byCategory = new Map<ToolkitCategory, string[]>();
  for (const toolkit of DISPLAYED_TOOLKITS) {
    const cat: ToolkitCategory = TOOLKIT_CATEGORY[toolkit] ?? "other";
    const arr = byCategory.get(cat) ?? [];
    arr.push(toolkit);
    byCategory.set(cat, arr);
  }
  const orderedCategories: ToolkitCategory[] = CATEGORY_ORDER
    .filter((c) => byCategory.has(c))
    .sort((a, b) => CATEGORY_LABEL[a].localeCompare(CATEGORY_LABEL[b]));

  const toRow = (toolkit: string) => ({
    toolkit,
    name: TOOLKIT_META[toolkit]?.name ?? toolkit,
    status: toCardStatus(byToolkit.get(toolkit.toLowerCase()) ?? "MISSING"),
    errorMessage: null,
    authConfigured: isAuthConfigured(toolkit),
  });

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-base font-semibold">Connections</h1>
        <p className="text-sm text-muted-foreground">
          Connect each toolkit once. Agents use them automatically - scoped
          to only the actions they need.
        </p>
        <p className="text-sm italic text-muted-foreground">
          Cards marked &ldquo;Setup required&rdquo; need an API key on
          Composio&rsquo;s side first.
        </p>
      </header>

      <ConnectionsCategories
        groups={[
          {
            category: POPULAR_CATEGORY_ID,
            label: "Popular",
            toolkits: POPULAR_TOOLKITS.map(toRow),
          },
          ...orderedCategories.map((category): CategoryGroup => ({
            category,
            label: CATEGORY_LABEL[category],
            toolkits: (byCategory.get(category) ?? []).map(toRow),
          })),
        ]}
      />

      <ConnectionsLiveRefresh />
    </div>
  );
}
