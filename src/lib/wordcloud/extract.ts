import { STOP_WORDS } from "../../data/words";
import { lookupSense } from "../text/senses";

export interface CloudSourceItem {
  text: string;
  sourceId: string;
}

export interface CloudPhrase {
  phrase: string;
  words: string[];
  sourceId: string;
  senseIdx: number | null;
}

const CLAUSE_SPLIT = /[.,;:—–!?()"]+|\s+(?:and|but|so|then|because|while|that)\s+/i;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z'’-]+/).filter(Boolean);
}

/** A phrase takes the sense of its first sensory word, in reading order. */
function phraseSense(runWords: string[]): number | null {
  for (const w of runWords) {
    const idx = lookupSense(w);
    if (idx >= 0) return idx;
  }
  return null;
}

/**
 * Deterministic phrase extraction (§3): split on sentence/clause boundaries,
 * take random 2–4 word contiguous runs, discard runs bounded by a stopword or
 * under 8 characters, de-dup case-insensitively (keeping the first source id).
 * No cap here — call sites cap and shuffle per §7's sizing, which needs a real
 * pool count to be measured against, not guessed.
 */
export function extractPhrases(items: CloudSourceItem[]): CloudPhrase[] {
  const seen = new Set<string>();
  const out: CloudPhrase[] = [];

  for (const item of items) {
    const fragments = item.text.split(CLAUSE_SPLIT);
    for (const frag of fragments) {
      const words = tokenize(frag);
      if (words.length < 2) continue;

      const tries = Math.max(2, Math.ceil(words.length / 2));
      for (let a = 0; a < tries; a++) {
        const len = 2 + Math.floor(Math.random() * 3); // 2–4
        if (len > words.length) continue;
        const start = Math.floor(Math.random() * (words.length - len + 1));
        const run = words.slice(start, start + len);
        if (STOP_WORDS.has(run[0]) || STOP_WORDS.has(run[run.length - 1])) continue;

        const phrase = run.join(" ");
        if (phrase.length < 8) continue;

        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        out.push({ phrase, words: run, sourceId: item.sourceId, senseIdx: phraseSense(run) });
      }
    }
  }

  return out;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
