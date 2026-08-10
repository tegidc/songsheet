import { SENSES, SENSE_INDEX, ABSTRACT_VERBS, ALL_SENSE_WORDS } from "../../data/senses";
import { STOP_WORDS } from "../../data/words";

/**
 * Words are looked up directly. There is no stemmer: every inflection a word
 * can take is generated into `SENSE_INDEX` at build time (see
 * scripts/build-senses.mjs), so nothing has to be guessed here. The stemmer
 * this replaced chopped suffixes and got `water` → `wat`, `finger` → `fing`,
 * `gently` → `gent`.
 */
function clean(token: string): string {
  return token.toLowerCase().replace(/[^a-z]/g, "");
}

/** Primary sense only — the reading a word has on its own, out of context. */
export function lookupSense(word: string): number {
  return SENSE_INDEX.get(clean(word))?.primary ?? -1;
}

export interface ScanToken {
  token: string;
  /** Index into `SENSES`, after any promotion by context. */
  senseIdx: number | null;
  /** An abstract verb — counted and flagged, never scored as a sense. */
  abstract?: boolean;
}

/**
 * How far either side of a word to look for support before promoting one of
 * its secondary senses. Four words: far enough to cross "cool to the touch",
 * short enough that it is still the same image.
 */
const CONTEXT = 4;

/**
 * The scan, in two passes.
 *
 * Pass one gives every word its primary sense — the reading it has on its own.
 * Pass two promotes: a word that also belongs to other senses takes the first
 * of them that has support nearby, meaning some word within `CONTEXT` has that
 * sense as *its* primary. So `light` is Sight until it is next to `weight`,
 * `press` is Touch until it is next to `lean`, and `cool` stays Touch either
 * way. Support is always read from primaries, never from promotions, so the
 * result does not depend on which word is considered first and a promotion can
 * never cascade into another one.
 */
export function scanText(text: string): ScanToken[] {
  if (!text.trim()) return [];

  const out: ScanToken[] = text.split(/(\s+)/).map(token => {
    const w = clean(token);
    const entry = SENSE_INDEX.get(w);
    if (entry) return { token, senseIdx: entry.primary };
    return { token, senseIdx: null, abstract: ABSTRACT_VERBS.has(w) };
  });

  // Word positions only: the split above interleaves the whitespace it split
  // on, and counting those would halve the window.
  const words = out.map((t, i) => (clean(t.token) ? i : -1)).filter(i => i >= 0);
  const primary = out.map(t => t.senseIdx);

  words.forEach((pos, n) => {
    const secondary = SENSE_INDEX.get(clean(out[pos].token))?.secondary;
    if (!secondary?.length) return;
    for (const sense of secondary) {
      for (let k = Math.max(0, n - CONTEXT); k <= Math.min(words.length - 1, n + CONTEXT); k++) {
        if (k !== n && primary[words[k]] === sense) {
          out[pos].senseIdx = sense;
          return;
        }
      }
    }
  });

  return out;
}

export function countSenses(scan: ScanToken[]): number[] {
  const counts = SENSES.map(() => 0);
  for (const t of scan) if (t.senseIdx !== null) counts[t.senseIdx]++;
  return counts;
}

export function countAbstract(scan: ScanToken[]): number {
  return scan.reduce((n, t) => n + (t.abstract ? 1 : 0), 0);
}

export function extractDetailWord(allText: string): string | null {
  const words = allText.toLowerCase().match(/\b[a-z]{3,}\b/g) ?? [];
  const candidates = words.filter(w => !STOP_WORDS.has(w) && !ALL_SENSE_WORDS.has(w));
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function getDrillWords(scan: ScanToken[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of scan) {
    if (t.senseIdx !== null || t.abstract) continue;
    const w = clean(t.token);
    if (w.length < 3 || STOP_WORDS.has(w) || seen.has(w)) continue;
    seen.add(w); out.push(w);
    if (out.length === 3) break;
  }
  return out;
}
