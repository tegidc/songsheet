import { STOP_WORDS } from "../../data/words";

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^a-z'’-]+/).filter(Boolean);
}

function containsRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * §6: "hide what's already in your lyrics". Contiguous phrase repeats, not
 * shared words — "kettle cooling" against "the kettle ticks" must stay in the
 * cloud even though both share "kettle". Two passes: the phrase as written
 * against the lyric word sequence, then both sides with stopwords stripped —
 * the second pass is what lets a phrase match past an interior connector word
 * ("kettle in silence" against a lyric reading "kettle, the silence") that the
 * first pass, matching word-for-word, would miss.
 */
export function buildLyricMatcher(lyricTexts: string[]) {
  const lyricWords = lyricTexts.flatMap(tokenize);
  const lyricWordsNoStop = lyricWords.filter(w => !STOP_WORDS.has(w));

  return function isPhraseUsed(phraseWords: string[]): boolean {
    if (containsRun(lyricWords, phraseWords)) return true;
    const stripped = phraseWords.filter(w => !STOP_WORDS.has(w));
    if (!stripped.length) return false;
    return containsRun(lyricWordsNoStop, stripped);
  };
}
