import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "../../app/components/ui/drawer";
import type { ChordRow, ChordSuggestionSets } from "../../lib/theory/chords";
import { ChordSelectorPanel, type Key } from "./swiss";

/**
 * The phone's chord selector: a drawer opened by tapping a bar. Behaviour is
 * unchanged — type a chord or tap one, Set advances to the next bar, ‹ › step,
 * Clear / Delete bar / Done — and it now wears the selector's inverted panel.
 */
export function ChordPickerSheet({ open, title, value, suggestions, chordRow, onCycleChordRow, onClose, onSet, onClear, onDelete, onStep, canPrev, canNext, onRemoveFretboardChord, activeKey }: {
  open: boolean; title: string; value: string;
  suggestions: ChordSuggestionSets;
  chordRow: ChordRow; onCycleChordRow: () => void;
  /** Prune the song's fretboard log. Only the From Fretboard row offers it. */
  onRemoveFretboardChord?: (name: string) => void;
  onClose: () => void;
  onSet: (chord: string, advance: boolean) => void;   // set current bar; advance to next when true
  onClear: () => void;
  onDelete: () => void;
  onStep: (dir: -1 | 1) => void;
  canPrev: boolean; canNext: boolean;
  activeKey: Key;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value, open]);

  const btn = "text-[13px] lowercase px-3 min-h-10 border border-[var(--panel-rule)] text-[var(--panel-ink)] active:bg-[color-mix(in_srgb,var(--panel-ink)_10%,transparent)] transition-colors";
  const radius = { borderRadius: "var(--radius-selector)" };

  return (
    <Drawer open={open} onOpenChange={o => !o && onClose()}>
      <DrawerContent className="max-h-[85vh] bg-[var(--panel)] text-[var(--panel-ink)] border-[var(--panel-rule)]">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">Choose a chord for this bar</DrawerDescription>
        <div className="overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]" style={{ fontFamily: "var(--font-label)" }}>
          <div className="flex items-center gap-2 px-5 pt-1 pb-3">
            <span className="text-[12px] lowercase text-[var(--panel-muted)]">{title}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => onStep(-1)} disabled={!canPrev} title="Previous bar" aria-label="Previous bar"
                className={`${btn} px-2 disabled:opacity-25`} style={radius}><ChevronUp size={14} className="-rotate-90" /></button>
              <button onClick={() => onStep(1)} disabled={!canNext} title="Next bar" aria-label="Next bar"
                className={`${btn} px-2 disabled:opacity-25`} style={radius}><ChevronUp size={14} className="rotate-90" /></button>
            </div>
          </div>

          {/* Keyboard input — free editing, always available */}
          <div className="flex items-center gap-2 px-5 pb-1">
            <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus data-large-type placeholder="Type a chord…"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onSet(draft.trim(), true); } }}
              className="flex-1 min-w-0 bg-transparent border-b border-[var(--panel-rule)] focus:border-[var(--panel-ink)] px-0 py-2 text-[var(--panel-ink)] placeholder:text-[var(--panel-muted)] focus:outline-none"
              style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, letterSpacing: "var(--chord-tracking)" }} />
            <button onClick={() => onSet(draft.trim(), true)} className={btn} style={radius}>set</button>
          </div>

          <ChordSelectorPanel suggestions={suggestions} chordRow={chordRow} onCycleChordRow={onCycleChordRow}
            onPick={c => onSet(c, true)} activeKey={activeKey} onRemoveFretboardChord={onRemoveFretboardChord} />

          <div className="flex items-center gap-2 px-5 pt-3 border-t border-[var(--panel-rule)]">
            <button onClick={onClear} className={btn} style={radius}>clear</button>
            <button onClick={onDelete} className={btn} style={radius}>delete bar</button>
            <button onClick={onClose} className={`${btn} ml-auto font-bold`} style={radius}>done</button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
