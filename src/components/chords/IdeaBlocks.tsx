import { useEffect, useState } from "react";
import { PHRASE_MARKER, ROW_BREAK, isEditorialBar } from "../../data/constants";
import { flash, usePlay } from "../../lib/audio/PlayContext";
import type { IdeaResult } from "../../lib/theory/ideas";
import { seamLabel, songSeams, type JoinIdea } from "../../lib/theory/joins";
import type { Song } from "../../types";
import { NashName } from "./swiss";

/**
 * The generators' output — Ideas (a variation of a section), Joins (the seam
 * into the next section) and Bridge — drawn one way, in the selector's voice:
 * label-face text at 12px, a plain description at a readable measure, and the
 * chords themselves in the display face at the size of the song's own rows,
 * wrapping rather than stretched across a grid. Chords the idea changed are in
 * full ink; the ones it kept are muted, so the idea reads at a glance.
 *
 * Every chord can be tapped to hear it, and `hear` plays the run at the song's
 * tempo — with or without Play mode, since nothing here can be edited anyway.
 */

const LABEL = { fontFamily: "var(--font-label)" } as const;
const T12 = "text-[12px] leading-snug";

/** Seconds per bar from the song's tempo and metre; a steady 1.8 s when unset. */
export function secondsPerBar(song: Song): number {
  const bpm = parseFloat(song.tempo);
  const beats = parseInt(song.timeSignature, 10) || 4;
  if (!bpm || bpm < 30 || bpm > 300) return 1.8;
  return Math.min(3.2, Math.max(1, (beats * 60) / bpm));
}

export function IdeaBars({ bars, original, arrival, nashKey, song }: {
  bars: string[];
  /** The bars as they stand, to tell changed chords from kept ones. */
  original?: string[];
  /** Joins: the next section's opening, drawn faint after a gap. */
  arrival?: string[];
  nashKey: string | null;
  song: Song;
}) {
  const { hear, stopHearing } = usePlay();
  const [hearing, setHearing] = useState(false);
  useEffect(() => () => stopHearing(), [stopHearing]);

  const chordsOf = (bs: string[]) => bs.filter(b => b.trim() && !isEditorialBar(b));
  // A join is heard from its last two bars into the arrival, not from the top
  const run = arrival ? [...chordsOf(bars).slice(-2), ...arrival] : chordsOf(bars);

  const start = () => {
    if (hearing) { stopHearing(); setHearing(false); return; }
    const ms = hear(run, secondsPerBar(song));
    if (ms) { setHearing(true); window.setTimeout(() => setHearing(false), ms + 600); }
  };

  const Chord = ({ c, changed, faint }: { c: string; changed: boolean; faint?: boolean }) => (
    <button type="button" onClick={e => { flash(e.currentTarget); hear([c]); }} title={`Hear ${c}`}
      className={`px-1 -mx-1 rounded-sm transition-colors ${faint ? "text-muted-foreground/60" : changed ? "text-foreground" : "text-muted-foreground"} hover:text-foreground`}
      style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, letterSpacing: "var(--chord-tracking)", lineHeight: 1.3 }}>
      {nashKey ? <NashName chord={c} keyName={nashKey} /> : c}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {bars.map((b, i) => {
          if (b === ROW_BREAK) return <span key={i} className="basis-full h-0" />;
          if (b === PHRASE_MARKER) return <span key={i} aria-hidden className="self-stretch w-px bg-[var(--rule)] opacity-60" />;
          if (!b.trim()) return <span key={i} className="text-muted-foreground/40" style={{ fontSize: 17 }}>—</span>;
          return <Chord key={i} c={b.trim()} changed={!original || original[i]?.trim() !== b.trim()} />;
        })}
        {arrival && arrival.length > 0 && <>
          <span aria-hidden className={`${T12} text-muted-foreground`} style={LABEL}>→</span>
          {arrival.map((c, i) => <Chord key={`a${i}`} c={c} changed={false} faint />)}
        </>}
      </div>
      <button onClick={start} className={`${T12} self-start text-muted-foreground hover:text-foreground transition-colors`} style={LABEL}
        title={arrival ? "Hear the join into the next section" : "Hear it through"}>
        {hearing ? "■ stop" : arrival ? "▸ hear the join" : "▸ hear it"}
      </button>
    </div>
  );
}

function Header({ technique, children, onAgain, againTitle }: {
  technique?: string; children?: React.ReactNode; onAgain: () => void; againTitle: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${T12}`} style={LABEL}>
      {technique && <span className="font-bold text-foreground lowercase">{technique}</span>}
      {children}
      <button onClick={onAgain} title={againTitle} className="ml-auto text-muted-foreground hover:text-foreground px-1 text-[14px]">↻</button>
    </div>
  );
}

function Actions({ onUndo, onApply, applyLabel }: { onUndo?: () => void; onApply: () => void; applyLabel: string }) {
  return (
    <div className={`flex items-center gap-4 ${T12}`} style={LABEL}>
      {onUndo && <button onClick={onUndo} className={`${T12} text-muted-foreground hover:text-foreground`}>← undo</button>}
      <button onClick={onApply} className={`${T12} text-foreground font-bold hover:underline underline-offset-2`}>{applyLabel}</button>
    </div>
  );
}

const Desc = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[13px] leading-relaxed text-foreground/80 max-w-[62ch]" style={{ fontFamily: "var(--font-body)" }}>{children}</p>
);
const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className={`${T12} text-muted-foreground`} style={LABEL}>{children}</p>
);
const SectionSelect = ({ value, options, onChange, label }: {
  value: string; options: { id: string; label: string }[]; onChange: (id: string) => void; label: string;
}) => (
  <select value={value} onChange={e => onChange(e.target.value)} aria-label={label}
    className={`${T12} bg-transparent text-muted-foreground hover:text-foreground focus:outline-none cursor-pointer lowercase`} style={LABEL}>
    {options.map(o => <option key={o.id} value={o.id} className="bg-background text-foreground">{o.label}</option>)}
  </select>
);

const hasChords = (song: Song) => song.sections.some(s => (s.chordBars ?? []).some(b => b.trim() && !isEditorialBar(b)));
const box = "flex flex-col gap-3 p-4";

/** Wildcard ideas: a variation of one section, added as a new section. */
export function IdeasBlock({ song, idea, ideaUndo, onReroll, onApply, onUndo, sectionId, onSectionChange, nashKey }: {
  song: Song; idea: IdeaResult | null; ideaUndo: { newSectionId: string } | null;
  onReroll: (sectionId?: string) => void; onApply: (sectionId: string, bars: string[]) => void; onUndo: () => void;
  sectionId: string; onSectionChange: (id: string) => void; nashKey: string | null;
}) {
  const sections = song.sections.filter(s => (s.chordBars ?? []).some(b => b.trim() && !isEditorialBar(b)));
  const original = song.sections.find(s => s.id === idea?.sectionId)?.chordBars;
  return (
    <div className={box}>
      <Header technique={idea?.technique} onAgain={() => onReroll(sectionId)} againTitle="Another idea">
        {sections.length > 1 && <SectionSelect value={sectionId} label="Section to vary"
          options={sections.map(s => ({ id: s.id, label: s.shortLabel || s.label }))}
          onChange={id => { onSectionChange(id); onReroll(id); }} />}
      </Header>
      {!hasChords(song) ? <Empty>Add chords to a section first.</Empty>
        : !idea ? <Empty>↻ for an idea.</Empty>
        : <>
          <Desc>{idea.description}</Desc>
          <IdeaBars bars={idea.bars} original={original} nashKey={nashKey} song={song} />
          <Actions onUndo={ideaUndo ? onUndo : undefined} onApply={() => onApply(idea.sectionId, idea.bars)} applyLabel={`add as a new ${idea.sectionLabel.toLowerCase()} →`} />
        </>}
    </div>
  );
}

/** Joins: rewrite the end of a section to lead into the next one. */
export function JoinsBlock({ song, join, joinUndo, onJoinGenerate, onJoinApply, onJoinUndo, nashKey }: {
  song: Song; join: JoinIdea | null; joinUndo: { sectionId: string; bars: string[] } | null;
  onJoinGenerate: (seam?: string, avoid?: string) => void;
  onJoinApply: (sectionId: string, bars: string[]) => void; onJoinUndo: () => void; nashKey: string | null;
}) {
  const seams = songSeams(song);
  const seam = join?.join ?? seams[0]?.key ?? "";
  const original = song.sections.find(s => s.id === join?.sectionId)?.chordBars;
  return (
    <div className={box}>
      <Header technique={join?.technique} onAgain={() => onJoinGenerate(seam, join?.technique)} againTitle="Another way across this seam">
        {seams.length > 1 && <SectionSelect value={seam} label="Which seam"
          options={seams.map(s => ({ id: s.key, label: seamLabel(s) }))}
          onChange={k => onJoinGenerate(k)} />}
        {seams.length === 1 && <span className="text-muted-foreground lowercase">{seamLabel(seams[0])}</span>}
      </Header>
      {seams.length === 0 ? <Empty>Joins need two sections with chords — or one, to come back round to.</Empty>
        : !join ? <Empty>↻ for a way across.</Empty>
        : <>
          <p className={`${T12} text-muted-foreground max-w-[62ch]`} style={LABEL}>{join.context}</p>
          <Desc>{join.description}</Desc>
          <IdeaBars bars={join.bars} original={original} arrival={join.arrival} nashKey={nashKey} song={song} />
          <Actions onUndo={joinUndo ? onJoinUndo : undefined} onApply={() => onJoinApply(join.sectionId, join.bars)}
            applyLabel={`use in the ${join.sectionLabel.toLowerCase()} →`} />
        </>}
    </div>
  );
}

/** Bridge ideas: a generated bridge applied over a section. */
export function BridgeBlock({ song, bridge, bridgeUndo, onBridgeGenerate, onBridgeApply, onBridgeUndo, nashKey }: {
  song: Song; bridge: IdeaResult | null; bridgeUndo: { sectionId: string; bars: string[] } | null;
  onBridgeGenerate: () => void; onBridgeApply: (sectionId: string, bars: string[]) => void; onBridgeUndo: () => void;
  nashKey: string | null;
}) {
  return (
    <div className={box}>
      <Header technique={bridge?.technique} onAgain={onBridgeGenerate} againTitle="Another bridge">
        {bridge && <span className="text-muted-foreground lowercase">→ {bridge.sectionLabel}</span>}
      </Header>
      {!hasChords(song) ? <Empty>Add chords to other sections first.</Empty>
        : !bridge ? <Empty>Bridges need a key — set one, or add more chords to detect it.</Empty>
        : <>
          <Desc>{bridge.description}</Desc>
          <IdeaBars bars={bridge.bars} nashKey={nashKey} song={song} />
          <Actions onUndo={bridgeUndo ? onBridgeUndo : undefined} onApply={() => onBridgeApply(bridge.sectionId, bridge.bars)}
            applyLabel={`use in the ${bridge.sectionLabel.toLowerCase()} →`} />
        </>}
    </div>
  );
}
