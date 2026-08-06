import { STOP_WORDS } from "../../data/words";

export interface FillWord { text: string; isPlaceholder: boolean }
export function detectRhymeScheme(lines: string[]): { scheme: string; lastWords: string[] } {
  const nonEmpty = lines.filter(l => l.trim());
  const lastWords = nonEmpty.map(l => {
    const w = l.trim().split(/\s+/).pop() ?? "";
    return w.toLowerCase().replace(/[^a-z]/g, "");
  });
  const groups = new Map<string, string>();
  let idx = 0;
  const letters = lastWords.map(w => {
    const key = w.slice(-3);
    if (!groups.has(key)) groups.set(key, String.fromCharCode(65 + idx++));
    return groups.get(key)!;
  });
  return { scheme: letters.join(""), lastWords };
}
export function findRhymingWords(lastWords: string[], sourceText: string, n = 8): string[] {
  const candidates = (sourceText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [])
    .filter(w => !STOP_WORDS.has(w));
  const targetEndings = [...new Set(lastWords.map(w => w.slice(-3)))];
  const results: string[] = [];
  for (const w of candidates) {
    const ending = w.slice(-3);
    if (targetEndings.includes(ending) && !lastWords.includes(w) && !results.includes(w)) {
      results.push(w);
      if (results.length >= n) break;
    }
  }
  return results;
}
export function buildFill(
  lines: { words: { raw: string; stresses: boolean[] }[] }[]
): FillWord[][] {
  return lines.map(line =>
    line.words.map(({ raw, stresses }) => {
      if (Math.random() < 0.38) return { text: raw, isPlaceholder: false };
      // Replace with stress-matched syllable sounds
      return { text: stresses.map(s => s ? "da" : "ba").join(" "), isPlaceholder: true };
    })
  );
}
