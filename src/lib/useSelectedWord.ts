import { useEffect, useState } from "react";

// A single word is one letter followed by letters, apostrophes or hyphens —
// the same shape AutoTA's onSelect already accepts, so a word picked out of the
// lyrics reads the same way here.
const WORD_RE = /^[A-Za-z][A-Za-z'’-]*$/;

/**
 * The word currently selected anywhere on the page, or null.
 *
 * Two sources, because they are genuinely separate: a selection inside a
 * textarea or input is invisible to `window.getSelection()` in Chrome, and most
 * of what a songwriter selects here — lyrics, notebook, story — is in a
 * textarea. Multi-word selections deliberately return null rather than guessing
 * which word was meant.
 *
 * `enabled` is false on touch, where selecting text raises the OS copy/paste
 * bar and needs a different trigger entirely (Phase 5).
 */
export function useSelectedWord(enabled: boolean): string | null {
  const [word, setWord] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) { setWord(null); return; }

    const read = () => {
      const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
      const isField = !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT");
      const raw = isField && el.selectionStart != null && el.selectionStart !== el.selectionEnd
        ? el.value.slice(el.selectionStart, el.selectionEnd ?? undefined)
        : window.getSelection()?.toString() ?? "";
      // Trim surrounding punctuation so double-clicking `rain,` still reads as a word.
      const trimmed = raw.trim().replace(/^[^A-Za-z]+/, "").replace(/[^A-Za-z'’-]+$/, "");
      setWord(WORD_RE.test(trimmed) ? trimmed : null);
    };

    document.addEventListener("selectionchange", read);
    read();
    return () => document.removeEventListener("selectionchange", read);
  }, [enabled]);

  return word;
}
