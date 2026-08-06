import { SERIF } from "../../data/constants";

// Bottom right, on every tab, so a writing can be started mid-lyrics without
// losing your place. Two states, and the difference is the word:
//
//   nothing selected   ✦            empty writing, 10-minute timer
//   a word selected    ✦ rain       seeded with it, 2-minute timer
//
// Both go through the same handler the Lyrics "Object Write [word]" button and
// ThesaurusPanel already use, rather than a parallel path.
export function FloatingOWButton({ word, onStart }: {
  /** The word selected anywhere on the page, or null. Always null on touch. */
  word: string | null;
  onStart: (word: string | null) => void;
}) {
  return (
    <button
      // Keep the selection alive: focusing the button would collapse it, and
      // the word would be gone by the time the click landed.
      onMouseDown={e => e.preventDefault()}
      onClick={() => onStart(word)}
      title={word ? `Object write “${word}” — 2 minutes` : "New object writing — 10 minutes"}
      className="fixed bottom-5 right-5 z-30 flex items-center gap-1.5 px-3 py-2 bg-background border border-border rounded-full shadow-lg text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors">
      <span className="text-accent text-[14px] leading-none">✦</span>
      {word && (
        <span className="text-[11px] italic max-w-[9rem] truncate leading-none" style={{ fontFamily: SERIF }}>
          {word}
        </span>
      )}
    </button>
  );
}
