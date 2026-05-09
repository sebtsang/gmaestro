/**
 * Singleton SQLite + Drizzle client.
 *
 * - DB at ~/.gmaestro/gmaestro.db
 * - WAL mode for concurrent reads alongside writes
 * - globalThis-cached so Next.js HMR doesn't open new file handles per reload
 *
 * Owned by: Foundation. Read-only for parallel sessions.
 */

import "server-only";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as schema from "./schema";

const DB_DIR = path.join(os.homedir(), ".gmaestro");
const DB_PATH = path.join(DB_DIR, "gmaestro.db");

type Conn = {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
};

declare global {
  // eslint-disable-next-line no-var
  var __gmaestroDb: Conn | undefined;
}

function createConn(): Conn {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

const conn: Conn = globalThis.__gmaestroDb ?? createConn();
if (process.env.NODE_ENV !== "production") {
  globalThis.__gmaestroDb = conn;
}

export const db = conn.db;
export const sqlite = conn.sqlite;
export type Db = typeof db;
export { schema };
