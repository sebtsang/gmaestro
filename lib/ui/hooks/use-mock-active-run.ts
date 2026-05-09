"use client";

/**
 * localStorage-backed shim for mock-mode active runs.
 *
 * Real mode persists everything in SQLite; mock mode has no DB. This shim
 * gives mock demos refresh-survival: the prompt + start time are stashed
 * client-side at submit time, then read back when the run detail page
 * mounts. Mock-driver events replay fresh on each mount — that's fine since
 * they're synthetic anyway.
 *
 * Stored under one key per run id, plus an "active" pointer for the resume
 * pill / drawer to find the most-recent run cheaply.
 */

const KEY = (id: string) => `gmaestro:mock-run:${id}`;
const ACTIVE_KEY = "gmaestro:mock-run:active-id";

export interface MockRunSnapshot {
  id: string;
  prompt: string;
  startedAt: string; // ISO
}

export function saveMockRun(snapshot: MockRunSnapshot): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY(snapshot.id), JSON.stringify(snapshot));
    window.localStorage.setItem(ACTIVE_KEY, snapshot.id);
  } catch {
    // QuotaExceeded etc. — non-fatal.
  }
}

export function loadMockRun(id: string): MockRunSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY(id));
    if (!raw) return null;
    return JSON.parse(raw) as MockRunSnapshot;
  } catch {
    return null;
  }
}
