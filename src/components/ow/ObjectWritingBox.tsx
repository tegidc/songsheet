import { useState } from "react";
import { X, Minus } from "lucide-react";
import { AutoTA } from "../common/AutoTA";
import { MONO, SERIF } from "../../data/constants";
import { SENSES } from "../../data/senses";
import { pickOWWord } from "../../lib/text/owPool";
import { extractDetailWord, getDrillWords, scanText } from "../../lib/text/senses";
import type { OWEntry, Section } from "../../types";

export function ObjectWritingBox({ entry, onChange, onMinimize, onDrillDown, onSaveToNotebook, allSongText, isMobile }: {
  entry: OWEntry; onChange: (text: string, seedWord?: string) => void;
  onMinimize: () => void; onDrillDown: (word: string) => void;
  onSaveToNotebook?: (title: string, text: string) => void;
  allSongText: string; isMobile?: boolean;
}) {
  const [scanResult, setScanResult] = useState<ReturnType<typeof scanText> | null>(null);
  const [hoverSense, setHoverSense] = useState<{ label: string; examples: string[] } | null>(null);
  const [detailMsg, setDetailMsg]   = useState("");

  const handleChange = (v: string) => { onChange(v, entry.seedWord); setScanResult(null); };
  const handleObject = () => { onChange(entry.text, pickOWWord()); };
  const handleDetail = () => {
    const w = extractDetailWord(allSongText);
    if (w) { onChange(entry.text, w); setDetailMsg(""); }
    else setDetailMsg("Write more first.");
  };
  const triggerSave = () => {
    if (!entry.text.trim() || !onSaveToNotebook) return;
    onSaveToNotebook(entry.seedWord ?? "Object Writing", entry.text);
  };

  const counts = scanResult ? SENSES.map((_, i) => scanResult.filter(t => t.senseIdx === i).length) : null;
  const drillWords = scanResult ? getDrillWords(scanResult) : [];

  const handleSenseHover = (sense: typeof SENSES[0]) => {
    const pool = [...sense.words];
    const picks: string[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(j, 1)[0]);
    }
    setHoverSense({ label: sense.label, examples: picks });
  };

  return (
    <div className="px-4 pt-3 pb-4">
      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <button onClick={handleDetail} title="Word from your own writing"
          className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
          style={{ fontFamily: MONO }}>Detail</button>
        <button onClick={handleObject} title="Random object"
          className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
          style={{ fontFamily: MONO }}>Object</button>
        {entry.text.trim() && onSaveToNotebook && (
          <button onClick={triggerSave}
            className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
            style={{ fontFamily: MONO }}>
            Save to Notebook
          </button>
        )}
        <input
          value={entry.seedWord ?? ""}
          onChange={e => onChange(entry.text, e.target.value || undefined)}
          placeholder="focus word…"
          className="flex-1 min-w-[80px] bg-transparent border-b border-border/60 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent pb-0.5 transition-colors"
          style={{ fontFamily: SERIF, fontStyle: entry.seedWord ? "italic" : "normal" }}
        />
        <button onClick={onMinimize} title="Minimise" className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0">
          <Minus size={12} />
        </button>
      </div>

      {detailMsg && <p className="text-[12px] text-muted-foreground mb-3" style={{ fontFamily: MONO }}>{detailMsg}</p>}

      {/* Sense badges */}
      <div className="flex flex-wrap gap-1.5 mb-4 relative">
        {SENSES.map(s => (
          <span key={s.label}
            className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full cursor-default relative select-none`}
            style={{ fontFamily: MONO }}
            onMouseEnter={isMobile ? undefined : () => handleSenseHover(s)}
            onMouseLeave={isMobile ? undefined : () => setHoverSense(null)}
            onClick={isMobile ? () => setHoverSense(h => h?.label === s.label ? null : { label: s.label, examples: (() => { const pool = [...s.words]; const picks: string[] = []; for (let i = 0; i < 3 && pool.length; i++) { const j = Math.floor(Math.random() * pool.length); picks.push(pool.splice(j,1)[0]); } return picks; })() }) : undefined}>
            {s.label}
            {hoverSense?.label === s.label && (
              <span className="absolute bottom-full left-0 mb-1.5 whitespace-nowrap bg-foreground text-background text-[10px] px-2 py-1 rounded-sm z-10 pointer-events-none"
                style={{ fontFamily: MONO }}>
                {hoverSense.examples.join(" · ")}
              </span>
            )}
          </span>
        ))}
      </div>

      <AutoTA value={entry.text} onChange={handleChange}
        placeholder="Write freely. No editing, no judgement. Anchor to the senses above…"
        serif rows={8} />

      {entry.text.trim() && !scanResult && (
        <button onClick={() => setScanResult(scanText(entry.text))}
          className="mt-3 text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          style={{ fontFamily: MONO }}>
          Scan for senses
        </button>
      )}

      {scanResult && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Sense scan</span>
            <button onClick={() => setScanResult(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
          </div>
          <div className="text-xs leading-[1.9] mb-3 p-3 bg-muted/20 rounded-sm border border-border/60" style={{ fontFamily: SERIF }}>
            {scanResult.map((t, i) =>
              t.senseIdx !== null
                ? <mark key={i} className={`${SENSES[t.senseIdx].mark} rounded-sm px-0.5`} title={SENSES[t.senseIdx].label}>{t.token}</mark>
                : <span key={i}>{t.token}</span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {SENSES.map((s, i) => counts![i] > 0 && (
              <span key={s.label} className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full`} style={{ fontFamily: MONO }}>
                {s.label} ×{counts![i]}
              </span>
            ))}
            {counts!.every(c => c === 0) && (
              <span className="text-[12px] text-muted-foreground" style={{ fontFamily: MONO }}>
                No sense words detected — write more concretely.
              </span>
            )}
          </div>
          {drillWords.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: MONO }}>Dig deeper →</span>
              {drillWords.map(w => (
                <button key={w} onClick={() => onDrillDown(w)}
                  className="text-[12px] px-2 py-0.5 border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  style={{ fontFamily: MONO }}>{w}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

