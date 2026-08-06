import { NOTES } from "../../data/music";
import { normNote, parseChord, getDiatonic } from "./chords";

export function parseKeyString(k: string): { root: string; mode: "major"|"minor" } {
  const minor = k.endsWith("m");
  const root = normNote(minor ? k.slice(0, -1) : k);
  return { root: NOTES.includes(root) ? root : "C", mode: minor ? "minor" : "major" };
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
