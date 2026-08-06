import { useState, useCallback, useEffect, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { FRAGMENT_INTERVAL } from "../tools/InspirationPanel";
import { MONO } from "../../data/constants";
import { pickFragmentGroup } from "../../lib/text/fragments";
import type { Song } from "../../types";

export type MobileTool = "inspire" | "rhyme" | "synonyms";
export const MOBILE_MODES: MobileTool[] = ["inspire", "rhyme", "synonyms"];
export const MOBILE_GLYPHS: Record<MobileTool, string> = { inspire: "✦", rhyme: "◈", synonyms: "⇄" };
export function MobileLyricTools({ song, onAddVerse, selectionWord, onObjectWrite }: {
  song: Song;
  onAddVerse: (lyrics: string) => void;
  selectionWord: { word: string; seq: number } | null;
  onObjectWrite: (word: string) => void;
}) {
  const [mode, setMode] = useState<MobileTool>("inspire");
  const [cycleIdx, setCycleIdx] = useState(0);

  // ── Inspire state ──────────────────────────────────────────────────────────
  const fragmentSource = useMemo(() => [
    song.generalNotes ?? "",
    song.bigIdea ?? "",
    song.story?.beginning ?? "",
    song.story?.middle ?? "",
    song.story?.end ?? "",
    ...(song.objectWritings ?? []).map(o => o.text),
  ].join(" "), [song.generalNotes, song.bigIdea, song.story, song.objectWritings]);

  const [fragments, setFragments] = useState<string[]>(() => pickFragmentGroup(fragmentSource));
  const [fading, setFading] = useState(false);

  const cycleFragments = useCallback(() => {
    setFading(true);
    setTimeout(() => { setFragments(pickFragmentGroup(fragmentSource)); setFading(false); }, 300);
  }, [fragmentSource]);

  // Auto-cycle inspire every 15 s
  useEffect(() => {
    if (mode !== "inspire") return;
    const id = setInterval(cycleFragments, FRAGMENT_INTERVAL);
    return () => clearInterval(id);
  }, [mode, cycleFragments]);

  // Manual cycle via cycleIdx
  useEffect(() => { if (mode === "inspire") cycleFragments(); }, [cycleIdx]);

  // ── Rhyme state ────────────────────────────────────────────────────────────
  const [rhymes, setRhymes] = useState<{ word: string; near: boolean }[]>([]);
  const [rhymeLoading, setRhymeLoading] = useState(false);

  useEffect(() => {
    const w = selectionWord?.word?.trim();
    if (mode !== "rhyme" || !w) { setRhymes([]); return; }
    setRhymeLoading(true);
    Promise.all([
      fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(w)}&max=24`).then(r => r.json()),
      fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(w)}&max=24`).then(r => r.json()),
    ]).then(([perfect, near]) => {
      const p = (perfect as {word:string}[]).map(x => ({ word: x.word, near: false }));
      const n = (near    as {word:string}[]).map(x => ({ word: x.word, near: true  }));
      setRhymes([...p, ...n]);
      setCycleIdx(0);
    }).catch(() => {}).finally(() => setRhymeLoading(false));
  }, [mode, selectionWord?.word]);

  // ── Synonym state ──────────────────────────────────────────────────────────
  const [syns, setSyns] = useState<string[]>([]);
  const [synLoading, setSynLoading] = useState(false);

  useEffect(() => {
    const w = selectionWord?.word?.trim();
    if (mode !== "synonyms" || !w) { setSyns([]); return; }
    setSynLoading(true);
    Promise.all([
      fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=20`).then(r => r.json()),
      fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(w)}&max=16`).then(r => r.json()),
    ]).then(([syn, rel]) => {
      const synWords  = (syn as {word:string}[]).map(x => x.word);
      const relWords  = (rel as {word:string}[]).map(x => x.word).filter(w => !synWords.includes(w));
      setSyns([...synWords, ...relWords]);
      setCycleIdx(0);
    }).catch(() => {}).finally(() => setSynLoading(false));
  }, [mode, selectionWord?.word]);

  // ── Mode toggle ────────────────────────────────────────────────────────────
  const nextMode = () => {
    setMode(m => MOBILE_MODES[(MOBILE_MODES.indexOf(m) + 1) % 3]);
    setCycleIdx(0);
  };

  // ── Word display ───────────────────────────────────────────────────────────
  const word = selectionWord?.word;

  const displayWords: string[] = useMemo(() => {
    if (mode === "inspire") {
      // Up to 3 words / phrases, each ≤12 chars
      return fragments.slice(0, 3).map(f => f.length > 12 ? f.slice(0, 11) + "…" : f);
    }
    if (mode === "rhyme") {
      const slice = rhymes.slice(cycleIdx * 3, cycleIdx * 3 + 3);
      return slice.map(r => r.word);
    }
    // synonyms
    const slice = syns.slice(cycleIdx * 3, cycleIdx * 3 + 3);
    return slice.map(w => w.length > 12 ? w.slice(0, 11) + "…" : w);
  }, [mode, fragments, rhymes, syns, cycleIdx]);

  const canCycle = mode === "inspire"
    ? true
    : mode === "rhyme" ? rhymes.length > 3
    : syns.length > 3;

  const handleCycle = () => {
    if (mode === "inspire") { setCycleIdx(i => i + 1); return; }
    if (mode === "rhyme")   { setCycleIdx(i => (i + 1) % Math.max(1, Math.ceil(rhymes.length / 3))); return; }
    setCycleIdx(i => (i + 1) % Math.max(1, Math.ceil(syns.length / 3)));
  };

  const loading = (mode === "rhyme" && rhymeLoading) || (mode === "synonyms" && synLoading);
  const noWord  = (mode === "rhyme" || mode === "synonyms") && !word;

  const copyWord = (w: string) => navigator.clipboard.writeText(w).catch(() => {});

  return (
    <>
      {/* Top bar — fixed below the 49px nav header */}
      <div className="fixed inset-x-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border flex items-center gap-2 px-3"
        style={{ top: 49, height: 40 }}>

        {/* Word pills — flex-1 */}
        <div className={`flex-1 min-w-0 flex items-center gap-1.5 overflow-hidden transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
          {loading && (
            <span className="text-[10px] text-muted-foreground/40 italic" style={{ fontFamily: MONO }}>…</span>
          )}
          {!loading && noWord && (
            <span className="text-[10px] text-muted-foreground/40 italic" style={{ fontFamily: MONO }}>select a word above</span>
          )}
          {!loading && !noWord && displayWords.length === 0 && (
            <span className="text-[10px] text-muted-foreground/40 italic" style={{ fontFamily: MONO }}>no results</span>
          )}
          {!loading && displayWords.map((w, i) => (
            <button key={i} onClick={() => copyWord(w)}
              className="shrink-0 text-[11px] px-1.5 py-0.5 rounded border border-border/40 text-foreground/75 hover:text-foreground hover:border-foreground/20 active:bg-muted transition-colors"
              style={{ fontFamily: MONO }}>
              {w}
            </button>
          ))}
        </div>

        {/* Cycle / refresh button */}
        <button onClick={handleCycle} disabled={!canCycle && !noWord}
          className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors p-1"
          title="Next suggestions">
          <RefreshCw size={12} />
        </button>

        {/* Mode toggle — shows current mode glyph, tap to advance */}
        <button onClick={nextMode}
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded border border-border/40 text-accent/80 hover:text-accent hover:border-accent/40 active:bg-muted transition-colors"
          title={`Mode: ${mode} — tap to switch`}>
          <span className="text-[13px] leading-none">{MOBILE_GLYPHS[mode]}</span>
        </button>
      </div>

      {/* Spacer so lyrics content clears the bar */}
      <div aria-hidden style={{ height: 40 }} />
    </>
  );
}

