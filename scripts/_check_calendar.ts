import { Composio } from "@composio/core";
import "dotenv/config";

async function main() {
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });
  const userId = process.env.GMAESTRO_USER_ID ?? "default";

  for (const slug of ["googlecalendar", "gmail"]) {
    console.log(`\n=== ${slug} (userId=${userId}) ===`);
    const resp = await composio.connectedAccounts.list({
      userIds: [userId],
      toolkitSlugs: [slug],
    });
    const items = (resp as { items?: Array<{ id: string; status: string; createdAt?: string }> }).items ?? [];
    if (items.length === 0) {
      console.log("  (no connected accounts found)");
      continue;
    }
    for (const i of items) {
      console.log(`  ${i.id} status=${i.status} createdAt=${i.createdAt ?? "?"}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
