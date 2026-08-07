import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { MONO } from "../../data/constants";
import { identifyChord } from "../../lib/theory/identify";
import { fetchSongTunings } from "../../lib/tunings";
import {
  STRING_COUNT, TUNING_PRESETS, cloneTuning, noteName, soundingMidi,
  tuningLabel, tuningLetters, tuningSignature,
} from "../../lib/theory/tuning";
import type { Tuning } from "../../types";

/**
 * A flat neck laid out like tablature. Click a fret to put a finger down,
 * click it again to take it off.
 *
 * Strings are numbered **1–6 with 1 as the thick low string**, the opposite of
 * the usual convention and deliberately so. Two things carry that numbering
 * without a legend: string 1 is drawn at the bottom, where it sits when you
 * look down at the instrument, and the six lines taper from thickest at 1 to
 * thinnest at 6.
 */

const FRETS  = 12;
const FRET_W = 40;
const ROW_H  = 26;
const OPEN_W = 34;
const NUT_W  = 7;
const GUTTER = 96;
/** Frets that get a dot on a real neck — the map your eye already knows. */
const INLAYS = [3, 5, 7, 9, 12];

/** 1 is thickest, 6 thinnest. The cue is the taper, not the numbers. */
const stringWeight = (stringIdx: number) => 1.1 + (STRING_COUNT - 1 - stringIdx) * 0.32;

export function FretboardIdentifier({ initialTuning, onSaveTuning, canSave, isMobile }: {
  initialTuning?: Tuning;
  onSaveTuning: (t: Tuning) => void;
  canSave: boolean;
  isMobile?: boolean;
}) {
  const [tuning, setTuning] = useState<Tuning>(() => cloneTuning(initialTuning ?? TUNING_PRESETS[0]));
  // Per string, low first: a fret number, 0 for open, null for not played.
  const [frets, setFrets] = useState<(number | null)[]>(() => Array(STRING_COUNT).fill(null));
  const [saved, setSaved] = useState<Tuning[]>([]);

  // The song this opened on decides the tuning — but only when the song
  // actually carries one, so switching to a song with no tuning saved leaves
  // the neck as the songwriter had it rather than snapping back to Standard.
  useEffect(() => {
    if (initialTuning) setTuning(cloneTuning(initialTuning));
  }, [initialTuning && tuningSignature(initialTuning), initialTuning?.name]);

  const loadSaved = () => { fetchSongTunings().then(setSaved); };
  useEffect(() => { if (canSave) loadSaved(); }, [canSave]);

  const open = soundingMidi(tuning);

  // What the hand is holding, and therefore what it is called.
  const id = useMemo(() => identifyChord(
    frets.map((f, i) => f === null ? null : open[i] + f).filter((m): m is number => m !== null),
  ), [frets.join(","), open.join(",")]);

  const toggleFret = (stringIdx: number, fret: number) => {
    setFrets(p => p.map((f, i) => i !== stringIdx ? f : (f === fret ? null : fret)));
  };

  // The only way to clear, and it does the two things you want in the order
  // you want them: everything open, then everything off.
  const nutClick = () => {
    setFrets(p => p.every(f => f === 0) ? Array(STRING_COUNT).fill(null) : Array(STRING_COUNT).fill(0));
  };

  // Editing one string edits one string. The preset stays selected — the note
  // letters below are what say where the tuning actually is.
  const tuneString = (stringIdx: number, delta: number) => {
    setTuning(t => ({ ...t, midi: t.midi.map((m, i) => i === stringIdx ? m + delta : m) }));
  };

  const selectTuning = (t: Tuning) => setTuning({ ...cloneTuning(t), detune: tuning.detune });

  const currentSig = tuningSignature(tuning);
  const alreadySaved = saved.some(t => tuningSignature(t) === currentSig);

  const btn = "text-[10px] px-2 py-1 border rounded-sm transition-colors";
  const btnOff = "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30";
  const btnOn  = "border-foreground/30 text-foreground bg-muted/40";

  return (
    <div className="border border-border rounded-sm mt-6">
      {/* ── Tuning ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-border bg-muted/20">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Tuning</span>

        {TUNING_PRESETS.map(p => (
          <button key={p.name} onClick={() => selectTuning(p)}
            className={`${btn} ${tuning.name === p.name ? btnOn : btnOff}`}
            style={{ fontFamily: MONO }}>{p.name}</button>
        ))}

        {/* Saved tunings — read back off the songs, most recent first */}
        <select value="" onChange={e => {
            const t = saved[Number(e.target.value)];
            if (t) selectTuning(t);
          }}
          aria-label="Saved tunings"
          disabled={!saved.length}
          className={`${btn} ${btnOff} bg-transparent max-w-[160px] disabled:opacity-40`}
          style={{ fontFamily: MONO }}>
          <option value="">{saved.length ? "Saved…" : "No saved tunings"}</option>
          {saved.map((t, i) => (
            <option key={tuningSignature(t) + i} value={i}>{tuningLetters(t)} · {tuningLabel(t)}</option>
          ))}
        </select>
        <button onClick={() => { onSaveTuning(cloneTuning(tuning)); setSaved(s => [cloneTuning(tuning), ...s.filter(t => tuningSignature(t) !== currentSig)]); }}
          disabled={!canSave || alreadySaved}
          title={!canSave ? "Sign in to save tunings" : alreadySaved ? "Already saved" : "Save this tuning to the song"}
          className={`${btn} ${btnOff} disabled:opacity-30`} style={{ fontFamily: MONO }}>
          <Plus size={10} />
        </button>

        {/* Detune, applied on top of whichever tuning is selected */}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70 mr-1" style={{ fontFamily: MONO }}>Detune</span>
          <button onClick={() => setTuning(t => ({ ...t, detune: t.detune - 1 }))}
            aria-label="Detune down a semitone"
            className="text-muted-foreground/60 hover:text-foreground transition-colors text-[12px] leading-none px-1">−</button>
          <span className="text-[11px] text-foreground/70 tabular-nums w-6 text-center" style={{ fontFamily: MONO }}>
            {tuning.detune > 0 ? `+${tuning.detune}` : tuning.detune}
          </span>
          <button onClick={() => setTuning(t => ({ ...t, detune: t.detune + 1 }))}
            aria-label="Detune up a semitone"
            className="text-muted-foreground/60 hover:text-foreground transition-colors text-[12px] leading-none px-1">+</button>
        </div>
      </div>

      {/* ── The neck ───────────────────────────────────────────────────── */}
      <div className="overflow-x-auto" style={{ scrollbarWidth: "thin" }}>
        <div style={{ minWidth: GUTTER + OPEN_W + NUT_W + FRETS * FRET_W }}>
          {/* Strings run 6 at the top down to 1 at the bottom */}
          {Array.from({ length: STRING_COUNT }, (_, row) => STRING_COUNT - 1 - row).map(si => (
            <div key={si} className="flex items-stretch" style={{ height: ROW_H }}>
              {/* Gutter: which string, and what it is tuned to */}
              <div className="sticky left-0 z-10 shrink-0 flex items-center gap-1 pl-2 pr-1 bg-background border-r border-border"
                style={{ width: GUTTER }}>
                <span className="text-[9px] text-muted-foreground/45 w-2 tabular-nums" style={{ fontFamily: MONO }}>{si + 1}</span>
                <button onClick={() => tuneString(si, -1)} aria-label={`Tune string ${si + 1} down`}
                  className="text-muted-foreground/45 hover:text-foreground transition-colors text-[10px] leading-none px-0.5">‹</button>
                <span className="text-[11px] text-foreground/70 text-center flex-1 tabular-nums" style={{ fontFamily: MONO }}>
                  {noteName(open[si])}
                </span>
                <button onClick={() => tuneString(si, 1)} aria-label={`Tune string ${si + 1} up`}
                  className="text-muted-foreground/45 hover:text-foreground transition-colors text-[10px] leading-none px-0.5">›</button>
              </div>

              {/* Open — behind the nut, which is where an open string is played */}
              <button onClick={() => toggleFret(si, 0)}
                aria-label={`String ${si + 1} open`}
                className="shrink-0 relative flex items-center justify-center group"
                style={{ width: OPEN_W }}>
                {frets[si] === 0
                  ? <Marker note={noteName(open[si])} />
                  : <span className="text-[10px] text-muted-foreground/20 group-hover:text-muted-foreground/50 transition-colors leading-none"
                      style={{ fontFamily: MONO }}>{frets[si] === null ? "×" : ""}</span>}
              </button>

              {/* The nut. Six segments, one gesture — clicking any of them
                  opens every string, and clicking again takes them all off. */}
              <button onClick={nutClick} aria-label="Open all strings, then clear"
                className="shrink-0 bg-foreground/45 hover:bg-accent transition-colors"
                style={{ width: NUT_W }} />

              {/* Frets */}
              <div className="relative flex shrink-0">
                <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 bg-foreground/25 pointer-events-none"
                  style={{ height: stringWeight(si) }} />
                {Array.from({ length: FRETS }, (_, f) => f + 1).map(f => (
                  <button key={f} onClick={() => toggleFret(si, f)}
                    aria-label={`String ${si + 1}, fret ${f}`}
                    className="relative shrink-0 flex items-center justify-center border-r border-border/50 group"
                    style={{ width: FRET_W }}>
                    {frets[si] === f
                      ? <Marker note={noteName(open[si] + f)} />
                      : <span className="w-4 h-4 rounded-full opacity-0 group-hover:opacity-100 border border-dashed border-muted-foreground/40 transition-opacity" />}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Fret numbers, on the inlay frets only */}
          <div className="flex items-center" style={{ height: 16 }}>
            <div className="sticky left-0 z-10 shrink-0 bg-background" style={{ width: GUTTER + OPEN_W + NUT_W }} />
            {Array.from({ length: FRETS }, (_, f) => f + 1).map(f => (
              <span key={f} className="shrink-0 text-center text-[8px] text-muted-foreground/35 tabular-nums"
                style={{ width: FRET_W, fontFamily: MONO }}>
                {INLAYS.includes(f) ? f : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── What it is ─────────────────────────────────────────────────── */}
      {/* The name, said plainly. No caption telling you it is a name — the
          whole point of the tool is that it does the naming, so a sentence
          about the naming would be the app talking about itself. */}
      <div className="px-3 py-2.5 border-t border-border">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {id.primary ? (
            <span className="text-[19px] text-foreground leading-tight" style={{ fontFamily: MONO }}>
              {id.primary.name}
            </span>
          ) : (
            <span className="text-[15px] text-muted-foreground/40 leading-tight" style={{ fontFamily: MONO }}>
              {id.notes.length ? id.notes.join(" ") : "—"}
            </span>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground/55 tabular-nums" style={{ fontFamily: MONO }}>
            {tuningLetters(tuning)}
          </span>
        </div>
        {/* The messier honest readings, kept off the name's line */}
        {id.alternates.length > 0 && (
          <div className="mt-1 text-[10px] text-muted-foreground/50" style={{ fontFamily: MONO }}>
            also reads as {id.alternates.map(a => a.name).join(", ")}
          </div>
        )}
        {!id.primary && id.notes.length > 0 && (
          <div className="mt-1 text-[10px] text-muted-foreground/40" style={{ fontFamily: MONO }}>
            no chord name for these notes
          </div>
        )}
        {!isMobile && !id.primary && !id.notes.length && (
          <div className="mt-1 text-[9px] text-muted-foreground/35" style={{ fontFamily: MONO }}>
            click a fret to place · click the nut to open, again to clear
          </div>
        )}
      </div>
    </div>
  );
}

function Marker({ note }: { note: string }) {
  return (
    <span className="relative z-10 flex items-center justify-center rounded-full bg-foreground text-background text-[9px] tabular-nums"
      style={{ width: 22, height: 18, fontFamily: MONO }}>{note}</span>
  );
}
