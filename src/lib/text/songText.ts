import type { Song } from "../../types";

/**
 * Text the writing tools read *out of* a song, as opposed to text they fetch.
 *
 * Both of these were written twice, identically, in two components each —
 * `fragmentSourceText` in `InspirationPanel` and `InspirationStrip`, and
 * `owWordSet` in `RhymePanel` and `ThesaurusPanel`. Each pair was the same
 * expression character for character, which is the only reason they are one
 * function now: what the fragments are drawn from, and what counts as a word
 * the songwriter has already used, are decisions that should not be able to
 * drift apart between the desktop panel and its mobile counterpart.
 *
 * Callers keep their own `useMemo` and their own dependency arrays, so when
 * each recomputes is unchanged.
 */

/**
 * The pool the Inspiration fragments come from: Notebook, Big Idea, Story and
 * every object writing — deliberately **not** Production Notes, which are
 * about the record rather than the song.
 */
export function fragmentSourceText(song: Song): string {
  return [
    song.generalNotes ?? "",
    song.bigIdea ?? "",
    song.story?.beginning ?? "",
    song.story?.middle ?? "",
    song.story?.end ?? "",
    ...(song.objectWritings ?? []).map(o => o.text),
  ].join(" ");
}

/**
 * Every word of three letters or more that appears in the song's object
 * writings, lowercased. Rhyme and Thesaurus results matching one are marked
 * with the accent ◆ — "you have already written this word".
 */
export function owWordSet(song: Song): Set<string> {
  const s = new Set<string>();
  (song.objectWritings ?? []).forEach(o =>
    (o.text ?? "").toLowerCase().match(/\b[a-z]{3,}\b/g)?.forEach(w => s.add(w))
  );
  return s;
}
