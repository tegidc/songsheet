import { useSyncExternalStore } from "react";

/**
 * Per-device display and playback preferences: the Play instrument, the theme
 * and its dark face, the view toggles, fretboard sound, and whether Settings is
 * folded.
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
  /** The dark face of whichever theme is chosen. */
  dark: boolean;
  /** Roman numerals beside chord names. Off by default: the names stand alone. */
  showNumerals: boolean;
  /** The fretboard identifier sounds each note as it's placed. */
  fretSound: boolean;
  /** The sidebar's Settings block, open or folded. */
  settingsOpen: boolean;
}

const STORAGE_KEY = "songsheet-ui-prefs";

export const DEFAULT_UI_PREFS: UiPrefs = {
  instrument: "piano",
  theme: "swiss",
  showFunction: false,
  dark: false,
  showNumerals: false,
  fretSound: true,
  settingsOpen: true,
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
      dark: p.dark === true,
      showNumerals: p.showNumerals === true,
      fretSound: p.fretSound !== false,
      settingsOpen: p.settingsOpen !== false,
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

let prefs = read();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function getUiPrefs(): UiPrefs { return prefs; }
export const subscribeUiPrefs = subscribe;

export function setUiPrefs(next: Partial<UiPrefs>) {
  prefs = { ...prefs, ...next };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* private mode: session only */ }
  listeners.forEach(fn => fn());
}

export function useUiPrefs(): UiPrefs {
  return useSyncExternalStore(subscribe, () => prefs, () => DEFAULT_UI_PREFS);
}
