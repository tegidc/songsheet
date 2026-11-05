import type { SectionType } from "../types";

export const SDEFS = [
  { v: "intro"      as SectionType, l: "Intro",      s: "Intro",  k: "i" },
  { v: "verse"      as SectionType, l: "Verse",      s: "Verse",  k: "v" },
  { v: "pre-chorus" as SectionType, l: "Pre-Chorus", s: "Pre.",   k: "p" },
  { v: "chorus"     as SectionType, l: "Chorus",     s: "Chorus", k: "c" },
  { v: "bridge"     as SectionType, l: "Bridge",     s: "Bridge", k: "b" },
  { v: "hook"       as SectionType, l: "Hook",       s: "Hook",   k: "h" },
  { v: "outro"      as SectionType, l: "Outro",      s: "Outro",  k: "o" },
  { v: "custom"     as SectionType, l: "Custom",     s: "§",      k: "x" },
];
// Section-type tints — hues mixed into the theme's page colour (see
// lib/theme/apply.ts), so they hold up on dark themes as well as light.
export const SCOL: Record<SectionType, string> = {
  intro: "bg-[var(--sec-intro)]", verse: "bg-[var(--sec-verse)]", "pre-chorus": "bg-[var(--sec-pre-chorus)]",
  chorus: "bg-[var(--sec-chorus)]", bridge: "bg-[var(--sec-bridge)]", hook: "bg-[var(--sec-hook)]",
  outro: "bg-[var(--sec-outro)]", custom: "bg-[var(--sec-custom)]",
};
export const CW = 64, CH = 40, FS = 12;
// Font roles. Each is a CSS variable the active theme sets (lib/theme/), so a
// component names the role and never a family. The names are historical:
// MONO was always "interface furniture" and SERIF "the songwriter's prose" —
// see STYLE.md — and they keep those jobs whatever face a theme gives them.
export const MONO    = "var(--font-label)";    // labels, buttons, metadata
export const SANS    = "var(--font-body)";     // structural text
export const SERIF   = "var(--font-body)";     // the songwriter's own words
export const DISPLAY = "var(--font-display)";  // chord names
export const TITLE   = "var(--font-title)";    // song title, the key letter
/** Always monospace: the Final tab aligns chords to lyric letters in `ch`. */
export const SHEET   = "var(--font-sheet)";

// Editorial-only bar sentinels — stripped before any chord/key analysis
export const PHRASE_MARKER = "|";   // visible phrase-boundary glyph │
export const ROW_BREAK     = "\n";  // invisible line-wrap within a section
export const isEditorialBar = (b: string) => b === PHRASE_MARKER || b === ROW_BREAK;

// ─── Object Writing ───────────────────────────────────────────────────────────
export const TIMER_OPTS = [60, 120, 300, 600]; // 1, 2, 5, 10 min
