import { STOP_WORDS, SECTION_IGNORE_WORDS } from "../../data/words";
import { lookupSense } from "./senses";

export function extractWordCloud(text: string, n = 22): { word: string; size: 1|2|3 }[] {
  const freq = new Map<string, number>();
  (text.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? []).forEach(w => {
    if (!STOP_WORDS.has(w) && !SECTION_IGNORE_WORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  });
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  if (!sorted.length) return [];
  const max = sorted[0][1];
  return sorted.map(([word, count]) => {
    const ratio = count / max;
    const size: 1|2|3 = ratio > 0.6 ? 3 : ratio > 0.3 ? 2 : 1;
    return { word, size };
  });
}
export function extractSensoryFragments(text: string, n = 3): string[] {
  const clauses = text.split(/[.!?,]\s+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 4);
  const sensory = clauses.filter(c =>
    c.toLowerCase().split(/\s+/).some(w => lookupSense(w.replace(/[^a-z]/g, "")) >= 0)
  );
  const pool = sensory.length >= n ? sensory : [...sensory, ...clauses.filter(c => !sensory.includes(c))];
  // Deterministic shuffle via seeded index not available; use array slice with spread
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}
