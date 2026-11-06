import { NOTES, FLAT, MAJ_ST, MIN_ST, MAJ_Q, MIN_Q } from "../../data/music";
import { parseKeyString } from "./key";
import { getSecondaryDominant, getParallelChords } from "./substitutions";

export function parseChord(s: string): { root: string; q: "maj"|"min"|"dim"|"aug" } | null {
  if (!s.trim()) return null;
  const m = s.trim().replace(/\/.*$/, "").match(/^([A-G][#b]?)(m(?!aj)|dim|aug)?/i);
  if (!m) return null;
  const root = normNote(m[1][0].toUpperCase() + m[1].slice(1));
  if (!NOTES.includes(root)) return null;
  const q = (m[2] ?? "").toLowerCase();
  return { root, q: q === "m" ? "min" : q === "dim" ? "dim" : q === "aug" ? "aug" : "maj" };
}
export const normNote = (n: string) => FLAT[n] ?? n;
export function getDiatonic(root: string, mode: "major"|"minor") {
  const ri = NOTES.indexOf(root);
  if (ri === -1) return [];
  const steps = mode === "major" ? MAJ_ST : MIN_ST;
  const quals = mode === "major" ? MAJ_Q : MIN_Q;
  return steps.map((s, i) => ({ root: NOTES[(ri + s) % 12], q: quals[i] }));
}
export function inKey(chord: string, key: string, mode: "major"|"minor") {
  const p = parseChord(chord);
  if (!p) return true;
  return getDiatonic(key, mode).some(d => d.root === p.root && d.q === p.q);
}

// ─── Nashville numbering ───────────────────────────────────────────────────────
// All twelve semitone distances from the tonic, one fixed spelling each. Once a
// key is declared freely most chords may be non-diatonic, so the numbering needs
// accidentals to express them at all — and the spelling is a property of the
// distance, never of how the chord was typed: Gb and F# in C both read #4.
export const NASHVILLE_DEGREES = ["1","b2","2","b3","3","4","#4","5","b6","6","b7","7"];

// Semitone distance tonic → chord root, as a degree number. Pure; null only when
// either name isn't a note this app knows.
export function nashvilleDegree(tonic: string, chordRoot: string): string | null {
  const ri = NOTES.indexOf(normNote(tonic));
  const ci = NOTES.indexOf(normNote(chordRoot));
  if (ri === -1 || ci === -1) return null;
  return NASHVILLE_DEGREES[(ci - ri + 12) % 12];
}

/**
 * A chord as a Nashville number, in parts: the degree, its quality (`-` minor,
 * `°` diminished, `+` augmented), the extension as written (`maj9`, `7`,
 * `sus4`… — drawn raised), and a slash bass as its own degree. Am9/G in C is
 * 6 - ⁹ / 5. Null when the chord or key can't be read.
 */
export interface NashvilleParts { deg: string; qual: string; ext: string; bass: string | null }
export function nashvilleParts(chord: string, key: string): NashvilleParts | null {
  if (!key.trim() || !chord.trim()) return null;
  const [main, bassRaw] = chord.trim().split("/");
  const p = parseChord(main);
  if (!p) return null;
  const tonic = parseKeyString(key).root;
  const deg = nashvilleDegree(tonic, p.root);
  if (!deg) return null;
  const head = main.match(/^([A-G][#b]?)(m(?!aj)|dim|aug)?/i)?.[0] ?? "";
  let ext = main.slice(head.length);
  let qual = p.q === "min" ? "-" : p.q === "dim" ? "°" : p.q === "aug" ? "+" : "";
  // The app's own spellings: B°, Bø, C+ arrive with the mark in the suffix
  if (!qual && /^[°o](?!\w)/.test(ext)) { qual = "°"; ext = ext.slice(1); }
  else if (!qual && ext.startsWith("ø")) { qual = "-"; ext = "7b5" + ext.slice(1); }
  else if (!qual && ext.startsWith("+")) { qual = "+"; ext = ext.slice(1); }
  let bass: string | null = null;
  if (bassRaw) {
    const bm = bassRaw.trim().match(/^[A-G][#b]?/i)?.[0];
    if (bm) bass = nashvilleDegree(tonic, bm[0].toUpperCase() + bm.slice(1)) ?? null;
  }
  return { deg, qual, ext, bass };
}

/** The Nashville number as one plain string, for titles and labels. */
export function toNashville(chord: string, key: string): string {
  const n = nashvilleParts(chord, key);
  if (!n) return chord;
  return `${n.deg}${n.qual}${n.ext}${n.bass ? `/${n.bass}` : ""}`;
}

/**
 * Typed Nashville back to a chord name, so a bar can be written in numbers:
 * `6-9/5` in C is Am9/G. Flats are spelled for flat degrees and in flat keys
 * (F, B♭… and their minors), sharps otherwise. Anything starting with a letter
 * is already a chord name and passes through; anything unreadable passes
 * through too, so a half-typed entry is never lost.
 */
const SHARP_TO_FLAT: Record<string, string> = { "C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb" };
/** Is this a key that spells with flats (F, B♭, E♭… and D, G, C, F minor)? */
export function isFlatKey(key: string): boolean {
  const k = key.trim();
  if (!k) return false;
  const { root, mode } = parseKeyString(k);
  return /^[A-G]b/.test(k) || (mode === "major" ? root === "F" : ["D", "G", "C", "F"].includes(root));
}
/** A note name (sharps, as NOTES holds them) spelled for the key. */
export const spellNote = (n: string, flat: boolean) => (flat ? SHARP_TO_FLAT[n] ?? n : n);

export function fromNashville(text: string, key: string): string {
  const t = text.trim();
  if (!t || /^[A-G]/i.test(t) || !key.trim()) return text;
  const m = t.match(/^([b#♭♯]?[1-7])(-|m(?!aj)|°|o(?![a-z])|\+)?([^/]*)(?:\/([b#♭♯]?[1-7]))?$/);
  if (!m) return text;
  const { root: tonic } = parseKeyString(key);
  const ti = NOTES.indexOf(normNote(tonic));
  if (ti === -1) return text;
  const flatKey = isFlatKey(key);
  const note = (deg: string) => {
    const d = deg.replace("♭", "b").replace("♯", "#");
    const i = NASHVILLE_DEGREES.indexOf(d === "b4" ? "3" : d === "#5" ? "b6" : d === "#1" ? "b2" : d === "#2" ? "b3" : d === "#6" ? "b7" : d);
    if (i === -1) return null;
    const n = NOTES[(ti + i) % 12];
    const wantFlat = d.startsWith("b") || (flatKey && !d.startsWith("#"));
    return wantFlat ? (SHARP_TO_FLAT[n] ?? n) : n;
  };
  const root = note(m[1]);
  if (!root) return text;
  const q = m[2] === "-" || m[2] === "m" ? "m" : m[2] === "°" || m[2] === "o" ? "dim" : m[2] === "+" ? "aug" : "";
  const bass = m[4] ? note(m[4]) : null;
  if (m[4] && !bass) return text;
  return `${root}${q}${m[3] ?? ""}${bass ? `/${bass}` : ""}`;
}

// ─── Chord Picker Suggestions (mobile input tool) ──────────────────────────────
export const ROMAN = ["I","II","III","IV","V","VI","VII"];
export function chordToken(root: string, q: "maj"|"min"|"dim"|"aug"): string {
  return `${root}${q === "maj" ? "" : q === "min" ? "m" : q === "dim" ? "°" : "+"}`;
}

// Roman-numeral label for a diatonic degree — case reflects quality
export function degreeLabel(degIdx: number, q: "maj"|"min"|"dim"|"aug"): string {
  const r = ROMAN[degIdx] ?? "";
  if (q === "min") return r.toLowerCase();
  if (q === "dim") return r.toLowerCase() + "°";
  if (q === "aug") return r + "+";
  return r;
}
export interface ChordSuggestion { chord: string; label: string }

/**
 * The four sets the chord selector offers. `fretboard` is not derived from the
 * key — it is the song's own log of chords found on the neck — so it is
 * composed by the caller rather than by `buildChordSuggestions` below.
 */
export interface ChordSuggestionSets {
  inKey: ChordSuggestion[]; used: ChordSuggestion[];
  colour: ChordSuggestion[]; fretboard: ChordSuggestion[];
}

/**
 * Three of the four rows share one slot on screen and take turns in it; USED
 * is always visible and is not part of the rotation.
 */
export type ChordRow = "inKey" | "colour" | "fretboard";
export const CHORD_ROW_ORDER: ChordRow[] = ["inKey", "colour", "fretboard"];
export const CHORD_ROW_HEADING: Record<ChordRow, string> = {
  inKey: "In key", colour: "Colour", fretboard: "From fretboard",
};
/**
 * A row of the keyboard each. The number row is In Key and the top letter row
 * is Colour, both long-standing; From Fretboard takes the bottom letter row,
 * which completes the shape geometrically and — unlike the home row — costs
 * only two note letters rather than four, leaving A D F G free to type.
 *
 * All three stay bound whether or not their row is the one showing. Muscle
 * memory should not depend on what is on screen.
 */
export const CHORD_ROW_KEYS: Record<ChordRow, string[]> = {
  inKey:     ["1", "2", "3", "4", "5", "6", "7"],
  colour:    ["q", "w", "e", "r", "t", "y", "u"],
  fretboard: ["z", "x", "c", "v", "b", "n", "m"],
};
export const cycleChordRow = (r: ChordRow): ChordRow =>
  CHORD_ROW_ORDER[(CHORD_ROW_ORDER.indexOf(r) + 1) % CHORD_ROW_ORDER.length];

// Build categorised chord suggestions for the picker, given the key in force
// (declared by the songwriter) and the chords already used in the song.
export function buildChordSuggestions(
  activeKey: { key: string; mode: "major"|"minor" } | null,
  usedChords: string[],
): { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] } {
  const seen = new Set<string>();
  const norm = (c: string) => { const p = parseChord(c); return p ? chordToken(p.root, p.q) : c.trim(); };

  // In-key diatonic chords with roman labels
  const inKey: ChordSuggestion[] = activeKey
    ? getDiatonic(activeKey.key, activeKey.mode).map((d, i) => {
        const chord = chordToken(d.root, d.q as "maj"|"min"|"dim"|"aug");
        seen.add(chord);
        return { chord, label: degreeLabel(i, d.q as "maj"|"min"|"dim"|"aug") };
      })
    : NOTES.map(r => ({ chord: r, label: "" }));
  if (!activeKey) NOTES.forEach(r => seen.add(r));

  // Chords already used in the song (unique, excluding ones already in-key)
  const usedSeen = new Set<string>();
  const used: ChordSuggestion[] = [];
  for (const c of usedChords) {
    const n = norm(c);
    if (!n || usedSeen.has(n)) continue;
    usedSeen.add(n);
    if (!seen.has(n)) used.push({ chord: n, label: activeKey ? (inKey.some(k => k.chord === n) ? "" : "•") : "" });
  }

  // "More colour" — secondary dominants of diatonic degrees + borrowed from parallel
  const colour: ChordSuggestion[] = [];
  const push = (chord: string | null, label: string) => {
    if (!chord) return;
    const n = norm(chord);
    if (!n || seen.has(n) || usedSeen.has(n)) return;
    seen.add(n);
    colour.push({ chord: n, label });
  };
  if (activeKey) {
    const diat = getDiatonic(activeKey.key, activeKey.mode);
    // Secondary dominants toward the pillar degrees (ii, IV, V, vi)
    [1, 3, 4, 5].forEach(i => {
      const d = diat[i];
      if (d) push(getSecondaryDominant(chordToken(d.root, d.q as "maj"|"min"|"dim"|"aug")), `V/${degreeLabel(i, d.q as "maj"|"min"|"dim"|"aug")}`);
    });
    // Borrowed from the parallel mode
    getParallelChords(activeKey.key, activeKey.mode).forEach(c => push(c, "borrowed"));
  }

  return { inKey, used, colour: colour.slice(0, 8) };
}
