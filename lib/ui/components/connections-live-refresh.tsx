"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Listens for the postMessage emitted by the Composio OAuth callback page
 * after a successful Connect Link, then re-fetches the server-rendered
 * connections list via router.refresh().
 */
export function ConnectionsLiveRefresh() {
  const router = useRouter();

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const data = e.data;
      if (
        data &&
        typeof data === "object" &&
        "type" in data &&
        data.type === "composio:connected"
      ) {
        router.refresh();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [router]);

  return null;
}
