import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module — Next.js should not bundle it.
  // Required so the agent runtime + dashboard can both import lib/state/db.ts.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
