import type { SectionType, Section, Song } from "./types";
import { SDEFS } from "./data/constants";
import { uid } from "./format";

export function isAutoLabel(label: string, type: SectionType): boolean {
  const def = SDEFS.find(d => d.v === type);
  if (!def) return false;
  return label === def.l || (label.startsWith(def.l) && /\s+(\d+|[A-Z])$/.test(label));
}
export function renumberSections(
  sections: Section[],
  naming: Partial<Record<SectionType, "number" | "letter">>
): Section[] {
  const typeCounts = new Map<SectionType, number>();
  sections.forEach(s => typeCounts.set(s.type, (typeCounts.get(s.type) ?? 0) + 1));
  const typeIdx = new Map<SectionType, number>();
  return sections.map(s => {
    const idx = (typeIdx.get(s.type) ?? 0) + 1;
    typeIdx.set(s.type, idx);
    if (!isAutoLabel(s.label, s.type)) return s;
    const def = SDEFS.find(d => d.v === s.type)!;
    const total = typeCounts.get(s.type)!;
    const style = naming[s.type] ?? "number";
    const suffix = style === "letter"
      ? ` ${String.fromCharCode(64 + idx)}`
      : ` ${idx}`;
    return { ...s, label: `${def.l}${suffix}`, shortLabel: `${def.s}${suffix}` };
  });
}
export function makeSection(type: SectionType, n = 1): Section {
  const d = SDEFS.find(s => s.v === type)!;
  const sfx = n > 1 ? ` ${n}` : "";
  return { id: uid(), type, label: d.l + sfx, shortLabel: d.s + sfx,
    chordBars: ["","","",""], chordPositions: [], lyrics: "", notes: "" };
}
export const SECTION_HEADER_RE: Array<{ re: RegExp; type: SectionType }> = [
  { re: /^intro\s*:?\s*$/i,                   type: "intro"      },
  { re: /^verse(\s+\w+)?\s*:?\s*$/i,          type: "verse"      },
  { re: /^pre[- ]?chorus(\s+\w+)?\s*:?\s*$/i, type: "pre-chorus" },
  { re: /^chorus(\s+\w+)?\s*:?\s*$/i,         type: "chorus"     },
  { re: /^bridge(\s+\w+)?\s*:?\s*$/i,         type: "bridge"     },
  { re: /^hook(\s+\w+)?\s*:?\s*$/i,           type: "hook"       },
  { re: /^outro\s*:?\s*$/i,                   type: "outro"      },
];
export function matchSectionHeader(line: string): SectionType | null {
  const t = line.trim();
  if (!t || t.length > 30) return null;
  for (const { re, type } of SECTION_HEADER_RE) {
    if (re.test(t)) return type;
  }
  return null;
}

// Returns an array of split sections when the lyrics contain ≥2 detectable section headers,
// or null if no split is warranted.
export function parseLyricsIntoSections(
  lyrics: string
): Array<{ type: SectionType; label: string; lyrics: string }> | null {
  if (!lyrics.trim()) return null;
  const lines  = lyrics.split("\n");
  const buckets: Array<{ type: SectionType; label: string; lines: string[] }> = [];
  let preamble: string[] = [];
  let current:  typeof buckets[0] | null = null;

  for (const line of lines) {
    const headerType = matchSectionHeader(line);
    if (headerType !== null) {
      if (current) {
        buckets.push(current);
      } else if (preamble.some(l => l.trim())) {
        buckets.push({ type: "verse", label: "Verse", lines: preamble });
      }
      preamble = [];
      current  = { type: headerType, label: line.trim(), lines: [] };
    } else {
      if (current) current.lines.push(line);
      else         preamble.push(line);
    }
  }
  if (current) buckets.push(current);

  if (buckets.length < 2) return null;
  if (!buckets.some(b => b.lines.some(l => l.trim()))) return null;

  return buckets.map(b => ({
    type:   b.type,
    label:  b.label,
    lyrics: b.lines.join("\n").replace(/^\n+|\n+$/g, ""),
  }));
}


// Normalizes any raw section object (e.g. from Supabase) into a complete Section,
// filling every field that could be missing with a safe default.
export function normalizeSection(raw: Partial<Section> & { type?: SectionType }): Section {
  const type = raw.type ?? "verse";
  const base = makeSection(type);
  return {
    ...base,
    ...raw,
    id:            raw.id            ?? base.id,
    type,
    label:         raw.label         ?? base.label,
    shortLabel:    raw.shortLabel    ?? base.shortLabel,
    lyrics:        raw.lyrics        ?? "",
    notes:         raw.notes         ?? "",
    chordBars:     Array.isArray(raw.chordBars)     ? raw.chordBars     : [...base.chordBars],
    chordPositions: Array.isArray(raw.chordPositions) ? raw.chordPositions : [],
  };
}
export const makeEmptySong = (): Song => ({
  title: "",
  artist: "",
  key: "",
  tempo: "",
  timeSignature: "4/4",
  feel: "",
  sections: [makeSection("verse")],
  sectionNaming: {},
  generalNotes: "",
  productionNotes: "",
  bigIdea: "",
  story: { beginning: "", middle: "", end: "" },
  objectWritings: [],
  notebookSections: [],
  audioNotes: [],
});
export const EMPTY_SONG = makeEmptySong();
