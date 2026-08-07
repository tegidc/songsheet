import type { SectionType, Section, Song } from "./types";
import { SDEFS } from "./data/constants";
import { uid } from "./format";

/**
 * The two-character form a section takes when it has to share a line with
 * everything else — `Verse 1` → `V1`, `Chorus 1` → `C1`, `Pre-Chorus 2` → `P2`,
 * `Verse A` → `VA`. Read off the label rather than the type, so a renamed
 * section abbreviates to its own name (`Drop` → `D1`) instead of to the type
 * it happens to be built on.
 *
 * An unnumbered label still gets a 1 (`Bridge` → `B1`): the number is part of
 * the shape, and one bridge is the first bridge.
 */
export function abbreviateSectionLabel(label: string): string {
  const text = label.trim();
  if (!text) return "—";
  const suffix = text.match(/\s+(\d+|[A-Za-z])$/);
  const head = (suffix ? text.slice(0, suffix.index) : text).trim();
  const initial = head.match(/[A-Za-z0-9]/)?.[0] ?? head[0] ?? "—";
  return initial.toUpperCase() + (suffix ? suffix[1].toUpperCase() : "1");
}

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
  fretboardChords: [],
});
export const EMPTY_SONG = makeEmptySong();

/**
 * Nothing has been written into this sheet yet — safe to replace wholesale.
 *
 * Deliberately broader than the autosave trigger's "is there anything worth
 * saving" test in `App.tsx`, which ignores imported writings on purpose (an
 * import alone shouldn't mint a project). Here the question is the opposite —
 * "could replacing this lose something the user did?" — so an imported
 * writing, a notebook fragment or a voice note all count.
 */
export function isPristineSong(s: Song): boolean {
  return !s.title.trim()
    && !(s.artist ?? "").trim()
    && !(s.generalNotes ?? "").trim()
    && !(s.bigIdea ?? "").trim()
    && !(s.productionNotes ?? "").trim()
    && !Object.values(s.story ?? {}).some(v => (v ?? "").trim())
    && !s.sections.some(x => (x.lyrics ?? "").trim() || (x.chordBars ?? []).some(b => b.trim()))
    && (s.objectWritings ?? []).length === 0
    && (s.notebookSections ?? []).length === 0
    && (s.audioNotes ?? []).length === 0
    && (s.fretboardChords ?? []).length === 0;
}
