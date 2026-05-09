#!/usr/bin/env tsx
/**
 * Foundation-owned script: creates Composio-managed auth configs for the
 * 10 Tier-S toolkits (and 6 Tier-A) used by GMaestro personas.
 *
 * Idempotent: lists existing auth configs first; only creates what's missing.
 *
 * Output: writes the toolkit → authConfigId map to `~/.gmaestro/auth-configs.json`
 * for runtime use, AND prints the map so it can be committed to
 * lib/shared/auth-configs.ts (the static fallback for the shared hackathon
 * project).
 *
 * Run: pnpm tsx scripts/foundation/setup-auth-configs.ts
 */

import { Composio } from "@composio/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TIER_S = [
  "GMAIL",
  "GOOGLECALENDAR",
  "GOOGLESHEETS",
  "SLACK",
  "NOTION",
  "HUBSPOT",
  "LINEAR",
  "STRIPE",
  "GITHUB",
  "LINKEDIN",
] as const;

const TIER_A = [
  "APOLLO",
  "LOOM",
  "DISCORD",
  "INTERCOM",
  "TWITTER",
  "CALENDLY",
] as const;

const ALL_TOOLKITS = [...TIER_S, ...TIER_A];

async function main() {
  // Load API key from the saved Composio agent identity (the auto-signup output).
  const credsPath = path.join(os.homedir(), ".composio", "anonymous_user_data.json");
  if (!fs.existsSync(credsPath)) {
    console.error(
      `No Composio creds at ${credsPath}. Run agent-native signup first (curl https://agents.composio.dev/api/signup ...).`,
    );
    process.exit(1);
  }
  const creds = JSON.parse(fs.readFileSync(credsPath, "utf-8"));
  const apiKey = creds?.composio?.api_key;
  if (!apiKey) {
    console.error("Could not extract composio.api_key from creds file.");
    process.exit(1);
  }

  const composio = new Composio({ apiKey });

  // List existing auth configs so we don't double-create.
  const existing = await composio.authConfigs.list({ limit: 100 } as never).catch(
    (err: unknown) => {
      console.warn("authConfigs.list() failed; will attempt create-only:", err);
      return null;
    },
  );

  const existingByToolkit: Record<string, string> = {};
  if (existing && Array.isArray((existing as { items?: unknown[] }).items)) {
    for (const ac of (existing as { items: Array<Record<string, unknown>> }).items) {
      const toolkit = String(
        (ac as { toolkit?: { slug?: string } }).toolkit?.slug ??
          (ac as { toolkit_slug?: string }).toolkit_slug ??
          (ac as { app_name?: string }).app_name ??
          "",
      ).toUpperCase();
      const id = String((ac as { id?: string }).id ?? "");
      if (toolkit && id) {
        existingByToolkit[toolkit] = id;
      }
    }
    console.log(`Found ${Object.keys(existingByToolkit).length} existing auth configs.`);
  }

  const result: Record<string, string> = { ...existingByToolkit };

  for (const toolkit of ALL_TOOLKITS) {
    if (result[toolkit]) {
      console.log(`✓ ${toolkit} — already configured (${result[toolkit]})`);
      continue;
    }

    try {
      const created = await composio.authConfigs.create(toolkit, {
        name: toolkit,
        type: "use_composio_managed_auth",
      } as never);
      const id = String((created as { id?: string }).id ?? "");
      if (!id) {
        console.error(`✗ ${toolkit} — create returned no id:`, created);
        continue;
      }
      result[toolkit] = id;
      console.log(`+ ${toolkit} — created (${id})`);
    } catch (err) {
      console.error(`✗ ${toolkit} — create failed:`, err);
    }
  }

  // Persist for runtime use (not committed — per-machine).
  const outDir = path.join(os.homedir(), ".gmaestro");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "auth-configs.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + "\n");
  console.log(`\nWrote ${Object.keys(result).length} entries to ${outPath}`);

  // Print TS literal so it can be pasted into lib/shared/auth-configs.ts as the
  // shared-project fallback for the hackathon team.
  console.log("\n--- Paste into lib/shared/auth-configs.ts ---");
  console.log("export const AUTH_CONFIG_IDS: Record<string, string> = {");
  for (const [k, v] of Object.entries(result)) {
    console.log(`  ${k}: ${JSON.stringify(v)},`);
  }
  console.log("};");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
