import { useSyncExternalStore } from "react";

/**
 * Per-device display and playback preferences: the Play instrument, the theme,
 * and the "show chord function" toggle.
 *
 * These are deliberately not song data. They live in localStorage, never in
 * `projects.data`, so changing one cannot trigger an autosave or a Supabase
 * write — the zero-write invariant holds by construction, not by care.
 *
 * Kept beside the Word Cloud's own store (`lib/wordcloud/prefs.ts`) rather than
 * merged into it: that one is the cloud canvas's palette, scoped to one view,
 * and the two change for different reasons.
 */

export type Instrument = "piano" | "guitar" | "ambient";

export interface UiPrefs {
  instrument: Instrument;
  theme: string;
  showFunction: boolean;
}

const STORAGE_KEY = "songsheet-ui-prefs";

export const DEFAULT_UI_PREFS: UiPrefs = {
  instrument: "piano",
  theme: "swiss",
  showFunction: false,
};

function read(): UiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFS;
    const p = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      instrument: p.instrument === "guitar" || p.instrument === "ambient" ? p.instrument : "piano",
      theme: typeof p.theme === "string" ? p.theme : DEFAULT_UI_PREFS.theme,
      showFunction: p.showFunction === true,
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

let prefs = read();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function getUiPrefs(): UiPrefs { return prefs; }

export function setUiPrefs(next: Partial<UiPrefs>) {
  prefs = { ...prefs, ...next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode: session only */ }
  listeners.forEach(fn => fn());
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_UI_PREFS);
}
