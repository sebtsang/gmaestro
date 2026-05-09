#!/usr/bin/env node
/**
 * GMaestro CLI entry point.
 *
 * STATUS: STUB. Session 3 fills in the real implementations of `setup`,
 * `dev`, `reset`, and `doctor` per the launch prompt in PLAN.md.
 *
 * This stub exists so:
 * - package.json's `bin` entry resolves at install time
 * - `pnpm gmaestro --help` doesn't crash during foundation
 * - Session 3 has a clear file to take over
 *
 * Session 3 owns this file end-to-end after Foundation merges.
 */

import { Command } from "commander";

const program = new Command();

program
  .name("gmaestro")
  .description("Local-first AI GTM team — multi-persona Claude agents over Composio")
  .version("0.1.0");

program
  .command("setup")
  .description("Interactive wizard: configure API keys, init SQLite, test connectivity")
  .action(() => {
    console.log("[stub] setup — Session 3 implements this");
    process.exit(1);
  });

program
  .command("dev")
  .description("Start the GMaestro dashboard at http://localhost:3000")
  .action(() => {
    console.log("[stub] dev — Session 3 implements this");
    process.exit(1);
  });

program
  .command("reset")
  .description("Reset local SQLite to a clean demo-seeded state")
  .action(() => {
    console.log("[stub] reset — Session 3 implements this");
    process.exit(1);
  });

program
  .command("doctor")
  .description("Check API keys, SQLite, network, Anthropic tier")
  .action(() => {
    console.log("[stub] doctor — Session 3 implements this");
    process.exit(1);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err);
  process.exit(1);
});
