import { useState, useRef } from "react";

/** What the one chord selector panel needs from whichever section has the focused bar. */
export interface ActiveGrid { sectionId: string; apply: (chord: string) => void }
import { Trash2, Copy, ChevronDown, ChevronUp, Repeat2, ClipboardPaste } from "lucide-react";
import { BarCell } from "./BarCell";
import { MONO, PHRASE_MARKER, ROW_BREAK, isEditorialBar } from "../../data/constants";
import type { ChordSuggestionSets } from "../../lib/theory/chords";
import { CHORD_ROW_KEYS, inKey } from "../../lib/theory/chords";
import { Row, sectionLabel } from "./swiss";
import type { Section } from "../../types";
import { flash, usePlay } from "../../lib/audio/PlayContext";

export function ChordRowGrid({ section, idx, total, onBarsChange, onShortLabelChange,
  onDuplicate, onDelete, onMove, onToggleNaming, namingStyle, activeKey, warnFirst, nashville, songKey,
  onCopyBars, onPasteBars, onRepeatBars, suggestions, showSuggest, onActivate }: {
  section: Section; idx: number; total: number;
  onBarsChange: (b: string[]) => void; onShortLabelChange: (v: string) => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (dir: -1|1) => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  activeKey: { key: string; mode: "major"|"minor" } | null; warnFirst: boolean;
  nashville?: boolean; songKey?: string;
  onCopyBars: () => void; onPasteBars: (() => void) | null; onRepeatBars: () => void;
  suggestions?: ChordSuggestionSets;
  /** The selector is open, so its keyboard shortcuts are live. */
  showSuggest?: boolean;
  /** Told when one of this section's bars takes focus — the selector panel then places here. */
  onActivate?: (g: ActiveGrid) => void;
}) {
  const playApi = usePlay();
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedBarIdx, setFocusedBarIdx] = useState<number | null>(null);
  const bars = section.chordBars;
  const setBar = (i: number, v: string) => { const n = [...bars]; n[i] = v; onBarsChange(n); };
  // Focus a bar with the caret after its chord — never in front of it, where
  // Backspace would do nothing (browsers differ on where focus() leaves it).
  const focusEnd = (idx: number) => {
    const el = refs.current[idx];
    if (!el) return;
    el.focus();
    const n = el.value.length;
    try { el.setSelectionRange(n, n); } catch { /* not a text input */ }
  };

  const addBar = () => {
    onBarsChange([...bars, ""]);
    setTimeout(() => focusEnd(bars.length), 20);
  };

  // Index of the last real (non-editorial) bar, for Tab-to-add-bar
  const lastRealIdx = bars.reduce((last, b, i) => !isEditorialBar(b) ? i : last, -1);

  const applyChordAt = (barIdx: number, chord: string) => {
    const n = [...bars]; n[barIdx] = chord; onBarsChange(n);
    let next = barIdx + 1;
    while (next < bars.length && isEditorialBar(bars[next])) next++;
    if (next < bars.length) {
      setTimeout(() => focusEnd(next), 10);
    } else {
      const extended = [...bars, ""]; extended[barIdx] = chord; onBarsChange(extended);
      setTimeout(() => focusEnd(bars.length), 20);
    }
  };

  // The selector panel lives once, at the bottom of the screen, and places
  // into the bar that last had focus — the same rule the per-section panel
  // followed. A ref so the panel always calls this render's closures.
  const onSuggestChord = (chord: string) => {
    if (focusedBarIdx !== null) applyChordAt(focusedBarIdx, chord);
  };
  const api = useRef<ActiveGrid>({ sectionId: section.id, apply: onSuggestChord });
  api.current.sectionId = section.id;
  api.current.apply = onSuggestChord;

  const kd = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Chord shortcuts, while the selector is open. Every row stays bound
    // whether or not it is the one on screen — which row is showing is a
    // question about the screen, and the hands should not have to ask it.
    // Only into an empty bar, or one whose whole chord is selected (as Tab
    // leaves it) — once there's a caret inside a chord, every key types, so a
    // placed G can become G7 or Gm without the 7 or the m placing a chord.
    const el = e.currentTarget;
    const replacing = !el.value || (el.selectionStart === 0 && el.selectionEnd === el.value.length);
    if (showSuggest && suggestions && replacing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      for (const row of ["inKey", "colour", "fretboard"] as const) {
        const idx = CHORD_ROW_KEYS[row].indexOf(e.key.toLowerCase());
        if (idx !== -1 && suggestions[row][idx]) {
          e.preventDefault();
          applyChordAt(i, suggestions[row][idx].chord);
          return;
        }
      }
    }

    // Tab on last real bar → append new bar
    if (e.key === "Tab" && !e.shiftKey && i === lastRealIdx) { e.preventDefault(); addBar(); }

    // Arrow navigation — skip editorial bars
    // The arrow is consumed here: left to run, the browser would carry it out
    // again inside the bar it lands in, leaving the caret one place in — in
    // front of a one-letter chord, where Backspace has nothing to delete.
    // ← arrives at the end of the previous chord, → at the start of the next.
    if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      let next = i + 1;
      while (next < bars.length && isEditorialBar(bars[next])) next++;
      const el = refs.current[next];
      if (el) { e.preventDefault(); el.focus(); el.setSelectionRange(0, 0); }
    }
    if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      // If the bar directly behind is a ROW_BREAK, Backspace at position 0
      // is handled below; ArrowLeft should still jump over it
      let prev = i - 1;
      while (prev >= 0 && isEditorialBar(bars[prev])) prev--;
      const el = refs.current[prev];
      if (el) { e.preventDefault(); el.focus(); const n = el.value.length; el.setSelectionRange(n, n); }
    }

    // Backspace at col 0 with a ROW_BREAK directly behind → remove the row break (merge rows)
    if (e.key === "Backspace"
        && e.currentTarget.selectionStart === 0
        && e.currentTarget.selectionEnd === 0
        && i > 0 && bars[i - 1] === ROW_BREAK) {
      e.preventDefault();
      const n = [...bars];
      n.splice(i - 1, 1);
      onBarsChange(n);
      // The current bar is now at i-1; wait for rerender then focus it
      setTimeout(() => { const el = refs.current[i - 1]; if (el) { el.focus(); el.setSelectionRange(0, 0); } }, 20);
      return;
    }

    // Backspace on empty last bar → remove it (trim any trailing ROW_BREAKs too)
    if (e.key === "Backspace" && !e.currentTarget.value && i === bars.length - 1 && bars.length > 1) {
      e.preventDefault();
      let n = bars.slice(0, -1);
      while (n.length > 0 && n[n.length - 1] === ROW_BREAK) n = n.slice(0, -1);
      onBarsChange(n.length > 0 ? n : [""]);
      const prevReal = n.reduce((last, b, j) => !isEditorialBar(b) ? j : last, -1);
      setTimeout(() => { if (prevReal >= 0) focusEnd(prevReal); }, 20);
      return;
    }

    // Enter → insert a ROW_BREAK after the current bar, start a new visual row
    if (e.key === "Enter") {
      e.preventDefault();
      const n = [...bars];
      // If already at end, add ROW_BREAK + empty bar; otherwise just insert ROW_BREAK
      if (i >= bars.length - 1) {
        n.push(ROW_BREAK, "");
      } else {
        n.splice(i + 1, 0, ROW_BREAK);
      }
      onBarsChange(n);
      // Focus the first real bar after the new ROW_BREAK
      setTimeout(() => {
        let next = i + 2;
        while (next < n.length && isEditorialBar(n[next])) next++;
        focusEnd(next);
      }, 20);
    }
  };

  // Split bars into visual rows on ROW_BREAK sentinels
  const visualRows: { bar: string; idx: number }[][] = [[]];
  bars.forEach((bar, barIdx) => {
    if (bar === ROW_BREAK) visualRows.push([]);
    else visualRows[visualRows.length - 1].push({ bar, idx: barIdx });
  });

  const [actionsOpen, setActionsOpen] = useState(false);
  const act = "text-[12px] text-muted-foreground hover:text-foreground transition-colors lowercase disabled:opacity-30";

  return (
    <Row className="py-3" label={
      <div className="flex flex-col items-start gap-1 pt-2.5">
        <span>{sectionLabel(section)}</span>
        <button onClick={() => setActionsOpen(v => !v)} title="Section actions" aria-expanded={actionsOpen}
          className="text-muted-foreground hover:text-foreground leading-none py-1 -my-1">⋯</button>
      </div>
    }>
      {actionsOpen && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-2 mb-1 border-b border-border" style={{ fontFamily: MONO }}>
          <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground lowercase">
            label
            <input value={section.shortLabel} onChange={e => onShortLabelChange(e.target.value)}
              className="w-20 bg-transparent text-foreground border-b border-border focus:border-[var(--rule)] focus:outline-none text-[12px]" />
          </label>
          <button onClick={() => onMove(-1)} disabled={idx === 0} className={act}><ChevronUp size={11} className="inline -mt-0.5" /> up</button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} className={act}><ChevronDown size={11} className="inline -mt-0.5" /> down</button>
          <button onClick={onDuplicate} className={act}><Copy size={10} className="inline -mt-0.5" /> duplicate</button>
          <button onClick={onCopyBars} className={act}>copy chords</button>
          <button onClick={onPasteBars ?? undefined} disabled={!onPasteBars} className={act}><ClipboardPaste size={10} className="inline -mt-0.5" /> paste</button>
          <button onClick={onRepeatBars} className={act}><Repeat2 size={11} className="inline -mt-0.5" /> repeat</button>
          <button onClick={onToggleNaming} className={act}>{namingStyle === "number" ? "1/2 → a/b" : "a/b → 1/2"}</button>
          <button onClick={onDelete} className={`${act} hover:text-destructive`}><Trash2 size={10} className="inline -mt-0.5" /> delete</button>
        </div>
      )}
      <div className="flex flex-col">
        {visualRows.map((row, ri) => (
          <div key={ri} className="flex flex-wrap items-center">
            {row.map(({ bar, idx: barIdx }, pos) => {
              if (bar === PHRASE_MARKER) {
                // Drawn by the bar before it, as a rule on its edge. Only a
                // marker with no bar before it in this row draws itself.
                const prev = row[pos - 1];
                if (prev && prev.bar !== PHRASE_MARKER) return null;
                return (
                  <button key={barIdx} onClick={() => { if (!playApi.on) setBar(barIdx, ""); }}
                    title={playApi.on ? "Phrase marker" : "Phrase marker — click to remove"}
                    className="w-4 self-stretch flex justify-center py-1.5"><span className="block w-px h-full bg-[var(--ink)]" /></button>
                );
              }
              const next = row[pos + 1];
              return (
                <BarCell key={barIdx} value={bar}
                  onChange={v => {
                    // Intercept single-char marker triggers before they reach the bar
                    if (v === "-" || v === ",") setBar(barIdx, PHRASE_MARKER);
                    else setBar(barIdx, v);
                  }}
                  onKD={kd(barIdx)}
                  onFocus={() => { setFocusedBarIdx(barIdx); onActivate?.(api.current); }}
                  reff={el => { refs.current[barIdx] = el; }}
                  isDiatonic={!activeKey || !bar.trim() || isEditorialBar(bar) || inKey(bar, activeKey.key, activeKey.mode)}
                  warnWavy={warnFirst && barIdx === 0 && !isEditorialBar(bar)}
                  nashville={nashville} songKey={songKey} playId={`${section.id}:${barIdx}`}
                  activeKey={activeKey}
                  phraseAfter={next?.bar === PHRASE_MARKER ? { onRemove: () => setBar(next.idx, "") } : null} />
              );
            })}
            {/* Add-bar on the last visual row only; not in Play mode */}
            {ri === visualRows.length - 1 && !playApi.on && (
              <button onClick={addBar} title="Add bar" aria-label="Add bar"
                className="min-h-[44px] w-10 text-left text-muted-foreground hover:text-foreground transition-colors"
                style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>+</button>
            )}
          </div>
        ))}
      </div>
    </Row>
  );
}

