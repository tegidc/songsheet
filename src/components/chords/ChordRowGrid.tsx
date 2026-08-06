import { useState, useRef } from "react";
import { Plus, Trash2, Copy, ChevronDown, ChevronUp, Repeat2, ClipboardPaste } from "lucide-react";
import { BarCell } from "./BarCell";
import { CH, CW, MONO, PHRASE_MARKER, ROW_BREAK, SCOL, isEditorialBar } from "../../data/constants";
import type { ChordSuggestion } from "../../lib/theory/chords";
import { inKey } from "../../lib/theory/chords";
import type { Section, Tab } from "../../types";

export function ChordRowGrid({ section, idx, total, onBarsChange, onShortLabelChange,
  onDuplicate, onDelete, onMove, onToggleNaming, namingStyle, detected, warnFirst, nashville, songKey,
  onCopyBars, onPasteBars, onRepeatBars, suggestions, showSuggest }: {
  section: Section; idx: number; total: number;
  onBarsChange: (b: string[]) => void; onShortLabelChange: (v: string) => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (dir: -1|1) => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  detected: { key: string; mode: "major"|"minor" } | null; warnFirst: boolean;
  nashville?: boolean; songKey?: string;
  onCopyBars: () => void; onPasteBars: (() => void) | null; onRepeatBars: () => void;
  suggestions?: { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] };
  showSuggest?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedBarIdx, setFocusedBarIdx] = useState<number | null>(null);
  const bars = section.chordBars;
  const setBar = (i: number, v: string) => { const n = [...bars]; n[i] = v; onBarsChange(n); };

  const addBar = () => {
    onBarsChange([...bars, ""]);
    setTimeout(() => refs.current[bars.length]?.focus(), 20);
  };

  // Index of the last real (non-editorial) bar, for Tab-to-add-bar
  const lastRealIdx = bars.reduce((last, b, i) => !isEditorialBar(b) ? i : last, -1);

  const applyChordAt = (barIdx: number, chord: string) => {
    const n = [...bars]; n[barIdx] = chord; onBarsChange(n);
    let next = barIdx + 1;
    while (next < bars.length && isEditorialBar(bars[next])) next++;
    if (next < bars.length) {
      setTimeout(() => refs.current[next]?.focus(), 10);
    } else {
      const extended = [...bars, ""]; extended[barIdx] = chord; onBarsChange(extended);
      setTimeout(() => refs.current[bars.length]?.focus(), 20);
    }
  };

  const onSuggestChord = (chord: string) => {
    if (focusedBarIdx !== null) applyChordAt(focusedBarIdx, chord);
  };

  // Keys for chord shortcut rows (mirrors a QWERTY keyboard layout)
  const INKEY_KEYS  = ["1","2","3","4","5","6","7"];
  const COLOUR_KEYS = ["q","w","e","r","t","y","u"];

  const kd = (i: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Chord suggestion shortcuts — only when panel is active and bar is empty or modifier held
    if (showSuggest && suggestions && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const kidx = INKEY_KEYS.indexOf(e.key);
      if (kidx !== -1 && suggestions.inKey[kidx]) {
        e.preventDefault();
        applyChordAt(i, suggestions.inKey[kidx].chord);
        return;
      }
      const cidx = COLOUR_KEYS.indexOf(e.key.toLowerCase());
      if (cidx !== -1 && suggestions.colour[cidx]) {
        e.preventDefault();
        applyChordAt(i, suggestions.colour[cidx].chord);
        return;
      }
    }

    // Tab on last real bar → append new bar
    if (e.key === "Tab" && !e.shiftKey && i === lastRealIdx) { e.preventDefault(); addBar(); }

    // Arrow navigation — skip editorial bars
    if (e.key === "ArrowRight" && e.currentTarget.selectionStart === e.currentTarget.value.length) {
      let next = i + 1;
      while (next < bars.length && isEditorialBar(bars[next])) next++;
      refs.current[next]?.focus();
    }
    if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      // If the bar directly behind is a ROW_BREAK, Backspace at position 0
      // is handled below; ArrowLeft should still jump over it
      let prev = i - 1;
      while (prev >= 0 && isEditorialBar(bars[prev])) prev--;
      refs.current[prev]?.focus();
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
      setTimeout(() => refs.current[i - 1]?.focus(), 20);
      return;
    }

    // Backspace on empty last bar → remove it (trim any trailing ROW_BREAKs too)
    if (e.key === "Backspace" && !e.currentTarget.value && i === bars.length - 1 && bars.length > 1) {
      e.preventDefault();
      let n = bars.slice(0, -1);
      while (n.length > 0 && n[n.length - 1] === ROW_BREAK) n = n.slice(0, -1);
      onBarsChange(n.length > 0 ? n : [""]);
      const prevReal = n.reduce((last, b, j) => !isEditorialBar(b) ? j : last, -1);
      setTimeout(() => { if (prevReal >= 0) refs.current[prevReal]?.focus(); }, 20);
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
        refs.current[next]?.focus();
      }, 20);
    }
  };

  // Split bars into visual rows on ROW_BREAK sentinels
  const visualRows: { bar: string; idx: number }[][] = [[]];
  bars.forEach((bar, barIdx) => {
    if (bar === ROW_BREAK) visualRows.push([]);
    else visualRows[visualRows.length - 1].push({ bar, idx: barIdx });
  });

  const dotBg = {
    backgroundImage: `radial-gradient(circle, rgba(28,24,20,0.18) 1px, transparent 1px)`,
    backgroundSize: `${CW}px ${CH}px`,
    scrollbarWidth: "none" as const,
  };

  return (
    <div className="group flex items-stretch border-b border-border/60 last:border-b-0">
      {/* Section label column */}
      <div className={`${SCOL[section.type]} shrink-0 flex flex-col justify-center px-2 border-r border-border`}
        style={{ width: 136, minHeight: CH }}>
        {/* Row 1: label + dup / copy / paste */}
        <div className="flex items-center gap-1">
          <input value={section.shortLabel} onChange={e => onShortLabelChange(e.target.value)}
            className="bg-transparent text-[10px] uppercase tracking-[0.12em] text-muted-foreground focus:outline-none flex-1 min-w-0 truncate hover:text-foreground transition-colors"
            style={{ fontFamily: MONO }} />
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={onDuplicate} title="Duplicate section" className="text-muted-foreground hover:text-foreground transition-colors"><Copy size={10} /></button>
            <button onClick={onCopyBars} title="Copy chords"
              className="text-muted-foreground hover:text-foreground transition-colors text-[9px] leading-none"
              style={{ fontFamily: MONO }}>cc</button>
            {onPasteBars ? (
              <button onClick={onPasteBars} title="Paste chords"
                className="text-accent hover:text-foreground transition-colors">
                <ClipboardPaste size={10} />
              </button>
            ) : (
              <span className="text-muted-foreground/20 cursor-default"><ClipboardPaste size={10} /></span>
            )}
          </div>
        </div>
        {/* Row 2: up / down */}
        <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => onMove(-1)} disabled={idx === 0} title="Move up"
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronUp size={10} /></button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} title="Move down"
            className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"><ChevronDown size={10} /></button>
        </div>
        {/* Row 3: repeat / delete / naming */}
        <div className="flex items-center gap-1 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onRepeatBars} title="Repeat progression"
            className="text-muted-foreground hover:text-foreground transition-colors">
            <Repeat2 size={10} />
          </button>
          <button onClick={onDelete} title="Delete section" className="text-muted-foreground hover:text-destructive transition-colors"><Trash2 size={10} /></button>
          <button onClick={onToggleNaming} title={namingStyle === "number" ? "Switch to A/B" : "Switch to 1/2"}
            className="text-muted-foreground hover:text-foreground transition-colors text-[9px] leading-none"
            style={{ fontFamily: MONO }}>{namingStyle === "number" ? "#" : "A"}</button>
        </div>
      </div>

      {/* Multi-row bar grid */}
      <div className="flex-1 overflow-x-auto flex flex-col" style={dotBg}>
        {visualRows.map((row, ri) => (
          <div key={ri} className={`flex items-stretch${ri > 0 ? " border-t border-border/[0.07]" : ""}`}>
            {row.map(({ bar, idx: barIdx }) =>
              bar === PHRASE_MARKER ? (
                /* Phrase-boundary marker — click to remove */
                <button key={barIdx} onClick={() => setBar(barIdx, "")}
                  title="Phrase marker — click to remove"
                  className="shrink-0 flex items-center justify-center text-muted-foreground/25 hover:text-muted-foreground/55 transition-colors"
                  style={{ width: 26, height: CH }}>
                  <span style={{ fontFamily: MONO, fontSize: 15, lineHeight: 1 }}>│</span>
                </button>
              ) : (
                <BarCell key={barIdx} value={bar}
                  onChange={v => {
                    // Intercept single-char marker triggers before they reach the bar
                    if (v === "-" || v === ",") setBar(barIdx, PHRASE_MARKER);
                    else setBar(barIdx, v);
                  }}
                  onKD={kd(barIdx)}
                  onFocus={() => setFocusedBarIdx(barIdx)}
                  reff={el => { refs.current[barIdx] = el; }}
                  isDiatonic={!detected || !bar.trim() || isEditorialBar(bar) || inKey(bar, detected.key, detected.mode as "major"|"minor")}
                  warnWavy={warnFirst && barIdx === 0 && !isEditorialBar(bar)}
                  nashville={nashville} songKey={songKey} />
              )
            )}
            {/* Add-bar button only on the last visual row */}
            {ri === visualRows.length - 1 && (
              <div className="shrink-0 flex items-center justify-center" style={{ width: CW, height: CH }}>
                <button onClick={addBar}
                  className="w-5 h-5 rounded-full border border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground transition-colors flex items-center justify-center">
                  <Plus size={10} />
                </button>
              </div>
            )}
          </div>
        ))}

        {/* Desktop chord suggestion panel */}
        {showSuggest && suggestions && (
          <div className="border-t border-border/40 px-3 py-2.5 bg-muted/20">
            {focusedBarIdx === null && (
              <p className="text-[10px] text-muted-foreground/60 italic" style={{ fontFamily: MONO }}>
                Click a bar above, then use shortcuts or click a chord
              </p>
            )}
            {(() => {
              const SuggestGroup = ({ heading, items, keyRow }: { heading: string; items: ChordSuggestion[]; keyRow?: string[] }) =>
                items.length ? (
                  <div className="flex items-start gap-2 mr-5 mb-1">
                    <span className="text-[8px] uppercase tracking-[0.14em] text-muted-foreground shrink-0 mt-2 w-9 text-right leading-tight" style={{ fontFamily: MONO }}>{heading}</span>
                    <div className="flex flex-wrap gap-1">
                      {items.map((s, si) => (
                        <button key={s.chord + s.label} onClick={() => onSuggestChord(s.chord)}
                          className="relative flex flex-col items-center justify-center min-w-[42px] px-2 pt-3 pb-1 rounded border border-border bg-background hover:bg-muted hover:border-foreground/30 transition-colors"
                          style={{ fontFamily: MONO }}>
                          {keyRow?.[si] && (
                            <span className="absolute top-0.5 right-1 text-[7px] text-muted-foreground/50 leading-none" style={{ fontFamily: MONO }}>{keyRow[si]}</span>
                          )}
                          <span className="text-[11px] text-foreground leading-tight">{s.chord}</span>
                          {s.label && <span className="text-[7px] uppercase tracking-[0.1em] text-muted-foreground mt-0.5">{s.label}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null;

              return (
                <div>
                  <div className="flex flex-wrap">
                    <SuggestGroup heading="In key" items={suggestions.inKey} keyRow={INKEY_KEYS} />
                    <SuggestGroup heading="Used" items={suggestions.used} />
                    <SuggestGroup heading="Colour" items={suggestions.colour} keyRow={COLOUR_KEYS} />
                  </div>
                  {suggestions.inKey.length === 0 && suggestions.used.length === 0 && suggestions.colour.length === 0 && (
                    <p className="text-[10px] text-muted-foreground/60 italic" style={{ fontFamily: MONO }}>
                      Add chords to see suggestions
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

