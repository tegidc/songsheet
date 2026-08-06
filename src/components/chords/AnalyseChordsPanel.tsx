import { useState } from "react";
import { X } from "lucide-react";
import { CH, CW, MONO, PHRASE_MARKER, ROW_BREAK, SERIF, isEditorialBar } from "../../data/constants";
import { getDiatonic } from "../../lib/theory/chords";
import type { IdeaResult } from "../../lib/theory/ideas";
import { formatDetectedKey } from "../../lib/theory/key";
import { getParallelChords } from "../../lib/theory/substitutions";
import type { Section, Song } from "../../types";

export function AnalyseChordsPanel({ song, detected, idea, ideaUndo, onReroll, onApply, onUndo,
  bridge, bridgeUndo, onBridgeGenerate, onBridgeApply, onBridgeUndo, onClose, onSetKey }: {
  song: Song;
  detected: { key: string; mode: "major"|"minor" } | null;
  idea: IdeaResult | null;
  ideaUndo: { newSectionId: string } | null;
  onReroll: (sectionId?: string) => void;
  onApply: (sectionId: string, bars: string[]) => void;
  onUndo: () => void;
  bridge: IdeaResult | null;
  bridgeUndo: { sectionId: string; bars: string[] } | null;
  onBridgeGenerate: () => void;
  onBridgeApply: (sectionId: string, bars: string[]) => void;
  onBridgeUndo: () => void;
  onClose: () => void;
  onSetKey: () => void;
}) {
  const [ideasOpen, setIdeasOpen] = useState(false);
  const [bridgeOpen, setBridgeOpen] = useState(false);

  const sectionsWithChords = song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim() && !isEditorialBar(b)));
  const [selectedSectionId, setSelectedSectionId] = useState<string>(() => sectionsWithChords[0]?.id ?? "");
  const effectiveSectionId = sectionsWithChords.find(s => s.id === selectedSectionId)?.id ?? sectionsWithChords[0]?.id ?? "";

  const handleIdeasToggle = () => {
    if (!ideasOpen && !idea) onReroll(effectiveSectionId);
    setIdeasOpen(o => !o);
    if (bridgeOpen) setBridgeOpen(false);
  };

  const handleBridgeToggle = () => {
    if (!bridgeOpen && !bridge) onBridgeGenerate();
    setBridgeOpen(o => !o);
    if (ideasOpen) setIdeasOpen(false);
  };

  const diatonicChords = detected
    ? getDiatonic(detected.key, detected.mode).map(d =>
        `${d.root}${d.q === "maj" ? "" : d.q === "min" ? "m" : "°"}`)
    : [];
  const parallelChords = detected ? getParallelChords(detected.key, detected.mode) : [];
  const noChords = !song.sections.some(s => (s.chordBars ?? []).some(b => b.trim()));

  const ChordPill = ({ chord, dim }: { chord: string; dim?: boolean }) => (
    <span
      className={`inline-block text-[11px] px-2 py-0.5 border border-border/30 rounded-sm bg-muted/15 ${dim ? "text-muted-foreground/45" : "text-foreground/65"}`}
      style={{ fontFamily: MONO }}>
      {chord}
    </span>
  );

  return (
    <div className="mb-5 border border-border rounded-sm overflow-hidden bg-card">
      {/* Segment header */}
      <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Analyse Chords
        </span>
        <button onClick={onClose} className="ml-auto text-muted-foreground/50 hover:text-foreground transition-colors">
          <X size={13} />
        </button>
      </div>

      <div className="px-4 py-3">
        {!detected ? (
          <p className="text-[12px] text-muted-foreground/40 italic py-1" style={{ fontFamily: SERIF }}>
            Fill in more bars to detect a key.
          </p>
        ) : (
          <>
            {/* Key name */}
            <div className="flex items-baseline gap-2.5 mb-4">
              <span className="text-[22px] font-medium leading-none text-foreground" style={{ fontFamily: SERIF }}>
                {formatDetectedKey(detected.key, detected.mode)}
              </span>
              <span className="text-[10px] text-muted-foreground/45 uppercase tracking-widest" style={{ fontFamily: MONO }}>
                {detected.mode}
              </span>
            </div>

            {/* Common chords */}
            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/45 mb-1.5" style={{ fontFamily: MONO }}>
                Common
              </div>
              <div className="flex flex-wrap gap-1">
                {diatonicChords.map((ch, i) => <ChordPill key={i} chord={ch} />)}
              </div>
            </div>

            {/* Parallel chords */}
            <div className="mb-3">
              <div className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/45 mb-1.5" style={{ fontFamily: MONO }}>
                Parallel · {detected.mode === "major" ? `${detected.key}m` : detected.key}
              </div>
              <div className="flex flex-wrap gap-1">
                {parallelChords.map((ch, i) => <ChordPill key={i} chord={ch} dim />)}
              </div>
            </div>

            <div className="mb-4" />

            {/* Footer actions */}
            <div className="flex items-center gap-2">
              <button onClick={onSetKey}
                className="text-[10px] text-muted-foreground/55 hover:text-foreground transition-colors border border-border/40 rounded-sm px-2.5 py-1"
                style={{ fontFamily: MONO }}>
                Set {formatDetectedKey(detected.key, detected.mode)} as key
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={handleBridgeToggle}
                  className={`text-[10px] px-3 py-1 border rounded-sm transition-colors ${
                    bridgeOpen
                      ? "border-foreground/30 text-foreground bg-muted/40"
                      : "border-border/50 text-muted-foreground/70 hover:text-foreground hover:border-foreground/20"
                  }`}
                  style={{ fontFamily: MONO }}>
                  Bridge {bridgeOpen ? "▴" : "▾"}
                </button>
                <button
                  onClick={handleIdeasToggle}
                  className={`text-[10px] px-3 py-1 border rounded-sm transition-colors ${
                    ideasOpen
                      ? "border-foreground/30 text-foreground bg-muted/40"
                      : "border-border/50 text-muted-foreground/70 hover:text-foreground hover:border-foreground/20"
                  }`}
                  style={{ fontFamily: MONO }}>
                  Ideas {ideasOpen ? "▴" : "▾"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Ideas — inline expansion */}
      {ideasOpen && (
        <div className="border-t border-border/50">
          {/* Ideas sub-header */}
          <div className="px-4 py-2 bg-muted/15 flex items-center gap-2 flex-wrap">
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60" style={{ fontFamily: MONO }}>
              Wildcard
            </span>
            {/* Section selector — only when there are multiple sections */}
            {sectionsWithChords.length > 1 && (
              <select
                value={effectiveSectionId}
                onChange={e => { setSelectedSectionId(e.target.value); onReroll(e.target.value); }}
                className="text-[9px] bg-transparent border border-border/40 rounded-sm px-1.5 py-0.5 text-muted-foreground/70 focus:outline-none cursor-pointer hover:border-foreground/30 transition-colors"
                style={{ fontFamily: MONO }}>
                {sectionsWithChords.map(s => (
                  <option key={s.id} value={s.id}>{s.shortLabel || s.label}</option>
                ))}
              </select>
            )}
            {idea && (
              <span className="text-[9px] px-1.5 py-0.5 border border-border/40 rounded-sm text-muted-foreground/50 bg-background"
                style={{ fontFamily: MONO }}>{idea.technique}</span>
            )}
            <button onClick={() => onReroll(effectiveSectionId)}
              className="ml-auto text-[15px] text-foreground/55 hover:text-foreground transition-colors leading-none px-1.5 py-0.5 border border-border/40 rounded-sm hover:border-foreground/30"
              style={{ fontFamily: MONO }} title="Roll another idea">↻</button>
          </div>

          <div className="px-4 py-3">
            {noChords ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                Add chords to a section first.
              </p>
            ) : !idea ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                Press ↻ to roll a wildcard idea.
              </p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground/60 italic mb-3 leading-relaxed" style={{ fontFamily: SERIF }}>
                  {idea.description}
                </p>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40" style={{ fontFamily: MONO }}>
                    {idea.sectionLabel}
                  </span>
                  <div className="flex items-center gap-3">
                    {ideaUndo && (
                      <button onClick={onUndo}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
                        style={{ fontFamily: MONO }}>
                        ← Undo
                      </button>
                    )}
                    <button onClick={() => onApply(idea.sectionId, idea.bars)}
                      className="text-[10px] text-accent hover:text-foreground transition-colors"
                      style={{ fontFamily: MONO }}>
                      Add section →
                    </button>
                  </div>
                </div>

                {/* Bar grid — respects ROW_BREAK rows to match section formatting */}
                <div className="rounded-sm border border-border/40 overflow-hidden"
                  style={{
                    backgroundImage: `radial-gradient(circle, rgba(28,24,20,0.11) 1px, transparent 1px)`,
                    backgroundSize: `${CW}px ${CH}px`,
                  }}>
                  {(() => {
                    const rows: string[][] = [[]];
                    idea.bars.forEach(b => {
                      if (b === ROW_BREAK) rows.push([]);
                      else rows[rows.length - 1].push(b);
                    });
                    return rows.map((row, ri) => (
                      <div key={ri} className={`flex overflow-x-auto${ri > 0 ? " border-t border-border/[0.07]" : ""}`}
                        style={{ scrollbarWidth: "none" }}>
                        {row.map((bar, bi) => (
                          <div key={bi}
                            className={`shrink-0 flex items-center justify-center text-[12px] border-r border-border/20 last:border-r-0 ${bar === PHRASE_MARKER ? "text-muted-foreground/30" : "text-foreground/70"}`}
                            style={{ width: bar === PHRASE_MARKER ? 22 : CW, height: CH, fontFamily: MONO }}>
                            {bar === PHRASE_MARKER ? "│" : bar.trim()}
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bridge — inline expansion */}
      {bridgeOpen && (
        <div className="border-t border-border/50">
          {/* Bridge sub-header */}
          <div className="px-4 py-2 bg-muted/15 flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60" style={{ fontFamily: MONO }}>
              Bridge
            </span>
            {bridge && (
              <span className="text-[9px] px-1.5 py-0.5 border border-border/40 rounded-sm text-muted-foreground/50 bg-background"
                style={{ fontFamily: MONO }}>{bridge.technique}</span>
            )}
            <button onClick={onBridgeGenerate}
              className="ml-auto text-[12px] text-muted-foreground/40 hover:text-foreground transition-colors leading-none"
              style={{ fontFamily: MONO }} title="Regenerate bridge idea">↻</button>
          </div>

          <div className="px-4 py-3">
            {noChords ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                Add chords to other sections first.
              </p>
            ) : !bridge ? (
              <p className="text-[12px] text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>…</p>
            ) : (
              <>
                <p className="text-[12px] text-muted-foreground/60 italic mb-3 leading-relaxed" style={{ fontFamily: SERIF }}>
                  {bridge.description}
                </p>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/40" style={{ fontFamily: MONO }}>
                    → {bridge.sectionLabel}
                  </span>
                  <div className="flex items-center gap-3">
                    {bridgeUndo && (
                      <button onClick={onBridgeUndo}
                        className="text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
                        style={{ fontFamily: MONO }}>
                        ← Undo
                      </button>
                    )}
                    <button onClick={() => onBridgeApply(bridge.sectionId, bridge.bars)}
                      className="text-[10px] text-accent hover:text-foreground transition-colors"
                      style={{ fontFamily: MONO }}>
                      Apply →
                    </button>
                  </div>
                </div>

                {/* Bar grid */}
                <div className="flex overflow-x-auto rounded-sm border border-border/40"
                  style={{
                    backgroundImage: `radial-gradient(circle, rgba(28,24,20,0.11) 1px, transparent 1px)`,
                    backgroundSize: `${CW}px ${CH}px`,
                    scrollbarWidth: "none",
                  }}>
                  {bridge.bars.filter(b => b !== ROW_BREAK).map((bar, i) => (
                    <div key={i}
                      className={`shrink-0 flex items-center justify-center text-[12px] border-r border-border/20 last:border-r-0 ${bar === PHRASE_MARKER ? "text-muted-foreground/30" : "text-foreground/70"}`}
                      style={{ width: bar === PHRASE_MARKER ? 22 : CW, height: CH, fontFamily: MONO }}>
                      {bar === PHRASE_MARKER ? "│" : bar.trim()}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

