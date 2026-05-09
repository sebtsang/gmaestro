/**
 * Script-local SQLite + Drizzle client.
 *
 * lib/state/db.ts is wrapped in `import "server-only"` so Next.js refuses to
 * bundle it for the browser. That same import blocks `tsx` from loading it
 * outside Next, since `server-only` isn't a published runtime dep here. So
 * scripts open their own connection against the same db file + schema.
 *
 * Owned by: Session 3 (scripts/*).
 */

import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "@/lib/state/schema";

const DB_DIR = path.join(os.homedir(), ".gmaestro");
const DB_PATH = path.join(DB_DIR, "gmaestro.db");

if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

export const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db: BetterSQLite3Database<typeof schema> = drizzle(sqlite, {
  schema,
});

export { schema };
