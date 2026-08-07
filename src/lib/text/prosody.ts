export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  let n = (w.match(/[aeiouy]+/g) ?? []).length;
  if (w.length > 3 && w.endsWith("e") && !/[aeiouy]{2}e$/.test(w)) n = Math.max(1, n - 1);
  return Math.max(1, n);
}
export function lineSyllableCount(line: string): number {
  return line.split(/\s+/).filter(Boolean).reduce((sum, w) => sum + countSyllables(w), 0);
}
