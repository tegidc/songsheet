import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "../../app/components/ui/drawer";
import { ChordChip } from "./ChordChip";
import { MONO } from "../../data/constants";
import type { ChordSuggestion } from "../../lib/theory/chords";
import { inKey } from "../../lib/theory/chords";

export function ChordPickerSheet({ open, title, value, suggestions, onClose, onSet, onClear, onDelete, onStep, canPrev, canNext }: {
  open: boolean; title: string; value: string;
  suggestions: { inKey: ChordSuggestion[]; used: ChordSuggestion[]; colour: ChordSuggestion[] };
  onClose: () => void;
  onSet: (chord: string, advance: boolean) => void;   // set current bar; advance to next when true
  onClear: () => void;
  onDelete: () => void;
  onStep: (dir: -1 | 1) => void;
  canPrev: boolean; canNext: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value, open]);

  const Group = ({ heading, items }: { heading: string; items: ChordSuggestion[] }) =>
    items.length ? (
      <div className="mb-4">
        <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground mb-2" style={{ fontFamily: MONO }}>{heading}</div>
        <div className="flex flex-wrap gap-2">
          {items.map(s => <ChordChip key={s.chord + s.label} chord={s.chord} label={s.label} onTap={() => onSet(s.chord, true)} />)}
        </div>
      </div>
    ) : null;

  return (
    <Drawer open={open} onOpenChange={o => !o && onClose()}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerTitle className="sr-only">{title}</DrawerTitle>
        <DrawerDescription className="sr-only">Choose a chord for this bar</DrawerDescription>
        <div className="overflow-y-auto px-4 pb-6 pt-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground" style={{ fontFamily: MONO }}>{title}</span>
            <div className="ml-auto flex items-center gap-1">
              <button onClick={() => onStep(-1)} disabled={!canPrev} title="Previous bar"
                className="p-1.5 rounded border border-border text-muted-foreground disabled:opacity-25 active:bg-muted transition-colors"><ChevronUp size={13} className="-rotate-90" /></button>
              <button onClick={() => onStep(1)} disabled={!canNext} title="Next bar"
                className="p-1.5 rounded border border-border text-muted-foreground disabled:opacity-25 active:bg-muted transition-colors"><ChevronUp size={13} className="rotate-90" /></button>
            </div>
          </div>

          {/* Keyboard input — free editing, always available */}
          <div className="flex items-center gap-2 mb-4">
            <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus placeholder="Type a chord…"
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onSet(draft.trim(), true); } }}
              className="flex-1 min-w-0 bg-transparent border border-border rounded-md px-3 py-2 text-[15px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/40"
              style={{ fontFamily: MONO }} />
            <button onClick={() => onSet(draft.trim(), true)}
              className="shrink-0 px-3 py-2 rounded-md border border-foreground/30 text-[13px] text-foreground bg-muted/40 active:bg-muted transition-colors"
              style={{ fontFamily: MONO }}>Set</button>
          </div>

          <Group heading="In key" items={suggestions.inKey} />
          <Group heading="Used so far" items={suggestions.used} />
          <Group heading="More colour" items={suggestions.colour} />

          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <button onClick={onClear}
              className="text-[12px] px-3 py-1.5 rounded-sm border border-border text-muted-foreground active:bg-muted transition-colors" style={{ fontFamily: MONO }}>Clear</button>
            <button onClick={onDelete}
              className="text-[12px] px-3 py-1.5 rounded-sm border border-border text-destructive active:bg-muted transition-colors" style={{ fontFamily: MONO }}>Delete bar</button>
            <button onClick={onClose}
              className="ml-auto text-[12px] px-4 py-1.5 rounded-sm border border-foreground/30 text-foreground bg-muted/40 active:bg-muted transition-colors" style={{ fontFamily: MONO }}>Done</button>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
