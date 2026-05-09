import { Composio } from "@composio/core";
import "dotenv/config";

async function main() {
  const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY! });

  const list = await composio.authConfigs.list();
  const items =
    (list as { items?: Array<{ id: string; toolkit?: { slug?: string } }> })
      .items ?? [];
  console.log(`Found ${items.length} auth config(s) for this API key:`);
  for (const i of items.slice(0, 30)) {
    console.log(`  ${i.id} (${i.toolkit?.slug ?? "?"})`);
  }

  const gmailId = "ac_2hputMiwYvxP";
  console.log(`\nLooking up ${gmailId} directly...`);
  try {
    const config = await composio.authConfigs.get(gmailId);
    console.log("FOUND:", JSON.stringify(config, null, 2).slice(0, 500));
  } catch (err) {
    console.log("NOT FOUND:", err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
