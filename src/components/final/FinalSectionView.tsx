import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Drawer, DrawerContent, DrawerTitle, DrawerDescription } from "../../app/components/ui/drawer";
import { FS, MONO, SCOL } from "../../data/constants";
import { uid } from "../../format";
import { resolveOverlaps, sortCP } from "../../lib/theory/layout";
import type { CP, Section } from "../../types";

export function FinalSectionView({ section, charWidth, onUpdate, isMobile }: {
  section: Section; charWidth: number; onUpdate: (p: Partial<Section>) => void; isMobile?: boolean;
}) {
  const [selId, setSelId]       = useState<string | null>(null);
  const [editId, setEditId]     = useState<string | null>(null);
  const [addAt, setAddAt]       = useState<{ li: number; ci: number } | null>(null);
  const [addVal, setAddVal]     = useState("");
  const [editLine, setEditLine] = useState<number | null>(null);
  // Mobile: sheet open for placing a chord
  const [mobileSheet, setMobileSheet] = useState<{ li: number; ci: number } | null>(null);
  const [mobileSheetVal, setMobileSheetVal] = useState("");

  const lines      = (section.lyrics ?? "").split("\n");
  const cps        = section.chordPositions ?? [];
  const lineChords = (li: number) => sortCP(cps.filter(cp => cp.lineIdx === li));

  // Helper: compute destination charIdx when moving a chord to a different line.
  // Always appends after existing chords on the dest line; preserves charIdx when dest is empty.
  const destCharIdx = (sel: CP, newLineIdx: number) => {
    if (newLineIdx === sel.lineIdx) return sel.charIdx;
    const destChords = cps.filter(cp => cp.id !== sel.id && cp.lineIdx === newLineIdx);
    if (destChords.length === 0) return sel.charIdx;
    return Math.max(...destChords.map(c => c.charIdx + c.chord.length + 1));
  };

  // Desktop keyboard handler
  useEffect(() => {
    if (isMobile) return;
    if (selId === null || editId !== null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const dir = e.key === "ArrowLeft" ? -1 : 1;
        const step = e.shiftKey ? 4 : 1;
        const moved = cps.map(cp =>
          cp.id === selId ? { ...cp, charIdx: Math.max(0, cp.charIdx + dir * step) } : cp);
        const resolved = resolveOverlaps(moved);
        // ← only update positions; chordBars sequence is owned by the Chords tab
        onUpdate({ chordPositions: resolved });
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const dir = e.key === "ArrowDown" ? 1 : -1;
        const sel = cps.find(cp => cp.id === selId);
        if (!sel) return;
        const newLineIdx = Math.max(0, Math.min(lines.length - 1, sel.lineIdx + dir));
        if (newLineIdx === sel.lineIdx) return; // already at boundary
        const moved = cps.map(cp =>
          cp.id === selId
            ? { ...cp, lineIdx: newLineIdx, charIdx: destCharIdx(sel, newLineIdx) }
            : cp);
        const resolved = resolveOverlaps(moved);
        onUpdate({ chordPositions: resolved });
      }
      if ((e.key === "Delete" || e.key === "Backspace") && editLine === null) {
        const np = cps.filter(cp => cp.id !== selId);
        onUpdate({ chordPositions: np });
        setSelId(null);
      }
      if (e.key === "Escape") setSelId(null);
      if ((e.key === "Enter" || e.key === "F2") && editLine === null) { e.preventDefault(); setEditId(selId); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [selId, editId, editLine, cps, lines.length, onUpdate, isMobile]);

  const handleRowClick = (e: React.MouseEvent<HTMLDivElement>, li: number) => {
    if (editId !== null) return;
    if (isMobile) return; // mobile uses tap handler below
    const rect = e.currentTarget.getBoundingClientRect();
    const ci = Math.max(0, Math.round((e.clientX - rect.left) / charWidth));
    setAddAt({ li, ci }); setAddVal("");
  };

  // Mobile: tap chord row to open sheet at approximate char position
  const handleRowTap = (e: React.TouchEvent<HTMLDivElement>, li: number) => {
    if (selId !== null) { setSelId(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.changedTouches[0];
    const ci = Math.max(0, Math.round((touch.clientX - rect.left) / charWidth));
    setMobileSheet({ li, ci });
    setMobileSheetVal("");
  };

  const commitAdd = () => {
    if (!addAt || !addVal.trim()) { setAddAt(null); return; }
    const raw = sortCP([...cps, { id: uid(), lineIdx: addAt.li, charIdx: addAt.ci, chord: addVal.trim() }]);
    const resolved = resolveOverlaps(raw);
    onUpdate({ chordPositions: resolved, chordBars: resolved.map(p => p.chord) });
    setAddAt(null); setAddVal("");
  };

  const commitMobileAdd = () => {
    if (!mobileSheet || !mobileSheetVal.trim()) { setMobileSheet(null); return; }
    const raw = sortCP([...cps, { id: uid(), lineIdx: mobileSheet.li, charIdx: mobileSheet.ci, chord: mobileSheetVal.trim() }]);
    const resolved = resolveOverlaps(raw);
    onUpdate({ chordPositions: resolved, chordBars: resolved.map(p => p.chord) });
    setMobileSheet(null); setMobileSheetVal("");
  };

  const updateChordVal = (id: string, chord: string) => {
    const np = cps.map(cp => cp.id === id ? { ...cp, chord } : cp);
    onUpdate({ chordPositions: np });
  };

  const updateLine = (li: number, val: string) => {
    const ls = [...lines]; ls[li] = val;
    onUpdate({ lyrics: ls.join("\n") });
  };

  // Mobile chord move helpers
  const moveSelChord = (dir: "left" | "right" | "up" | "down") => {
    if (!selId) return;
    if (dir === "left" || dir === "right") {
      const d = dir === "left" ? -1 : 1;
      const moved = cps.map(cp => cp.id === selId ? { ...cp, charIdx: Math.max(0, cp.charIdx + d) } : cp);
      const resolved = resolveOverlaps(moved);
      onUpdate({ chordPositions: resolved });
    } else {
      const d = dir === "down" ? 1 : -1;
      const sel = cps.find(cp => cp.id === selId);
      if (!sel) return;
      const newLineIdx = Math.max(0, Math.min(lines.length - 1, sel.lineIdx + d));
      if (newLineIdx === sel.lineIdx) return; // already at boundary
      const moved = cps.map(cp => cp.id === selId ? { ...cp, lineIdx: newLineIdx, charIdx: destCharIdx(sel, newLineIdx) } : cp);
      const resolved = resolveOverlaps(moved);
      onUpdate({ chordPositions: resolved });
    }
  };

  const deleteSelChord = () => {
    if (!selId) return;
    const np = cps.filter(cp => cp.id !== selId);
    onUpdate({ chordPositions: np });
    setSelId(null);
  };

  const selChord = selId ? cps.find(cp => cp.id === selId) : null;

  return (
    <div className="mb-8">
      <div className={`${SCOL[section.type]} inline-block text-xs px-2 py-0.5 rounded-sm mb-3 border border-border`}
        style={{ fontFamily: MONO }}>{section.label}</div>

      {/* Mobile: selected chord mini-toolbar */}
      {isMobile && selChord && (
        <div className="flex items-center gap-1 mb-2 px-1 py-1.5 bg-muted/40 rounded-sm border border-border/60">
          <span className="text-xs text-accent font-medium px-2 py-0.5 bg-accent/10 rounded-sm shrink-0" style={{ fontFamily: MONO }}>{selChord.chord}</span>
          <div className="flex items-center gap-0.5 ml-1">
            <button onClick={() => moveSelChord("left")}
              className="w-7 h-7 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>←</button>
            <button onClick={() => moveSelChord("right")}
              className="w-7 h-7 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>→</button>
            <button onClick={() => moveSelChord("up")}
              className="w-7 h-7 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>↑</button>
            <button onClick={() => moveSelChord("down")}
              className="w-7 h-7 flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted/80 transition-colors text-[11px]"
              style={{ fontFamily: MONO }}>↓</button>
          </div>
          <button onClick={() => setEditId(selId)}
            className="text-[11px] px-2 py-0.5 border border-border rounded-sm text-muted-foreground hover:text-foreground ml-1 transition-colors"
            style={{ fontFamily: MONO }}>edit</button>
          <button onClick={deleteSelChord}
            className="w-7 h-7 flex items-center justify-center rounded-sm text-muted-foreground hover:text-destructive transition-colors ml-auto">
            <X size={12} />
          </button>
          <button onClick={() => setSelId(null)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors px-1">done</button>
        </div>
      )}

      <div style={{ fontFamily: MONO, fontSize: FS }}>
        {lines.map((line, li) => {
          // Mobile forces the lyric-line input to 16px (theme.css's zoom-prevention
          // floor) while this chord row still positions with `ch` units at the
          // ambient 12px (FS). Matching the row's font-size to the input's while
          // that line is being edited keeps chord-over-letter alignment true —
          // otherwise the two disagree on how wide a `ch` is and chords drift.
          const chordFS = isMobile && editLine === li ? 16 : FS;
          return (
          <div key={li} className="mb-2">
            <div
              className={`relative select-none ${isMobile ? "cursor-default" : "cursor-crosshair"}`}
              style={{ height: 22 }}
              onClick={isMobile ? undefined : e => handleRowClick(e, li)}
              onTouchEnd={isMobile ? e => handleRowTap(e, li) : undefined}>
              {lineChords(li).map(cp => (
                <span key={cp.id}
                  style={{ position: "absolute", left: `${cp.charIdx}ch`, fontFamily: MONO, fontSize: chordFS, top: -2, whiteSpace: "nowrap" }}
                  className={`cursor-pointer transition-colors px-1 py-1 rounded-sm ${selId === cp.id ? "text-foreground bg-accent/20" : "text-accent hover:bg-accent/10"}`}
                  onClick={e => { e.stopPropagation(); setSelId(cp.id); setEditId(null); }}
                  onDoubleClick={isMobile ? undefined : e => { e.stopPropagation(); setSelId(cp.id); setEditId(cp.id); }}>
                  {editId === cp.id ? (
                    <input value={cp.chord} onChange={e => updateChordVal(cp.id, e.target.value)}
                      onBlur={() => setEditId(null)}
                      onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") setEditId(null); }}
                      autoFocus
                      className="bg-transparent focus:outline-none border-b border-accent text-foreground"
                      style={{ width: `${Math.max(cp.chord.length + 1, 3)}ch`, fontFamily: MONO, fontSize: chordFS }} />
                  ) : cp.chord}
                </span>
              ))}
              {!isMobile && addAt?.li === li && (
                <input value={addVal} onChange={e => setAddVal(e.target.value)}
                  onBlur={commitAdd} onKeyDown={e => { if (e.key === "Enter") commitAdd(); if (e.key === "Escape") setAddAt(null); }}
                  autoFocus placeholder="chord"
                  className="absolute bg-background border border-accent/60 rounded-sm px-1 focus:outline-none text-foreground placeholder:text-muted-foreground/40"
                  style={{ left: `${addAt.ci}ch`, top: 0, width: "5ch", fontFamily: MONO, fontSize: FS, height: 20 }} />
              )}
            </div>
            {editLine === li ? (
              <input value={line} onChange={e => updateLine(li, e.target.value)}
                onBlur={() => setEditLine(null)} onKeyDown={e => { if (e.key === "Escape") setEditLine(null); }}
                autoFocus className="bg-transparent focus:outline-none border-b border-border text-foreground w-full"
                style={{ fontFamily: MONO, fontSize: FS, lineHeight: 1.6 }} />
            ) : (
              <div onClick={() => setEditLine(li)} className="cursor-text text-foreground"
                style={{ fontFamily: MONO, fontSize: FS, lineHeight: 1.6, whiteSpace: "pre", minHeight: "1.6em" }}>
                {line || " "}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Mobile: chord placement drawer */}
      {isMobile && (
        <Drawer open={mobileSheet !== null} onOpenChange={open => { if (!open) setMobileSheet(null); }}>
          <DrawerContent>
            <DrawerTitle className="sr-only">Place chord</DrawerTitle>
            <DrawerDescription className="sr-only">Type a chord to place on this lyric line</DrawerDescription>
            <div className="px-5 pt-4 pb-8">
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground mb-3" style={{ fontFamily: MONO }}>
                Place chord — line {mobileSheet ? mobileSheet.li + 1 : ""}
              </p>
              <div className="flex gap-2">
                <input
                  value={mobileSheetVal}
                  onChange={e => setMobileSheetVal(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") commitMobileAdd(); if (e.key === "Escape") setMobileSheet(null); }}
                  autoFocus
                  placeholder="e.g. Am7"
                  className="flex-1 bg-transparent border-b border-border text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-accent pb-1 transition-colors"
                  style={{ fontFamily: MONO }}
                />
                <button
                  onClick={commitMobileAdd}
                  disabled={!mobileSheetVal.trim()}
                  className="text-[12px] px-3 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                  style={{ fontFamily: MONO }}>
                  Place
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground/40 mt-2" style={{ fontFamily: MONO }}>
                tap a chord after placing to select · use toolbar to move or delete
              </p>
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

