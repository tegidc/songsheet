// The word the caret is sitting in.
//
// This is how a word gets picked on a phone. Selection was the old way and it
// cannot work there: on iOS, selecting text raises the Cut/Copy/Paste callout,
// which floats over the inspiration strip — the very thing the selection was
// meant to feed. A resting caret raises nothing, because there is no selection.

/** How long the caret must sit still before the word under it is offered. */
export const CARET_REST_MS = 2000;

// Letters, apostrophes (both kinds — iOS smart-quotes them) and hyphens. The
// same alphabet the selection path used, so the two agree on what a word is.
const WORD_CHAR = /[a-zA-Z‘’'\-]/;

/**
 * The word containing `caret`, normalized for lookup, or null if the caret is
 * not in one. A caret at either edge of a word counts as inside it: while you
 * are writing, the caret is almost always sitting immediately after the last
 * letter you typed, and a rule that excluded that would almost never fire.
 */
export function wordAtCaret(text: string, caret: number): string | null {
  if (caret < 0 || caret > text.length) return null;
  let from = caret, to = caret;
  while (from > 0 && WORD_CHAR.test(text[from - 1])) from--;
  while (to < text.length && WORD_CHAR.test(text[to])) to++;
  if (to <= from) return null;
  const word = text.slice(from, to).toLowerCase().replace(/[^a-z']/g, "");
  return word.length >= 2 ? word : null;
}
