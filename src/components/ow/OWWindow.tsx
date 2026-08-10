import { useState, useRef, useEffect, type ReactNode } from "react";
import { X, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { AutoTA } from "../common/AutoTA";
import { FL } from "../common/FL";
import { MONO, SERIF, TIMER_OPTS } from "../../data/constants";
import { SENSES } from "../../data/senses";
import { pickOWWord } from "../../lib/text/owPool";
import { owLabel } from "../../lib/text/owLabel";
import { countAbstract, countSenses, extractDetailWord, getDrillWords, scanText } from "../../lib/text/senses";

// One window for a single object writing, whatever it was opened from. The
// three former components (StandaloneOWDialog / StandaloneOWDetail /
// ObjectWritingBox) differed only in which actions they offered and whether
// they ran a timer, so both of those are props now:
//
//   entry point                     timerStart      footer
//   new writing                     10 min          (none — Done closes)
//   new writing from a chosen word  2 min           (none — Done closes)
//   existing writing, in-song       null            (none — Done closes)
//   existing writing, sidebar       null            Copy · Add to song · Create song
//
// A collapsed pill is this component in a collapsed state, not a summary of
// one — expanded it is always this editor, timer or no timer.
export function OWWindow({
  text, seedWord, onChange, onClose,
  timerStart = null,
  onDrillDown, onSaveToNotebook, allSongText,
  footer, closeLabel = "Done", onDelete,
  isMobile,
}: {
  text: string;
  seedWord?: string;
  onChange: (text: string, seedWord?: string) => void;
  /** Done / Close — "put this away", never a save gesture. */
  onClose: () => void;
  /** Seconds to count down from, or null for an existing writing (no timer). */
  timerStart?: number | null;
  /** Parent decides what a drill word does: reseed this writing, or open a new one. */
  onDrillDown?: (word: string) => void;
  onSaveToNotebook?: (title: string, text: string) => void;
  /** Enables the "Detail" button (a word pulled from the song's own text). */
  allSongText?: string;
  /** Entry-point-specific actions, rendered to the left of the close button. */
  footer?: ReactNode;
  /** Label for the built-in close button, or null when the footer supplies its own. */
  closeLabel?: string | null;
  /**
   * Deliberately discreet: deleting a writing from the cloud should only be
   * reachable by opening that specific writing and looking for it, so it sits
   * on the bottom edge at barely-there opacity rather than among the actions.
   */
  onDelete?: () => void;
  isMobile?: boolean;
}) {
  const hasTimer = timerStart != null;
  const startIdx = hasTimer ? Math.max(0, TIMER_OPTS.indexOf(timerStart)) : 0;

  const [timerIdx, setTimerIdx]     = useState(startIdx);
  const [seconds, setSeconds]       = useState(timerStart ?? 0);
  const [active, setActive]         = useState(false);
  const [done, setDone]             = useState(false);
  const [scanResult, setScanResult] = useState<ReturnType<typeof scanText> | null>(null);
  const [hoverSense, setHoverSense] = useState<{ label: string; examples: string[] } | null>(null);
  const [detailMsg, setDetailMsg]   = useState("");
  const textareaRef                 = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) { clearInterval(id); setActive(false); setDone(true); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  const adjustTimer = (dir: -1 | 1) => {
    if (active || done) return;
    const next = Math.max(0, Math.min(TIMER_OPTS.length - 1, timerIdx + dir));
    setTimerIdx(next);
    setSeconds(TIMER_OPTS[next]);
  };

  const startTimer = () => {
    if (done) return;
    setActive(true);
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const resetTimer = () => {
    setActive(false); setDone(false);
    setTimerIdx(startIdx); setSeconds(timerStart ?? 0);
    setScanResult(null);
  };

  // The first keystroke is what starts the clock — not opening the window, and
  // with no focus word required. From here the duration is locked (adjustTimer
  // refuses while active) but the focus word itself stays editable.
  const handleChange = (v: string) => {
    if (hasTimer && !active && !done && text === "" && v !== "") setActive(true);
    onChange(v, seedWord);
    setScanResult(null);
  };

  const handleObject = () => onChange(text, pickOWWord());

  const handleDetail = () => {
    const w = extractDetailWord(allSongText ?? "");
    if (w) { onChange(text, w); setDetailMsg(""); }
    else setDetailMsg("Write more first.");
  };

  const triggerSaveToNotebook = () => {
    if (!text.trim() || !onSaveToNotebook) return;
    onSaveToNotebook(owLabel(seedWord, text) || "Object Writing", text);
  };

  // The head of `words` is the hand-written half of the list (see the note in
  // data/senses.ts) — the part that explains what the category means, rather
  // than the long tail WordNet supplied.
  const pickExamples = (sense: typeof SENSES[0]) => {
    const pool = sense.words.slice(0, 24);
    const picks: string[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(j, 1)[0]);
    }
    return picks;
  };
  const handleSenseHover = (sense: typeof SENSES[0]) =>
    setHoverSense({ label: sense.label, examples: pickExamples(sense) });

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const isLow = seconds <= 60 && active;
  const timerDisplay = done ? "0:00" : active ? `${mm}:${ss}` : `${TIMER_OPTS[timerIdx] / 60}:00`;
  const counts = scanResult ? countSenses(scanResult) : null;
  const abstractCount = scanResult ? countAbstract(scanResult) : 0;
  const drillWords = scanResult ? getDrillWords(scanResult) : [];

  const body = (
    <>
      {/* Controls row: timer · start · detail · object · notebook · seed word.
          Wraps: every control here is shrink-0, and at 375px they add up to
          more than the window is wide once "Save to Notebook" appears — which
          squeezed the focus-word input to nothing and pushed the row out. */}
      <div className="flex flex-wrap items-center gap-2">
        {hasTimer && (
          <>
            <div className="flex items-center gap-1 shrink-0">
              {!active && !done && (
                <div className="flex flex-col gap-0.5">
                  <button onClick={() => adjustTimer(1)} disabled={timerIdx === TIMER_OPTS.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors leading-none">
                    <ChevronUp size={10} />
                  </button>
                  <button onClick={() => adjustTimer(-1)} disabled={timerIdx === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors leading-none">
                    <ChevronDown size={10} />
                  </button>
                </div>
              )}
              <span className={`tabular-nums text-[12px] ml-0.5 ${isLow ? "text-red-500" : "text-muted-foreground"}`}
                style={{ fontFamily: MONO }}>{timerDisplay}</span>
            </div>

            {done ? (
              <button onClick={resetTimer}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                style={{ fontFamily: MONO }}>Reset</button>
            ) : !active ? (
              <button onClick={startTimer}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
                style={{ fontFamily: MONO }}>Start →</button>
            ) : null}
          </>
        )}

        {allSongText !== undefined && (
          <button onClick={handleDetail} title="Word from your own writing"
            className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
            style={{ fontFamily: MONO }}>Detail</button>
        )}

        {/* Object and the focus word stay live while the timer runs: typing now
            starts the clock, so locking them at that moment would mean a writing
            begun straight from the keyboard could never acquire a focus word. */}
        <button onClick={handleObject} title="Random object"
          className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
          style={{ fontFamily: MONO }}>Object</button>

        {text.trim() && onSaveToNotebook && (
          <button onClick={triggerSaveToNotebook}
            className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
            style={{ fontFamily: MONO }}>
            Save to Notebook
          </button>
        )}

        <input
          value={seedWord ?? ""}
          onChange={e => onChange(text, e.target.value || undefined)}
          placeholder="focus word…"
          className={`flex-1 basis-24 min-w-0 bg-transparent border-b border-border/60 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent pb-0.5 transition-colors`}
          style={{ fontFamily: SERIF, fontStyle: seedWord ? "italic" : "normal" }}
          onKeyDown={hasTimer ? e => { if (e.key === "Enter") startTimer(); } : undefined}
        />
      </div>

      {detailMsg && <p className="text-[12px] text-muted-foreground" style={{ fontFamily: MONO }}>{detailMsg}</p>}

      {/* Sense badges */}
      <div className="flex flex-wrap gap-1.5 relative">
        {SENSES.map(s => (
          <span key={s.label}
            className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full cursor-default relative select-none`}
            style={{ fontFamily: MONO }}
            onMouseEnter={isMobile ? undefined : () => handleSenseHover(s)}
            onMouseLeave={isMobile ? undefined : () => setHoverSense(null)}
            onClick={isMobile
              ? () => setHoverSense(h => h?.label === s.label ? null : { label: s.label, examples: pickExamples(s) })
              : undefined}>
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

      <AutoTA value={text} onChange={handleChange} innerRef={textareaRef}
        placeholder="Write freely. No editing, no judgement. Anchor to the senses above…"
        serif rows={9} textClass="text-sm"
        dimText={active} />

      {text.trim() && !scanResult && (
        <button onClick={() => setScanResult(scanText(text))}
          className="self-start text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          style={{ fontFamily: MONO }}>
          Scan for senses
        </button>
      )}

      {scanResult && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <FL className="text-muted-foreground">Sense scan</FL>
            <button onClick={() => setScanResult(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
          </div>
          <div className="text-xs leading-[1.9] mb-3 p-3 bg-muted/20 rounded-sm border border-border/60" style={{ fontFamily: SERIF }}>
            {scanResult.map((t, i) =>
              t.senseIdx !== null
                ? <mark key={i} className={`${SENSES[t.senseIdx].mark} rounded-sm px-0.5`} title={SENSES[t.senseIdx].label}>{t.token}</mark>
                : t.abstract
                  ? <span key={i} className="border-b border-dotted border-muted-foreground/40" title="Abstract verb">{t.token}</span>
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
          {/* Not a pill and not a score: abstract verbs are the thing to have
              less of, so this reads as a remark rather than a tally. */}
          {abstractCount > 0 && (
            <p className="text-[10px] text-muted-foreground/60 mb-3" style={{ fontFamily: MONO }}>
              {abstractCount} abstract verb{abstractCount === 1 ? "" : "s"} — the opposite of writing through the senses
            </p>
          )}
          {onDrillDown && drillWords.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-muted-foreground" style={{ fontFamily: MONO }}>Dig deeper →</span>
              {drillWords.map(w => (
                <button key={w} onClick={() => { onDrillDown(w); setScanResult(null); }}
                  className="text-[12px] px-2 py-0.5 border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  style={{ fontFamily: MONO }}>{w}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-sm shadow-xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          {hasTimer ? (
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
              Object Writing Session
            </span>
          ) : (
            <span className="text-[11px] italic text-foreground/70" style={{ fontFamily: SERIF }}>
              {owLabel(seedWord, text)}
            </span>
          )}
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">{body}</div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-border/40 flex flex-wrap items-center justify-end gap-2 shrink-0">
          {footer}
          {closeLabel !== null && (
            <button onClick={onClose}
              className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>{closeLabel}</button>
          )}
        </div>

        {onDelete && (
          <div className="flex justify-center pb-1.5 shrink-0">
            <button onClick={onDelete} title="Delete this writing from the Object Writing cloud"
              className="text-muted-foreground/15 hover:text-destructive transition-colors p-1">
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
