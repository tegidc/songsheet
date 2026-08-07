import { NOTES } from "../../data/music";
import { normNote, parseChord, getDiatonic } from "./chords";

// The key the songwriter *declared*, or null when the field is empty or names
// nothing we can read a tonic out of. Pure, and deliberately non-judgemental:
// the field itself accepts anything, so an unreadable key simply isn't a lens —
// it is never rejected, corrected, or flagged.
export function parseDeclaredKey(k: string): { root: string; mode: "major"|"minor" } | null {
  const m = k.trim().match(/^([A-Ga-g][#b]?)\s*(m|min|minor|maj|major)?$/);
  if (!m) return null;
  const root = normNote(m[1][0].toUpperCase() + m[1].slice(1).toLowerCase());
  if (!NOTES.includes(root)) return null;
  return { root, mode: /^m(in(or)?)?$/i.test(m[2] ?? "") ? "minor" : "major" };
}
// Lenient reader for callers that must end up with *some* tonic (C major).
export function parseKeyString(k: string): { root: string; mode: "major"|"minor" } {
  return parseDeclaredKey(k) ?? { root: "C", mode: "major" };
}
export function formatDetectedKey(root: string, mode: "major"|"minor") {
  return mode === "minor" ? `${root}m` : root;
}
export function detectKey(chords: string[]): { key: string; mode: "major"|"minor"; confidence: number } | null {
  const parsed = chords.map(parseChord).filter(Boolean) as NonNullable<ReturnType<typeof parseChord>>[];
  if (!parsed.length) return null;
  let best = { key: "C", mode: "major" as "major"|"minor", score: 0 };
  for (const root of NOTES)
    for (const mode of ["major", "minor"] as const) {
      const dc = getDiatonic(root, mode);
      const score = parsed.reduce((s, p) =>
        s + (dc.some(d => d.root === p.root && d.q === p.q) ? 2 : dc.some(d => d.root === p.root) ? 1 : 0), 0);
      if (score > best.score) best = { key: root, mode, score };
    }
  const confidence = best.score / (parsed.length * 2);
  return confidence >= 0.3 ? { ...best, confidence } : null;
}
