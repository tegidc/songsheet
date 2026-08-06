import { useState, useRef, useEffect } from "react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import type { StandaloneOW } from "../../types";
import { supabase } from "../../lib/supabase";
import { TIMER_OPTS, MONO, SERIF } from "../../data/constants";
import { SENSES } from "../../data/senses";
import { scanText, getDrillWords } from "../../lib/text/senses";
import { pickOWWord } from "../../lib/text/owPool";

export function StandaloneOWDialog({
  onClose, onSaved,
}: {
  onClose: () => void;
  onSaved: (entry?: StandaloneOW) => void;
}) {
  const [seedWord, setSeedWord]     = useState("");
  const [body, setBody]             = useState("");
  const [timerIdx, setTimerIdx]     = useState(3);
  const [seconds, setSeconds]       = useState(TIMER_OPTS[3]);
  const [active, setActive]         = useState(false);
  const [done, setDone]             = useState(false);
  const [saving, setSaving]         = useState(false);
  const [scanResult, setScanResult] = useState<ReturnType<typeof scanText> | null>(null);
  const [hoverSense, setHoverSense] = useState<{ label: string; examples: string[] } | null>(null);
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
    if (!done && seedWord.trim()) {
      setActive(true);
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const resetTimer = () => {
    setActive(false); setDone(false);
    setTimerIdx(3); setSeconds(TIMER_OPTS[3]);
    setScanResult(null);
  };

  const handleBodyChange = (v: string) => {
    if (!active && !done && body === "" && seedWord.trim()) setActive(true);
    setBody(v);
    setScanResult(null);
  };

  const handleObject = () => { setSeedWord(pickOWWord()); };

  const handleSenseHover = (sense: typeof SENSES[0]) => {
    const pool = [...sense.words];
    const picks: string[] = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const j = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(j, 1)[0]);
    }
    setHoverSense({ label: sense.label, examples: picks });
  };

  const [saveError, setSaveError] = useState("");

  const handleSave = async () => {
    if (!body.trim()) return;
    setSaving(true);
    setSaveError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setSaveError("Sign in to save sessions."); return; }
    const { data, error } = await supabase.from("standalone_ow")
      .insert({ user_id: user.id, seed_word: seedWord.trim() || null, body: body.trim() })
      .select("id, seed_word, body, written_at")
      .single();
    setSaving(false);
    if (error) { setSaveError("Save failed — " + error.message); return; }
    if (data) { onSaved(data as StandaloneOW); onClose(); }
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const isLow = seconds <= 60 && active;
  const timerDisplay = done ? "0:00" : active ? `${mm}:${ss}` : `${TIMER_OPTS[timerIdx] / 60}:00`;
  const counts = scanResult ? SENSES.map((_, i) => scanResult.filter(t => t.senseIdx === i).length) : null;
  const drillWords = scanResult ? getDrillWords(scanResult) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-sm shadow-xl mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
            Object Writing Session
          </span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {/* Controls row: timer · start · object · seed word */}
          <div className="flex items-center gap-2">
            {/* Timer */}
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

            {/* Start / Reset */}
            {done ? (
              <button onClick={resetTimer}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
                style={{ fontFamily: MONO }}>Reset</button>
            ) : !active ? (
              <button onClick={startTimer} disabled={!seedWord.trim()}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30 shrink-0"
                style={{ fontFamily: MONO }}>Start →</button>
            ) : null}

            {/* Object button — hidden while running */}
            {!active && !done && (
              <button onClick={handleObject} title="Random object"
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
                style={{ fontFamily: MONO }}>Object</button>
            )}

            {/* Seed word input — fills remaining space */}
            <input
              value={seedWord}
              onChange={e => setSeedWord(e.target.value)}
              placeholder="focus word…"
              disabled={active || done}
              className="flex-1 min-w-0 bg-transparent border-b border-border/60 text-xs text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:border-accent pb-0.5 transition-colors disabled:opacity-40"
              style={{ fontFamily: SERIF, fontStyle: seedWord ? "italic" : "normal" }}
              onKeyDown={e => e.key === "Enter" && startTimer()}
            />
          </div>

          {/* Sense badges */}
          <div className="flex flex-wrap gap-1.5 relative">
            {SENSES.map(s => (
              <span key={s.label}
                className={`${s.tw} text-[10px] px-2 py-0.5 rounded-full cursor-default relative`}
                style={{ fontFamily: MONO }}
                onMouseEnter={() => handleSenseHover(s)}
                onMouseLeave={() => setHoverSense(null)}>
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

          {/* Writing area */}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={e => handleBodyChange(e.target.value)}
            placeholder={seedWord.trim() ? "Write freely. No editing, no judgement. Anchor to the senses above…" : "Enter a focus word above first"}
            rows={9}
            className={`w-full bg-transparent text-sm placeholder:text-muted-foreground/30 focus:outline-none resize-none leading-[1.85] transition-colors duration-300 ${active ? "text-foreground/40" : "text-foreground"}`}
            style={{ fontFamily: SERIF }}
          />

          {/* Sense scan */}
          {body.trim() && !scanResult && (
            <button onClick={() => setScanResult(scanText(body))}
              className="self-start text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>
              Scan for senses
            </button>
          )}

          {scanResult && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Sense scan</span>
                <button onClick={() => setScanResult(null)} className="text-muted-foreground hover:text-foreground transition-colors"><X size={12} /></button>
              </div>
              <div className="text-xs leading-[1.9] mb-3 p-3 bg-muted/20 rounded-sm border border-border/60"
                style={{ fontFamily: SERIF }}>
                {scanResult.map((t, i) =>
                  t.senseIdx !== null ? (
                    <mark key={i} className={`${SENSES[t.senseIdx].mark} rounded-sm px-0.5`}
                      title={SENSES[t.senseIdx].label}>{t.token}</mark>
                  ) : <span key={i}>{t.token}</span>
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
                    <button key={w} onClick={() => { setSeedWord(w); setScanResult(null); }}
                      className="text-[12px] px-2 py-0.5 border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                      style={{ fontFamily: MONO }}>{w}</button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-1 border-t border-border/40">
            <button onClick={onClose}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              style={{ fontFamily: MONO }}>Discard</button>
            <div className="flex items-center gap-3">
              {saveError && (
                <span className="text-[11px] text-red-500" style={{ fontFamily: MONO }}>{saveError}</span>
              )}
              <button onClick={handleSave}
                disabled={!body.trim() || saving}
                className="text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-30"
                style={{ fontFamily: MONO }}>
                {saving ? "Saving…" : "Save session"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
