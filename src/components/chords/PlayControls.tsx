import { MONO } from "../../data/constants";
import { CHORD_ROW_HEADING, type ChordRow, type ChordSuggestion, type ChordSuggestionSets } from "../../lib/theory/chords";
import { flash, usePlay } from "../../lib/audio/PlayContext";
import { useUiPrefs } from "../../lib/prefs";

/** The Play switch on the Chords screen, with its quiet loading / fallback line. */
export function PlayToggle() {
  const { on, setOn, status, note } = usePlay();
  const { instrument } = useUiPrefs();
  return (
    <div className="flex items-center gap-2 min-w-0">
      <button role="switch" aria-checked={on} onClick={() => setOn(!on)}
        title={on ? "Play mode on — tapping a chord plays it" : "Play mode — tap chords to hear them"}
        className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${on ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
        style={{ fontFamily: MONO }}>
        <span aria-hidden className={`inline-block w-2 h-2 rounded-full ${on ? "bg-[var(--accent-fill,var(--accent))]" : "border border-current"}`} />
        Play
      </button>
      {on && (
        <span className="text-[10px] text-muted-foreground truncate" style={{ fontFamily: MONO }} aria-live="polite">
          {status === "loading" ? `loading ${instrument}…` : status === "fallback" ? note : instrument}
        </span>
      )}
    </div>
  );
}

/**
 * The chord selector's pills, for playing — shown while Play is on wherever the
 * selector isn't already on screen (always on mobile, where the selector only
 * lives in a bar's drawer, and that drawer can't open in Play mode).
 *
 * Same rows, same rotation as the selector itself: the label cycles In Key /
 * Colour / From Fretboard, and Used stays put.
 */
export function PlayPalette({ suggestions, chordRow, onCycleChordRow }: {
  suggestions: ChordSuggestionSets; chordRow: ChordRow; onCycleChordRow: () => void;
}) {
  const { play } = usePlay();
  const Pills = ({ items }: { items: ChordSuggestion[] }) => (
    <div className="flex flex-wrap gap-1.5">
      {items.map(s => (
        <button key={s.chord + s.label}
          onClick={e => { flash(e.currentTarget); play(s.chord); }}
          className="flex flex-col items-center justify-center min-w-[52px] min-h-[44px] px-2 rounded-sm border border-border bg-background active:bg-muted transition-colors"
          style={{ fontFamily: MONO }}>
          <span className="text-[14px] text-foreground leading-tight">{s.chord}</span>
          {s.label && <span className="text-[8px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">{s.label}</span>}
        </button>
      ))}
    </div>
  );
  return (
    <div className="border border-border rounded-sm p-3 mb-6 flex flex-col gap-3">
      <div>
        <button onClick={onCycleChordRow} className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block py-1"
          style={{ fontFamily: MONO }}>{CHORD_ROW_HEADING[chordRow]} ›</button>
        {suggestions[chordRow].length
          ? <Pills items={suggestions[chordRow]} />
          : <span className="text-[11px] text-muted-foreground italic" style={{ fontFamily: MONO }}>Nothing here yet</span>}
      </div>
      {suggestions.used.length > 0 && (
        <div>
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-2 block" style={{ fontFamily: MONO }}>Used</span>
          <Pills items={suggestions.used} />
        </div>
      )}
    </div>
  );
}

/** `PlayPalette`, only while Play is on. */
export function PlayPaletteWhenOn(props: Parameters<typeof PlayPalette>[0]) {
  return usePlay().on ? <PlayPalette {...props} /> : null;
}
