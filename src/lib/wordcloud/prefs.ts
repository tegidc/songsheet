import { useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, DEFAULT_TYPOGRAPHY } from "./palettes";

// Palette, Typography, Sense scan and the lyrics toggle persist per user
// (§9 of the spec) but the app has no existing per-user preference mechanism
// — no localStorage hook, no Supabase settings table (confirmed by search).
// localStorage is the smallest honest choice here: it needs no migration, and
// these are display preferences, not data — losing them on a new device costs
// nothing but a re-pick. Keyed to match the app's existing storage key
// convention (`songsheet-auth` in lib/supabase.ts).

const STORAGE_KEY = "songsheet-wordcloud-prefs";

export interface WordCloudPrefs {
  palette: string;
  typography: string;
  senseScanOn: boolean;
  hideUsedLyrics: boolean;
}

const DEFAULT_PREFS: WordCloudPrefs = {
  palette: DEFAULT_PALETTE,
  typography: DEFAULT_TYPOGRAPHY,
  senseScanOn: false,
  hideUsedLyrics: true,
};

function readPrefs(): WordCloudPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

let prefs = readPrefs();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach(fn => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function writePrefs(next: Partial<WordCloudPrefs>) {
  prefs = { ...prefs, ...next };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage unavailable (private browsing, quota) — the session still works,
    // it just won't remember next time.
  }
  notify();
}

export function useWordCloudPrefs(): WordCloudPrefs & {
  setPalette: (p: string) => void;
  setTypography: (t: string) => void;
  setSenseScanOn: (v: boolean) => void;
  setHideUsedLyrics: (v: boolean) => void;
} {
  const current = useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_PREFS);
  return {
    ...current,
    setPalette: (palette: string) => writePrefs({ palette }),
    setTypography: (typography: string) => writePrefs({ typography }),
    setSenseScanOn: (senseScanOn: boolean) => writePrefs({ senseScanOn }),
    setHideUsedLyrics: (hideUsedLyrics: boolean) => writePrefs({ hideUsedLyrics }),
  };
}
