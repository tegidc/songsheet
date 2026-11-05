import { MAJ_ST, MIN_ST, NOTES } from "../../data/music";
import { chordTones } from "../audio/voicing";
import { nashvilleDegree, normNote, parseChord } from "./chords";

/**
 * Chord function and Roman numerals, read through the key in force — the same
 * key, and the same degree arithmetic (`nashvilleDegree`), the Nashville
 * numbers use, so the three readings can never disagree and all of them move
 * together when the key is changed.
 *
 * Nothing here alters `parseChord`, `detectKey`, the key declaration or the
 * numbering. This module only reads them.
 */

export type ChordFunction = "home" | "lift" | "pull" | "borrowed";

// Nashville degree → Roman numeral, accidentals as ♭/♯
const DEGREE_ROMAN: Record<string, string> = {
  "1": "I", "b2": "♭II", "2": "II", "b3": "♭III", "3": "III", "4": "IV",
  "#4": "♯IV", "5": "V", "b6": "♭VI", "6": "VI", "b7": "♭VII", "7": "VII",
};

/**
 * `vi`, `IV`, `♭III`, `vii°` — case for quality, as the selector's own labels
 * do. Quality comes from `parseChord`, as the Nashville numbers' does, except
 * that a flattened fifth over a minor third reads as diminished (`Dm7b5` is
 * `ii°`, which `parseChord` alone would call minor).
 */
export function romanNumeral(chord: string, key: { key: string } | null): string {
  if (!key || !chord.trim()) return "";
  const p = parseChord(chord);
  if (!p) return "";
  const deg = nashvilleDegree(key.key, p.root);
  if (!deg) return "";
  const base = DEGREE_ROMAN[deg];
  let q: string = p.q;
  if (q === "min") {
    const ct = chordTones(chord);
    if (ct && ct.tones.includes((ct.root + 6) % 12) && !ct.tones.includes((ct.root + 7) % 12)) q = "dim";
  }
  if (q === "min") return base.toLowerCase();
  if (q === "dim") return base.toLowerCase() + "°";
  if (q === "aug") return base + "+";
  return base;
}

/**
 * The function of a chord in a key.
 *
 * A chord is diatonic when every note it sounds — suffix and slash bass
 * included — belongs to the key's scale. Then its function follows its scale
 * degree, the same rule in major and minor:
 *
 *   degree 1, 3, 6  →  home   (I iii vi  ·  i ♭III ♭VI)
 *   degree 2, 4     →  lift   (ii IV     ·  ii° iv)
 *   degree 5, 7     →  pull   (V vii°    ·  v ♭VII)
 *
 * Anything not diatonic is borrowed (iv, ♭III, ♭VII in major; Fm6, E♭maj9 in C).
 *
 * Minor keys get one allowance: chords built on the fifth or seventh degree may
 * use the raised leading tone (E7 or G♯° in A minor). That is the harmonic
 * minor's dominant, the commonest chord in minor-key songs; calling it
 * "borrowed" would mark the most ordinary move in the key as foreign.
 */
export function chordFunction(chord: string, key: { key: string; mode: "major" | "minor" } | null): ChordFunction | null {
  if (!key || !chord.trim()) return null;
  const tonic = NOTES.indexOf(normNote(key.key));
  if (tonic === -1) return null;
  const ct = chordTones(chord);
  if (!ct) return null;
  const steps = key.mode === "major" ? MAJ_ST : MIN_ST;
  const scale = new Set(steps.map(s => (tonic + s) % 12));
  const rel = (pc: number) => (pc - tonic + 12) % 12;

  let degree = steps.indexOf(rel(ct.root));
  const leading = (tonic + 11) % 12;
  // Minor: the leading-tone diminished chord (G♯° in Am) sits on the raised 7th
  if (degree === -1 && key.mode === "minor" && ct.root === leading) degree = 6;
  if (degree === -1) return "borrowed";

  const allowed = new Set(scale);
  if (key.mode === "minor" && (degree === 4 || degree === 6)) allowed.add(leading);
  const notes = [...ct.tones, ct.bass];
  if (!notes.every(pc => allowed.has(pc))) return "borrowed";

  return degree === 0 || degree === 2 || degree === 5 ? "home"
    : degree === 1 || degree === 3 ? "lift"
    : "pull";
}
