import type { SectionType } from "../../types";
import { SCOL } from "../../data/constants";
import { FN_WORDS } from "../../data/words";

export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (w.length > 3 && w.endsWith("e") && !/[aeiouy]{2}e$/.test(w)) n = Math.max(1, n - 1);
  return Math.max(1, n);
}
export function getStressPattern(word: string): boolean[] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  const syls = countSyllables(w);
  if (syls === 1) return [!FN_WORDS.has(w)];
  return Array.from({ length: syls }, (_, i) => i % 2 === 0);
}
export function analyzeStress(sections: { label: string; type: string; lyrics: string }[]): {
  label: string; colorClass: string;
  lines: { text: string; words: { raw: string; stresses: boolean[] }[] }[];
}[] {
  return sections
    .filter(s => (s.lyrics ?? "").trim())
    .map(s => ({
      label: s.label ?? s.type,
      colorClass: SCOL[s.type as SectionType] ?? "bg-muted",
      lines: s.lyrics.split("\n").filter(l => l.trim()).map(line => ({
        text: line,
        words: line.split(/\s+/).filter(Boolean).map(raw => ({
          raw, stresses: getStressPattern(raw),
        })),
      })),
    }));
}
export function lineSyllableCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + countSyllables(w), 0);
}
