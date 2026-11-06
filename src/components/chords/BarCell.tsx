import { usePlay } from "../../lib/audio/PlayContext";
import { fromNashville, toNashville } from "../../lib/theory/chords";
import { chordNameStyle, chordSize, FunctionMark, NashName, NowDot, Numeral, useChordFunction, type Key } from "./swiss";

/**
 * One bar of a section, on desktop: chord name large, Roman numeral small and
 * muted beside it, function shape before it when that's switched on.
 *
 * Editing is unchanged — it is an input, typed into directly, with the
 * section's keyboard flow (Tab, arrows, Backspace, Enter, the selector's
 * shortcuts) handled by `ChordRowGrid` through `onKD`. In Nashville mode it is
 * written and read in numbers (the data stays chord names); in Play mode it is
 * a button that sounds the chord and does nothing else.
 */
export function BarCell({ value, onChange, onKD, onFocus, reff, isDiatonic, warnWavy, nashville, songKey, playId, activeKey, phraseAfter }: {
  value: string; onChange: (v: string) => void;
  onKD?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: () => void;
  reff?: React.Ref<HTMLInputElement>; isDiatonic: boolean; warnWavy: boolean;
  nashville?: boolean; songKey?: string;
  /** Which on-screen chord this is, for Play mode's now-playing mark. */
  playId?: string;
  activeKey: Key;
  /** A phrase marker follows this bar: drawn as a rule on its right edge, taking no width. */
  phraseAfter?: { onRemove: () => void } | null;
}) {
  const playApi = usePlay();
  const fn = useChordFunction(value, activeKey);
  const has = !!value.trim();
  const playing = playApi.on && has && playApi.nowPlaying === playId;
  const tone = !isDiatonic && has ? "text-[var(--accent-text)]" : "text-foreground";
  const wavy = warnWavy && has ? "underline decoration-destructive decoration-wavy underline-offset-4" : "";

  return (
    <div className="relative w-1/2 md:w-auto md:min-w-[136px] shrink-0 flex items-center gap-1.5 min-h-[44px] pr-4">
      {playApi.on ? (
        has ? (
          // Play mode: sound it, nothing else. No input is rendered, so
          // nothing can focus, edit or take a shortcut.
          <button type="button" title={`Play ${value}`}
            onClick={() => playApi.play(value, playId)}
            className={`flex items-center gap-1.5 min-w-0 min-h-[44px] -ml-1 pl-1 pr-1 text-left ${tone}`}>
            {playing && <NowDot />}
            <FunctionMark fn={fn} />
            <span className={wavy} style={chordNameStyle(value, playing)}>{nashville && songKey ? <NashName chord={value} keyName={songKey} /> : value}</span>
            {!nashville && <Numeral chord={value} activeKey={activeKey} />}
          </button>
        ) : <span aria-hidden className="text-muted-foreground/50" style={chordNameStyle("—")}>—</span>
      ) : nashville && songKey ? (
        // Nashville: written and read in numbers. The input holds the plain
        // number while you type (`6-9/5`); away from it, the drawn number
        // (`6-⁹/5`) sits over it. The chord name is only in the tooltip — and
        // in the data, which is unchanged: numbers are converted on the way in.
        <>
          <FunctionMark fn={fn} />
          <span className="relative min-w-0 flex items-center" title={has ? value : undefined}>
            <input ref={reff} value={has ? toNashville(value, songKey) : ""}
              onChange={e => onChange(fromNashville(e.target.value, songKey))}
              onKeyDown={onKD} onFocus={onFocus}
              maxLength={12} placeholder="—" aria-label="Chord (Nashville number)"
              className={`peer min-w-0 bg-transparent focus:outline-none caret-[var(--accent-fill)] placeholder:text-muted-foreground/40 border-b border-transparent focus:border-[var(--rule)] ${has ? "text-transparent focus:text-current" : ""} ${tone}`}
              style={{ ...chordNameStyle(value || "—"), width: `calc(${Math.max(2, (has ? toNashville(value, songKey) : "").length) + 0.6}ch + 2px)`, maxWidth: "11ch" }} />
            {has && <span aria-hidden className={`absolute left-0 pointer-events-none peer-focus:hidden ${tone} ${wavy}`} style={chordNameStyle(value)}>
              <NashName chord={value} keyName={songKey} />
            </span>}
          </span>
        </>
      ) : (
        <>
          <FunctionMark fn={fn} />
          <input ref={reff} value={value}
            onChange={e => { const v = e.target.value; onChange(v ? v[0].toUpperCase() + v.slice(1) : v); }}
            onKeyDown={onKD} onFocus={onFocus}
            maxLength={12} placeholder="—" aria-label="Chord"
            className={`min-w-0 bg-transparent focus:outline-none caret-[var(--accent-fill)] placeholder:text-muted-foreground/40 border-b border-transparent focus:border-[var(--rule)] ${tone} ${wavy}`}
            // Sized to its text (ch of the display face, plus a little for
            // wide capitals) so the numeral sits beside the name, not across the cell
            style={{ ...chordNameStyle(value || "—"), fontSize: chordSize(value), width: `calc(${Math.max(2, value.length) + 0.6}ch + 2px)`, maxWidth: "11ch" }} />
          {has && <Numeral chord={value} activeKey={activeKey} />}
        </>
      )}
      {phraseAfter && (
        <button type="button" onClick={() => { if (!playApi.on) phraseAfter.onRemove(); }}
          title={playApi.on ? "Phrase marker" : "Phrase marker — click to remove"}
          aria-label="Phrase marker"
          className="absolute right-1 top-1.5 bottom-1.5 w-3 flex justify-center group/pm">
          <span className="block w-px h-full bg-[var(--ink)] group-hover/pm:bg-[var(--accent-fill)]" />
        </button>
      )}
    </div>
  );
}
