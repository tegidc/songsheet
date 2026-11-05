import { useState } from "react";
import { Trash2, Copy, ChevronDown, ChevronUp, Repeat2, ClipboardPaste } from "lucide-react";
import { ChordPickerSheet } from "./ChordPickerSheet";
import { MONO, PHRASE_MARKER, ROW_BREAK, isEditorialBar } from "../../data/constants";
import type { ChordRow, ChordSuggestionSets } from "../../lib/theory/chords";
import { inKey } from "../../lib/theory/chords";
import type { Section } from "../../types";
import { usePlay } from "../../lib/audio/PlayContext";
import { chordNameStyle, FunctionMark, NowDot, Numeral, Row, sectionLabel, useChordFunction, type Key } from "./swiss";

export function MobileChordSection({ section, idx, total, onBarsChange, onShortLabelChange,
  onDuplicate, onDelete, onMove, onToggleNaming, namingStyle, activeKey, warnFirst,
  onCopyBars, onPasteBars, onRepeatBars, suggestions, chordRow, onCycleChordRow,
  onRemoveFretboardChord }: {
  section: Section; idx: number; total: number;
  onBarsChange: (b: string[]) => void; onShortLabelChange: (v: string) => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (dir: -1|1) => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  activeKey: { key: string; mode: "major"|"minor" } | null; warnFirst: boolean;
  onCopyBars: () => void; onPasteBars: (() => void) | null; onRepeatBars: () => void;
  suggestions: ChordSuggestionSets;
  chordRow: ChordRow; onCycleChordRow: () => void;
  /** Prune the song's fretboard log. Only the From Fretboard row offers it. */
  onRemoveFretboardChord?: (name: string) => void;
}) {
  const playApi = usePlay();
  const [showActions, setShowActions] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const bars = section.chordBars;
  const setBar = (i: number, v: string) => { const n = [...bars]; n[i] = v; onBarsChange(n); };

  const isReal = (i: number) => i >= 0 && i < bars.length && !isEditorialBar(bars[i]);
  const nextReal = (from: number) => { let i = from + 1; while (i < bars.length && isEditorialBar(bars[i])) i++; return i < bars.length ? i : -1; };
  const prevReal = (from: number) => { let i = from - 1; while (i >= 0 && isEditorialBar(bars[i])) i--; return i >= 0 ? i : -1; };

  const addBar = () => { const n = [...bars, ""]; onBarsChange(n); setSel(n.length - 1); };

  // Set the selected bar, optionally advancing to the next real bar (append if needed)
  const setSelected = (chord: string, advance: boolean) => {
    if (sel === null) return;
    const n = [...bars]; n[sel] = chord;
    if (!advance) { onBarsChange(n); return; }
    const nxt = nextReal(sel);
    if (nxt === -1) { n.push(""); onBarsChange(n); setSel(n.length - 1); }
    else { onBarsChange(n); setSel(nxt); }
  };

  const step = (dir: -1 | 1) => {
    if (sel === null) return;
    const t = dir === 1 ? nextReal(sel) : prevReal(sel);
    if (t !== -1) setSel(t);
    else if (dir === 1) addBar();
  };

  // Split into visual rows on ROW_BREAK
  const visualRows: { bar: string; idx: number }[][] = [[]];
  bars.forEach((bar, barIdx) => {
    if (bar === ROW_BREAK) visualRows.push([]);
    else visualRows[visualRows.length - 1].push({ bar, idx: barIdx });
  });

  const actionBtn = "flex items-center gap-1 text-[12px] lowercase text-muted-foreground active:text-foreground transition-colors min-h-9";

  return (
    <Row className="py-3" label={
      <div className="flex flex-col items-start gap-1 pt-2.5">
        <span>{sectionLabel(section)}</span>
        <button onClick={() => setShowActions(v => !v)} title="Section actions" aria-expanded={showActions}
          className="text-muted-foreground active:text-foreground leading-none py-2 -my-1 pr-3">⋯</button>
      </div>
    }>
      {/* Collapsible action row */}
      {showActions && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 mb-1 border-b border-border" style={{ fontFamily: MONO }}>
          <label className="flex items-center gap-1.5 text-[12px] lowercase text-muted-foreground basis-full">
            label
            <input value={section.shortLabel} onChange={e => onShortLabelChange(e.target.value)}
              className="flex-1 min-w-0 bg-transparent text-foreground border-b border-border focus:outline-none" />
          </label>
          <button onClick={() => onMove(-1)} disabled={idx === 0} className={`${actionBtn} disabled:opacity-25`}><ChevronUp size={12} />up</button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} className={`${actionBtn} disabled:opacity-25`}><ChevronDown size={12} />down</button>
          <button onClick={onDuplicate} className={actionBtn}><Copy size={11} />duplicate</button>
          <button onClick={onCopyBars} className={actionBtn}>copy</button>
          {onPasteBars && <button onClick={onPasteBars} className={actionBtn}><ClipboardPaste size={11} />paste</button>}
          <button onClick={onRepeatBars} className={actionBtn}><Repeat2 size={12} />repeat</button>
          <button onClick={onToggleNaming} className={actionBtn}>{namingStyle === "number" ? "1/2" : "a/b"}</button>
          <button onClick={onDelete} className={`${actionBtn} active:text-destructive`}><Trash2 size={11} />delete</button>
        </div>
      )}

      {/* Bars — tap to edit (or, in Play mode, to hear) */}
      <div className="flex flex-col">
        {visualRows.map((row, ri) => (
          <div key={ri} className="flex flex-wrap items-center">
            {row.map(({ bar, idx: barIdx }, pos) => {
              if (bar === PHRASE_MARKER) {
                const prev = row[pos - 1];
                if (prev && prev.bar !== PHRASE_MARKER) return null;   // drawn by the bar before it
                return (
                  <button key={barIdx} onClick={() => { if (!playApi.on) setBar(barIdx, ""); }}
                    title={playApi.on ? "Phrase marker" : "Phrase marker — tap to remove"}
                    className="w-5 self-stretch flex justify-center py-2"><span className="block w-px h-full bg-[var(--ink)]" /></button>
                );
              }
              const next = row[pos + 1];
              return (
                <MobileBar key={barIdx} bar={bar} selected={sel === barIdx}
                  playId={`${section.id}:${barIdx}`} activeKey={activeKey}
                  offKey={!!activeKey && !!bar.trim() && !inKey(bar, activeKey.key, activeKey.mode)}
                  wavy={warnFirst && barIdx === 0 && !!bar.trim()}
                  onTap={() => setSel(barIdx)}
                  phraseAfter={next?.bar === PHRASE_MARKER ? () => { if (!playApi.on) setBar(next.idx, ""); } : null} />
              );
            })}
            {ri === visualRows.length - 1 && !playApi.on && (
              <button onClick={addBar} title="Add bar" aria-label="Add bar"
                className="min-h-[44px] w-12 text-left text-muted-foreground active:text-foreground"
                style={{ fontFamily: "var(--font-display)", fontSize: 20 }}>+</button>
            )}
          </div>
        ))}
      </div>

      <ChordPickerSheet
        open={!playApi.on && sel !== null && isReal(sel)}
        title={`${section.shortLabel || section.label} · bar ${sel !== null ? bars.slice(0, sel + 1).filter(b => !isEditorialBar(b)).length : ""}`}
        value={sel !== null ? bars[sel] ?? "" : ""}
        suggestions={suggestions}
        chordRow={chordRow}
        onCycleChordRow={onCycleChordRow}
        onRemoveFretboardChord={onRemoveFretboardChord}
        onClose={() => setSel(null)}
        onSet={setSelected}
        onClear={() => { if (sel !== null) setBar(sel, ""); }}
        onDelete={() => {
          if (sel === null) return;
          const n = bars.filter((_, i) => i !== sel);
          onBarsChange(n.length ? n : [""]);
          setSel(null);
        }}
        onStep={step}
        activeKey={activeKey}
        canPrev={sel !== null && prevReal(sel) !== -1}
        canNext={sel !== null} />
    </Row>
  );
}

/** One bar on a phone: a 44px-tall button, half the row wide. */
function MobileBar({ bar, selected, playId, activeKey, offKey, wavy, onTap, phraseAfter }: {
  bar: string; selected: boolean; playId: string; activeKey: Key; offKey: boolean; wavy: boolean;
  onTap: () => void; phraseAfter: (() => void) | null;
}) {
  const playApi = usePlay();
  const fn = useChordFunction(bar, activeKey);
  const has = !!bar.trim();
  const playing = playApi.on && has && playApi.nowPlaying === playId;
  return (
    <div className="relative w-1/2 flex items-center pr-3">
      <button onClick={() => {
          // Play mode: sound it — never open the picker
          if (playApi.on) { if (has) playApi.play(bar, playId); return; }
          onTap();
        }}
        className={`flex flex-wrap items-center gap-x-1.5 min-w-0 w-full min-h-[44px] text-left border-b ${selected ? "border-[var(--rule)]" : "border-transparent"} ${offKey ? "text-[var(--accent-text)]" : "text-foreground"}`}>
        {playing && <NowDot />}
        <FunctionMark fn={fn} />
        {has
          ? <span className={wavy ? "underline decoration-destructive decoration-wavy underline-offset-4" : ""} style={chordNameStyle(bar, playing)}>{bar}</span>
          : <span className="text-muted-foreground/50" style={chordNameStyle("—")}>—</span>}
        {has && <Numeral chord={bar} activeKey={activeKey} />}
      </button>
      {phraseAfter && (
        <button type="button" onClick={phraseAfter} aria-label="Phrase marker"
          className="absolute right-1 top-2 bottom-2 w-4 flex justify-center">
          <span className="block w-px h-full bg-[var(--ink)]" />
        </button>
      )}
    </div>
  );
}

