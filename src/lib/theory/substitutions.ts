import { NOTES } from "../../data/music";
import { getDiatonic, parseChord } from "./chords";

export function getParallelChords(root: string, mode: "major"|"minor"): string[] {
  const parallel = mode === "major" ? "minor" : "major";
  return getDiatonic(root, parallel).map(d => `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : "°"}`);
}
export function getSecondaryDominant(chord: string): string | null {
  // V of chord = major chord a perfect 5th above chord root
  const p = parseChord(chord);
  if (!p) return null;
  const ri = NOTES.indexOf(p.root);
  if (ri === -1) return null;
  const domRoot = NOTES[(ri + 7) % 12]; // perfect 5th above
  return `${domRoot}7`;
}
export function getTritoneSubstitution(chord: string): string | null {
  const p = parseChord(chord);
  if (!p) return null;
  const ri = NOTES.indexOf(p.root);
  if (ri === -1) return null;
  const triRoot = NOTES[(ri + 6) % 12]; // tritone = 6 semitones
  return `${triRoot}7`;
}
