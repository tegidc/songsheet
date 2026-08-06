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

// ─── Chord Picker Suggestions (mobile input tool) ──────────────────────────────
export function toNashville(chord: string, key: string): string {
  if (!key.trim() || !chord.trim()) return chord;
  const { root: keyRoot, mode: keyMode } = parseKeyString(key);
  const p = parseChord(chord);
  if (!p) return chord;
  const ri = NOTES.indexOf(keyRoot);
  const ci = NOTES.indexOf(p.root);
  if (ri === -1 || ci === -1) return chord;
  const interval = (ci - ri + 12) % 12;
  const steps = keyMode === "major" ? MAJ_ST : MIN_ST;
  const degIdx = steps.indexOf(interval);
  if (degIdx === -1) return chord;
  const qual = p.q === "min" ? "-" : p.q === "dim" ? "°" : p.q === "aug" ? "+" : "";
  return `${degIdx + 1}${qual}`;
}
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

// Build categorised chord suggestions for the picker, given the detected key
// and the chords already used in the song.
export function buildChordSuggestions(
  detected: { key: string; mode: "major"|"minor" } | null,
  usedChords: string[],
): { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] } {
  const seen = new Set<string>();
  const norm = (c: string) => { const p = parseChord(c); return p ? chordToken(p.root, p.q) : c.trim(); };

  // In-key diatonic chords with roman labels
  const inKey: ChordSuggestion[] = detected
    ? getDiatonic(detected.key, detected.mode).map((d, i) => {
        const chord = chordToken(d.root, d.q as "maj"|"min"|"dim"|"aug");
        seen.add(chord);
        return { chord, label: degreeLabel(i, d.q as "maj"|"min"|"dim"|"aug") };
      })
    : NOTES.map(r => ({ chord: r, label: "" }));
  if (!detected) NOTES.forEach(r => seen.add(r));

  // Chords already used in the song (unique, excluding ones already in-key)
  const usedSeen = new Set<string>();
  const used: ChordSuggestion[] = [];
  for (const c of usedChords) {
    const n = norm(c);
    if (!n || usedSeen.has(n)) continue;
    usedSeen.add(n);
    if (!seen.has(n)) used.push({ chord: n, label: detected ? (inKey.some(k => k.chord === n) ? "" : "•") : "" });
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
  if (detected) {
    const diat = getDiatonic(detected.key, detected.mode);
    // Secondary dominants toward the pillar degrees (ii, IV, V, vi)
    [1, 3, 4, 5].forEach(i => {
      const d = diat[i];
      if (d) push(getSecondaryDominant(chordToken(d.root, d.q as "maj"|"min"|"dim"|"aug")), `V/${degreeLabel(i, d.q as "maj"|"min"|"dim"|"aug")}`);
    });
    // Borrowed from the parallel mode
    getParallelChords(detected.key, detected.mode).forEach(c => push(c, "borrowed"));
  }

  return { inKey, used, colour: colour.slice(0, 8) };
}
