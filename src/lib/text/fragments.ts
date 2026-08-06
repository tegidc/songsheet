import type { Section } from "../../types";
import { STOP_WORDS, SECTION_IGNORE_WORDS } from "../../data/words";
import { lineSyllableCount } from "./prosody";

// Pick a random group of 1–3 items (single words + short phrases) from source text.
// Deliberately avoids frequency ranking — selection is genuinely random each call.
export function pickFragmentGroup(allText: string): string[] {
  if (!allText.trim()) return [];

  // De-duplicated meaningful words (4+ chars, no stop words)
  const wordPool = [...new Set(
    (allText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])
      .filter(w => !STOP_WORDS.has(w) && !SECTION_IGNORE_WORDS.has(w))
  )];

  // Short phrases: 2–3 word runs where at least one word is a content word
  const phrasePool: string[] = [];
  const sentences = allText
    .replace(/[\r\n]+/g, ". ")
    .split(/[.!?,;]+/)
    .map(s => s.trim())
    .filter(s => s.length > 5);

  sentences.forEach(sent => {
    const tokens = sent.split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
    for (let i = 0; i < tokens.length; i++) {
      for (const len of [2, 3]) {
        if (i + len > tokens.length) break;
        const chunk = tokens.slice(i, i + len);
        const clean = chunk.map(t => t.toLowerCase().replace(/[^a-z]/g, "")).filter(Boolean);
        const hasContent = clean.some(w => !STOP_WORDS.has(w) && w.length >= 4);
        if (hasContent) {
          const phrase = chunk.join(" ").replace(/[^a-zA-Z\s'-]/g, "").trim();
          if (phrase.length >= 4) phrasePool.push(phrase);
        }
      }
    }
  });

  const combined = [...wordPool, ...phrasePool].filter(Boolean);
  if (!combined.length) return [];

  // Fisher-Yates partial pick: 1, 2, or 3 items
  const count = 1 + Math.floor(Math.random() * 3);
  const pool = [...combined];
  const selected: string[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const j = Math.floor(Math.random() * pool.length);
    selected.push(pool.splice(j, 1)[0]);
  }
  return selected;
}

// Build fill-in-the-blanks skeleton verse based on a template section's shape.
// Mostly blank slots (———) with a handful of sensory anchor words from source text.
export function buildSkeletonLyrics(templateSection: Section | null, sourceText: string): string {
  const templateLines = templateSection
    ? (templateSection.lyrics ?? "").split("\n").filter(l => l.trim())
    : [];
  const lineCount = templateLines.length > 0 ? Math.min(templateLines.length, 8) : 4;
  const sylPerLine = templateLines.length > 0
    ? templateLines.map(l => Math.max(3, lineSyllableCount(l)))
    : Array(lineCount).fill(8);

  const sourceWords = [...new Set(
    (sourceText.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [])
      .filter(w => !STOP_WORDS.has(w) && !SECTION_IGNORE_WORDS.has(w))
  )].sort(() => Math.random() - 0.5);

  let wIdx = 0;
  const nextWord = () => sourceWords.length > 0 ? sourceWords[wIdx++ % sourceWords.length] : null;
  const blanks   = (n: number) => Array(Math.max(1, n)).fill("———").join(" ");

  return Array.from({ length: lineCount }, (_, i) => {
    const syls  = sylPerLine[i] ?? 8;
    const slots = Math.max(3, Math.round(syls / 1.7));
    const r     = Math.random();

    if (r < 0.25 || sourceWords.length === 0) {
      return blanks(slots);
    } else if (r < 0.72) {
      const anchor = nextWord();
      if (!anchor) return blanks(slots);
      const before = Math.floor(Math.random() * (slots - 1));
      const after  = slots - 1 - before;
      const parts: string[] = [];
      if (before > 0) parts.push(blanks(before));
      parts.push(anchor);
      if (after  > 0) parts.push(blanks(after));
      return parts.join(" ");
    } else {
      const a1 = nextWord(); const a2 = nextWord();
      if (!a1 || !a2) return blanks(slots);
      return [a1, blanks(Math.max(1, slots - 2)), a2].join(" ");
    }
  }).join("\n");
}
