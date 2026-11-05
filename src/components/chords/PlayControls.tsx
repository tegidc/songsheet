import { useEffect, useState } from "react";
import type { ChordRow, ChordSuggestionSets } from "../../lib/theory/chords";
import { usePlay } from "../../lib/audio/PlayContext";
import { setUiPrefs, useUiPrefs, type Instrument } from "../../lib/prefs";
import { formatDetectedKey } from "../../lib/theory/key";
import { ChordSelectorPanel, Row, type Key } from "./swiss";

const INSTRUMENTS: Instrument[] = ["piano", "guitar", "ambient"];

/**
 * The "play" row: the Play switch (ink track, accent knob) and the instrument,
 * with a quiet loading / fallback line under it. Switching on is the user
 * gesture that starts audio — see lib/audio/engine.ts.
 */
export function PlayRow() {
  const { on, setOn, status, note } = usePlay();
  const { instrument } = useUiPrefs();
  return (
    <Row label="play" align="center" className="py-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <button role="switch" aria-checked={on} aria-label="Play mode"
          title={on ? "Play mode on — tapping a chord plays it" : "Play mode — tap chords to hear them"}
          onClick={() => setOn(!on)}
          className="relative shrink-0 w-[52px] h-7 rounded-full transition-colors my-2"
          style={{ background: on ? "var(--ink)" : "var(--rule-soft)" }}>
          <span className="absolute top-1 w-5 h-5 rounded-full transition-all"
            style={{ left: on ? 28 : 4, background: on ? "var(--accent-fill)" : "var(--bg)" }} />
        </button>
        <div className="flex items-center gap-3.5 text-[13px]" role="radiogroup" aria-label="Play instrument" style={{ fontFamily: "var(--font-label)" }}>
          {INSTRUMENTS.map(i => (
            <button key={i} role="radio" aria-checked={instrument === i} onClick={() => setUiPrefs({ instrument: i })}
              className={`py-2.5 transition-colors ${instrument === i ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {i}
            </button>
          ))}
        </div>
      </div>
      {on && (status === "loading" || status === "fallback") && (
        <p className="text-[11px] text-muted-foreground pb-1" style={{ fontFamily: "var(--font-label)" }} aria-live="polite">
          {status === "loading" ? `loading ${instrument}…` : note}
        </p>
      )}
    </Row>
  );
}

/**
 * The "key" row: the key in force as a big letter, with what detection makes
 * of the chords small beside it — `detected Am · 75% · set`. Same behaviour as
 * the Analyse panel's controls, which remain: the letter is the freeform "Set
 * key as" field (nothing validated), "set" adopts the detected key, ↻ re-runs
 * detection.
 */
export function KeyRow({ songKey, activeKey, suggestion, onSetKey, onRedetect }: {
  songKey: string; activeKey: Key;
  suggestion: { key: string; mode: "major" | "minor"; confidence: number; tieBreak: boolean } | null;
  onSetKey: (k: string) => void; onRedetect: () => void;
}) {
  const [draft, setDraft] = useState(songKey);
  useEffect(() => { setDraft(songKey); }, [songKey]);
  const commit = () => { if (draft !== songKey) onSetKey(draft); };
  const detected = suggestion ? formatDetectedKey(suggestion.key, suggestion.mode) : "";
  const shown = activeKey ? formatDetectedKey(activeKey.key, activeKey.mode) : "";
  return (
    <Row label="key" align="center" rule={false} className="py-3">
      <div className="flex items-baseline gap-2.5 flex-wrap min-w-0">
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } }}
          data-large-type placeholder={shown || "—"} aria-label="Key" title="Set key as — anything you type is kept"
          size={Math.max(2, (draft || shown || "—").length)}
          className="bg-transparent focus:outline-none border-b border-transparent focus:border-[var(--rule)] text-foreground placeholder:text-muted-foreground min-w-0"
          style={{ fontFamily: "var(--font-title)", fontSize: 44, fontWeight: "var(--title-weight)" as unknown as number, letterSpacing: "-0.04em", lineHeight: 1 }} />
        <span className="text-[13px] text-muted-foreground flex items-baseline gap-1.5 flex-wrap" style={{ fontFamily: "var(--font-label)" }}>
          {!songKey.trim() && activeKey && <span>detected</span>}
          {songKey.trim() && suggestion && <span title={suggestion.tieBreak ? "A major key and its relative minor fit equally well; broken by the chord this resolves on" : undefined}>detected {detected}</span>}
          {suggestion && <><span aria-hidden>·</span><span>{Math.round(suggestion.confidence * 100)}%</span></>}
          {suggestion && <><span aria-hidden>·</span>
            <button onClick={() => onSetKey(detected)} disabled={detected === songKey.trim()}
              className="text-foreground underline underline-offset-2 disabled:no-underline disabled:text-muted-foreground"
              title={`Set ${detected} as the key`}>set</button></>}
          <button onClick={onRedetect} title="Re-run detection on the chords as they stand" aria-label="Re-run key detection"
            className="hover:text-foreground px-1">↻</button>
        </span>
      </div>
    </Row>
  );
}

/**
 * The chord selector docked at the bottom of the screen. On desktop it shows
 * when the selector is switched on (it places into the last focused bar, as
 * the per-section panel did) or when Play is on; on a phone, where the
 * selector is a bar's drawer, it shows only in Play mode, to play from.
 */
export function SelectorDock({ visible, ...panel }: { visible: boolean } & React.ComponentProps<typeof ChordSelectorPanel>) {
  const { on } = usePlay();
  if (!visible && !on) return null;
  return (
    <div className="sticky bottom-0 z-10 -mx-4 md:mx-0 mt-2">
      <ChordSelectorPanel {...panel} className="pb-[max(1.25rem,env(safe-area-inset-bottom))] max-h-[48vh] overflow-y-auto" />
    </div>
  );
}

export type { ChordRow, ChordSuggestionSets };
