import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { formatDetectedKey } from "../../lib/theory/key";
import type { IdeaResult } from "../../lib/theory/ideas";
import type { Song } from "../../types";
import { BridgeBlock, IdeasBlock } from "./AnalyseChordsPanel";
import type { Key } from "./swiss";

/**
 * Tools that live inside the chord selector on desktop, under the row they
 * belong to — the key and its analysis under In key, the neck under From
 * fretboard. They were separate boxes on the page; now the selector is the
 * one place for working out chords.
 *
 * The selector is an inverted block, so anything written against the page
 * tokens (`text-foreground`, `border-border`, `bg-background`…) is re-pinned
 * to the panel's own colours here, the same trick the header plays over the
 * word cloud — the embedded tools follow without being rewritten.
 */
export const PANEL_TOKENS = {
  "--background": "var(--panel)", "--bg": "var(--panel)",
  "--foreground": "var(--panel-ink)", "--ink": "var(--panel-ink)",
  "--muted-foreground": "var(--panel-muted)", "--muted-ink": "var(--panel-muted)",
  "--border": "var(--panel-rule)", "--rule": "var(--panel-rule)", "--rule-soft": "var(--panel-rule)",
  "--card": "var(--panel)", "--muted": "color-mix(in srgb, var(--panel-ink) 10%, var(--panel))",
  "--accent": "var(--panel-ink)", "--accent-text": "var(--panel-ink)",
  "--fn-home": "var(--fn-home-panel)", "--fn-lift": "var(--fn-lift-panel)", "--fn-pull": "var(--fn-pull-panel)",
} as CSSProperties;

export function PanelTools({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={className} style={PANEL_TOKENS}>{children}</div>;
}

export interface AnalysisProps {
  song: Song;
  activeKey: Key;
  suggestion: { key: string; mode: "major" | "minor"; confidence: number; tieBreak: boolean } | null;
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
  onSetKey: (key: string) => void;
  onRedetect: () => void;
}

/**
 * Under In key, one small line: the key in force (the freeform "set key as"
 * field — nothing validated), what detection makes of the chords, and the two
 * generators. Ideas and Bridge open beneath it, one at a time.
 */
export function KeyTools(a: AnalysisProps) {
  const { song, activeKey, suggestion } = a;
  const [draft, setDraft] = useState(song.key);
  useEffect(() => { setDraft(song.key); }, [song.key]);
  const commit = () => { if (draft !== song.key) a.onSetKey(draft); };
  const [open, setOpen] = useState<"ideas" | "bridge" | null>(null);
  const sections = song.sections.filter(s => s.chordBars.some(b => b.trim()));
  const [sectionId, setSectionId] = useState("");
  const effectiveSection = sections.find(s => s.id === sectionId)?.id ?? sections[0]?.id ?? "";

  const shown = activeKey ? formatDetectedKey(activeKey.key, activeKey.mode) : "";
  const detected = suggestion ? formatDetectedKey(suggestion.key, suggestion.mode) : "";
  const toggle = (which: "ideas" | "bridge") => {
    if (open !== which) {
      if (which === "ideas" && !a.idea) a.onReroll(effectiveSection);
      if (which === "bridge" && !a.bridge) a.onBridgeGenerate();
    }
    setOpen(o => (o === which ? null : which));
  };
  const btn = (on: boolean) => `py-1.5 transition-colors ${on ? "text-[var(--panel-ink)] font-bold" : "hover:text-[var(--panel-ink)]"}`;

  return (
    <PanelTools className="col-start-2 -mt-1">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] [&_*]:text-[12px] text-[var(--panel-muted)] lowercase">
        <label className="flex items-baseline gap-1.5">
          key
          <input value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } }}
            placeholder={shown || "—"} aria-label="Key" title="Set key as — anything you type is kept"
            size={Math.max(2, (draft || shown || "—").length)}
            className="bg-transparent focus:outline-none border-b border-[var(--panel-rule)] focus:border-[var(--panel-ink)] text-[var(--panel-ink)] font-bold placeholder:text-[var(--panel-muted)] normal-case" />
        </label>
        {suggestion && <>
          <span aria-hidden>·</span>
          <span className="normal-case" title={suggestion.tieBreak ? "A major key and its relative minor fit equally well; broken by the chord this resolves on" : "What the chords suggest"}>
            detected {detected} {Math.round(suggestion.confidence * 100)}%
          </span>
          {detected !== song.key.trim() && (
            <button onClick={() => a.onSetKey(detected)} className="underline underline-offset-2 hover:text-[var(--panel-ink)]"
              title={`Set ${detected} as the key`}>set</button>
          )}
        </>}
        <button onClick={a.onRedetect} title="Re-run detection on the chords as they stand" aria-label="Re-run key detection"
          className="hover:text-[var(--panel-ink)] px-0.5">↻</button>
        <span aria-hidden>·</span>
        <button onClick={() => toggle("ideas")} aria-expanded={open === "ideas"} className={btn(open === "ideas")}
          title="A wildcard variation of a section">ideas</button>
        <button onClick={() => toggle("bridge")} aria-expanded={open === "bridge"} className={btn(open === "bridge")}
          title="A bridge built from the song's chords">bridge</button>
      </div>
      {open === "ideas" && (
        <div className="mt-2 border border-[var(--panel-rule)]">
          <IdeasBlock song={song} idea={a.idea} ideaUndo={a.ideaUndo} onReroll={a.onReroll} onApply={a.onApply} onUndo={a.onUndo}
            sectionId={effectiveSection} onSectionChange={setSectionId} />
        </div>
      )}
      {open === "bridge" && (
        <div className="mt-2 border border-[var(--panel-rule)]">
          <BridgeBlock song={song} bridge={a.bridge} bridgeUndo={a.bridgeUndo}
            onBridgeGenerate={a.onBridgeGenerate} onBridgeApply={a.onBridgeApply} onBridgeUndo={a.onBridgeUndo} />
        </div>
      )}
    </PanelTools>
  );
}
