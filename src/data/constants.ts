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
export const SCOL: Record<SectionType, string> = {
  intro: "bg-[#D8D2C8]", verse: "bg-[#CDD4CE]", "pre-chorus": "bg-[#D4CECD]",
  chorus: "bg-[#D4C4A4]/60", bridge: "bg-[#CCCAD8]", hook: "bg-[#D4D2C4]",
  outro: "bg-[#CACDD0]", custom: "bg-[#DDD7CE]",
};
export const CW = 64, CH = 40, FS = 12;
export const MONO = "'DM Mono', monospace";
export const SANS = "'DM Sans', sans-serif";
export const SERIF = "'Lora', serif";

// Editorial-only bar sentinels — stripped before any chord/key analysis
export const PHRASE_MARKER = "|";   // visible phrase-boundary glyph │
export const ROW_BREAK     = "\n";  // invisible line-wrap within a section
export const isEditorialBar = (b: string) => b === PHRASE_MARKER || b === ROW_BREAK;

// ─── Object Writing ───────────────────────────────────────────────────────────
export const TIMER_OPTS = [60, 120, 300, 600]; // 1, 2, 5, 10 min
