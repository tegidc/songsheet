import { useState } from "react";
import { Plus, Trash2, Copy, ChevronDown, ChevronUp, Repeat2, ClipboardPaste } from "lucide-react";
import { ChordPickerSheet } from "./ChordPickerSheet";
import { MONO, PHRASE_MARKER, ROW_BREAK, SCOL, isEditorialBar } from "../../data/constants";
import type { ChordSuggestion } from "../../lib/theory/chords";
import { inKey } from "../../lib/theory/chords";
import type { Section, Tab } from "../../types";

export function MobileChordSection({ section, idx, total, onBarsChange, onShortLabelChange,
  onDuplicate, onDelete, onMove, onToggleNaming, namingStyle, detected, warnFirst,
  onCopyBars, onPasteBars, onRepeatBars, suggestions }: {
  section: Section; idx: number; total: number;
  onBarsChange: (b: string[]) => void; onShortLabelChange: (v: string) => void;
  onDuplicate: () => void; onDelete: () => void; onMove: (dir: -1|1) => void;
  onToggleNaming: () => void; namingStyle: "number" | "letter";
  detected: { key: string; mode: "major"|"minor" } | null; warnFirst: boolean;
  onCopyBars: () => void; onPasteBars: (() => void) | null; onRepeatBars: () => void;
  suggestions: { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] };
}) {
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

  const actionBtn = "flex items-center gap-1 text-[11px] text-muted-foreground active:text-foreground transition-colors";

  return (
    <div className="border-b border-border/60 last:border-b-0">
      {/* Section header (sits above the bars) */}
      <div className={`${SCOL[section.type]} flex items-center gap-2 px-3 py-2`}>
        <input value={section.shortLabel} onChange={e => onShortLabelChange(e.target.value)}
          className="bg-transparent text-[11px] uppercase tracking-[0.12em] text-foreground/80 focus:outline-none flex-1 min-w-0 truncate"
          style={{ fontFamily: MONO }} />
        <button onClick={() => setShowActions(v => !v)}
          className="shrink-0 text-muted-foreground active:text-foreground transition-colors px-1.5 py-0.5 text-[13px] leading-none tracking-wide"
          style={{ fontFamily: MONO }} title="Section actions">⋯</button>
      </div>

      {/* Collapsible action row */}
      {showActions && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-muted/30 border-t border-border/50" style={{ fontFamily: MONO }}>
          <button onClick={() => onMove(-1)} disabled={idx === 0} className={`${actionBtn} disabled:opacity-25`}><ChevronUp size={12} />Up</button>
          <button onClick={() => onMove(1)} disabled={idx === total - 1} className={`${actionBtn} disabled:opacity-25`}><ChevronDown size={12} />Down</button>
          <button onClick={onDuplicate} className={actionBtn}><Copy size={12} />Duplicate</button>
          <button onClick={onCopyBars} className={actionBtn}><span className="text-[10px]">cc</span>Copy</button>
          {onPasteBars && <button onClick={onPasteBars} className={`${actionBtn} text-accent`}><ClipboardPaste size={12} />Paste</button>}
          <button onClick={onRepeatBars} className={actionBtn}><Repeat2 size={12} />Repeat</button>
          <button onClick={onToggleNaming} className={actionBtn}><span className="text-[11px]">{namingStyle === "number" ? "#" : "A"}</span>{namingStyle === "number" ? "1/2" : "A/B"}</button>
          <button onClick={onDelete} className={`${actionBtn} active:text-destructive`}><Trash2 size={12} />Delete</button>
        </div>
      )}

      {/* Bars — tap to edit */}
      <div className="px-3 py-3 flex flex-col gap-2">
        {visualRows.map((row, ri) => (
          <div key={ri} className="flex flex-wrap items-center gap-2">
            {row.map(({ bar, idx: barIdx }) =>
              bar === PHRASE_MARKER ? (
                <button key={barIdx} onClick={() => setBar(barIdx, "")} title="Phrase marker — tap to remove"
                  className="text-muted-foreground/40 active:text-muted-foreground px-1" style={{ fontFamily: MONO, fontSize: 16 }}>│</button>
              ) : (
                <button key={barIdx} onClick={() => setSel(barIdx)}
                  className={[
                    "min-w-[56px] h-11 px-2 rounded-md border flex items-center justify-center transition-colors",
                    sel === barIdx ? "border-foreground/50 bg-muted/50" : "border-border active:bg-muted/40",
                    detected && bar.trim() && !inKey(bar, detected.key, detected.mode) ? "text-amber-700" : "text-foreground",
                    warnFirst && barIdx === 0 && bar.trim() ? "underline decoration-red-400 decoration-wavy" : "",
                  ].join(" ")}
                  style={{ fontFamily: MONO, fontSize: 14 }}>
                  {bar.trim() || <Plus size={13} className="text-muted-foreground/50" />}
                </button>
              )
            )}
            {ri === visualRows.length - 1 && (
              <button onClick={addBar} title="Add bar"
                className="w-9 h-11 rounded-md border border-dashed border-border text-muted-foreground active:border-foreground active:text-foreground transition-colors flex items-center justify-center">
                <Plus size={14} />
              </button>
            )}
          </div>
        ))}
      </div>

      <ChordPickerSheet
        open={sel !== null && isReal(sel)}
        title={`${section.shortLabel || section.label} · bar ${sel !== null ? bars.slice(0, sel + 1).filter(b => !isEditorialBar(b)).length : ""}`}
        value={sel !== null ? bars[sel] ?? "" : ""}
        suggestions={suggestions}
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
        canPrev={sel !== null && prevReal(sel) !== -1}
        canNext={sel !== null} />
    </div>
  );
}

