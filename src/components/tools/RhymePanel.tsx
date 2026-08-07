import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { FL } from "../common/FL";
import { MONO, SERIF } from "../../data/constants";
import { owWordSet } from "../../lib/text/songText";
import type { Song } from "../../types";

export interface RhymeResult { word: string; syl: number; ow: boolean; near: boolean }
export function RhymePanel({ song, selectionWord }: { song: Song; selectionWord?: { word: string; seq: number } | null }) {
  const [word,      setWord]      = useState("");
  const [target,    setTarget]    = useState("");
  const [results,   setResults]   = useState<RhymeResult[]>([]);
  const [status,    setStatus]    = useState<"idle"|"loading"|"done"|"error">("idle");
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout>>();

  // When user highlights a word in a lyric box, adopt it — object reference always changes so effect always fires
  useEffect(() => {
    if (selectionWord?.word) setWord(selectionWord.word);
  }, [selectionWord]);

  // All words appearing in Object Writing entries
  const owWords = useMemo(() => owWordSet(song), [song.objectWritings]);

  const fetchRhymes = useCallback(async (q: string) => {
    const w = q.trim().toLowerCase();
    if (!w) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    try {
      const [pRes, nRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_rhy=${encodeURIComponent(w)}&max=40&md=s`),
        fetch(`https://api.datamuse.com/words?rel_nry=${encodeURIComponent(w)}&max=40&md=s`),
      ]);
      if (!pRes.ok || !nRes.ok) throw new Error("fetch failed");
      const perf: { word: string; numSyllables?: number }[] = await pRes.json();
      const near: { word: string; numSyllables?: number }[] = await nRes.json();
      const perfSet = new Set(perf.map(r => r.word));
      const combined: RhymeResult[] = [
        ...perf.map(r => ({ word: r.word, syl: r.numSyllables ?? 0, ow: owWords.has(r.word), near: false })),
        ...near.filter(r => !perfSet.has(r.word))
              .map(r => ({ word: r.word, syl: r.numSyllables ?? 0, ow: owWords.has(r.word), near: true })),
      ];
      // Sort: OW first within perfect, then OW first within near
      combined.sort((a, b) => {
        if (a.near !== b.near) return a.near ? 1 : -1;
        return (b.ow ? 1 : 0) - (a.ow ? 1 : 0);
      });
      setResults(combined);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, [owWords]);

  // Debounced auto-fetch on word change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!word.trim()) { setResults([]); setStatus("idle"); return; }
    debounceRef.current = setTimeout(() => fetchRhymes(word), 620);
    return () => clearTimeout(debounceRef.current);
  }, [word, fetchRhymes]);

  const targetSyl = parseInt(target, 10);
  const hasSylFilter = target.trim() !== "" && !isNaN(targetSyl) && targetSyl > 0;

  const visible = results.filter(r => !hasSylFilter || r.syl === targetSyl);
  const perfect = visible.filter(r => !r.near);
  const nearR   = visible.filter(r => r.near);
  const hasOW   = visible.some(r => r.ow);

  const Chip = ({ r }: { r: RhymeResult }) => (
    <span
      className={`inline-flex items-baseline gap-0.5 leading-snug ${
        r.ow   ? "text-accent"
        : r.near ? "text-muted-foreground/45 italic"
        : "text-foreground/70"
      }`}
      style={{ fontFamily: r.near && !r.ow ? SERIF : MONO }}
      title={`${r.syl || "?"} syl${r.syl !== 1 ? "s" : ""}${r.ow ? " · in your object writing" : ""}`}>
      {r.ow && <span className="text-accent text-[8px] leading-none mr-px">◆</span>}
      <span className="text-[12px]">{r.word}</span>
      {r.syl > 0 && (
        <span className="text-[9px] text-muted-foreground/30 ml-0.5" style={{ fontFamily: MONO }}>{r.syl}</span>
      )}
    </span>
  );

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <FL className="text-muted-foreground">
          Rhyme &amp; Metre
        </FL>
        <button onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          title={collapsed ? "Expand" : "Collapse"}>
          <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </button>
      </div>

      {!collapsed && <>
      {/* Inputs */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border/40 flex items-center gap-2">
        <input value={word} onChange={e => setWord(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchRhymes(word)}
          placeholder="word…"
          className="flex-1 min-w-0 bg-transparent border-b border-border/50 focus:border-foreground/40 text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none pb-0.5 transition-colors"
          style={{ fontFamily: MONO }} />
        {word && selectionWord?.word && word === selectionWord.word && (
          <span className="text-[9px] text-muted-foreground/30 shrink-0" style={{ fontFamily: MONO }}>← lyrics</span>
        )}
        <span className="text-muted-foreground/25 text-[12px] shrink-0" style={{ fontFamily: MONO }}>·</span>
        <input value={target} onChange={e => setTarget(e.target.value)}
          placeholder="syl"
          className="w-8 bg-transparent border-b border-border/50 focus:border-foreground/40 text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none pb-0.5 text-center transition-colors"
          style={{ fontFamily: MONO }} />
      </div>

      {/* Results */}
      <div className="p-3 min-h-[110px]">
        {status === "loading" && (
          <p className="text-[10px] text-muted-foreground/30 text-center py-3" style={{ fontFamily: MONO }}>…</p>
        )}
        {status === "error" && (
          <p className="text-[10px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            Couldn't reach rhyme service
          </p>
        )}
        {status === "idle" && (
          <p className="text-[12px] text-muted-foreground/35 italic text-center py-3 leading-relaxed"
            style={{ fontFamily: SERIF }}>Type a word to find rhymes</p>
        )}
        {status === "done" && visible.length === 0 && (
          <p className="text-[12px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            No rhymes{hasSylFilter ? ` with ${targetSyl} syl${targetSyl !== 1 ? "s" : ""}` : ""}
          </p>
        )}

        {status === "done" && visible.length > 0 && (
          <div className="flex flex-col gap-3">
            {/* Perfect rhymes */}
            {perfect.length > 0 && (
              <div>
                <FL className="block text-muted-foreground/40 mb-1.5">Perfect</FL>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
                  {perfect.map(r => <Chip key={r.word} r={r} />)}
                </div>
              </div>
            )}
            {/* Near rhymes */}
            {nearR.length > 0 && (
              <div>
                <FL className="block text-muted-foreground/40 mb-1.5">Near</FL>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">
                  {nearR.map(r => <Chip key={r.word} r={r} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* OW legend */}
      {hasOW && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5">
          <span className="text-accent text-[9px]">◆</span>
          <span className="text-[9px] text-muted-foreground/35" style={{ fontFamily: MONO }}>in your object writing</span>
        </div>
      )}
      </>}
    </div>
  );
}

