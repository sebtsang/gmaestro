import { defineConfig } from "drizzle-kit";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const dbDir = path.join(os.homedir(), ".gmaestro");
const dbPath = path.join(dbDir, "gmaestro.db");

// drizzle-kit doesn't create parent directories automatically; ensure it exists
// so `pnpm db:push` works on a fresh install.
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export default defineConfig({
  out: "./drizzle/migrations",
  schema: "./lib/state/schema.ts",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
});
