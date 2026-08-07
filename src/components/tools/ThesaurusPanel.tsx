import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { MONO, SERIF } from "../../data/constants";
import { owWordSet } from "../../lib/text/songText";
import type { Song } from "../../types";

export interface ThesaurusResult { word: string; syl: number; type: "syn" | "ant" | "rel" }
export function ThesaurusPanel({ song, selectionWord, onObjectWrite }: {
  song: Song;
  selectionWord?: { word: string; seq: number } | null;
  onObjectWrite?: (word: string) => void;
}) {
  const [word,      setWord]      = useState("");
  const [results,   setResults]   = useState<ThesaurusResult[]>([]);
  const [status,    setStatus]    = useState<"idle"|"loading"|"done"|"error">("idle");
  const [copied,    setCopied]    = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const debounceRef               = useRef<ReturnType<typeof setTimeout>>();

  // Words appearing in Object Writing (highlighted in results)
  const owWords = useMemo(() => owWordSet(song), [song.objectWritings]);

  // Adopt highlighted word from lyrics
  useEffect(() => {
    if (selectionWord?.word) setWord(selectionWord.word);
  }, [selectionWord]);

  const fetchThesaurus = useCallback(async (q: string) => {
    const w = q.trim().toLowerCase();
    if (!w) { setResults([]); setStatus("idle"); return; }
    setStatus("loading");
    try {
      const [synRes, antRes, relRes] = await Promise.all([
        fetch(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(w)}&max=20&md=s`),
        fetch(`https://api.datamuse.com/words?rel_ant=${encodeURIComponent(w)}&max=12&md=s`),
        fetch(`https://api.datamuse.com/words?ml=${encodeURIComponent(w)}&max=14&md=s`),
      ]);
      if (!synRes.ok || !antRes.ok || !relRes.ok) throw new Error("fetch failed");
      const synData: { word: string; numSyllables?: number }[] = await synRes.json();
      const antData: { word: string; numSyllables?: number }[] = await antRes.json();
      const relData: { word: string; numSyllables?: number }[] = await relRes.json();
      const synSet = new Set(synData.map(r => r.word));
      const antSet = new Set(antData.map(r => r.word));
      setResults([
        ...synData.map(r => ({ word: r.word, syl: r.numSyllables ?? 0, type: "syn" as const })),
        ...antData.map(r => ({ word: r.word, syl: r.numSyllables ?? 0, type: "ant" as const })),
        ...relData
          .filter(r => !synSet.has(r.word) && !antSet.has(r.word))
          .map(r => ({ word: r.word, syl: r.numSyllables ?? 0, type: "rel" as const })),
      ]);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }, []);

  // Debounced auto-fetch
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!word.trim()) { setResults([]); setStatus("idle"); return; }
    debounceRef.current = setTimeout(() => fetchThesaurus(word), 620);
    return () => clearTimeout(debounceRef.current);
  }, [word, fetchThesaurus]);

  const copyWord = (w: string) => {
    navigator.clipboard.writeText(w).catch(() => {});
    setCopied(w);
    setTimeout(() => setCopied(null), 1200);
  };

  const synonyms = results.filter(r => r.type === "syn");
  const antonyms = results.filter(r => r.type === "ant");
  const related  = results.filter(r => r.type === "rel");

  const Chip = ({ r }: { r: ThesaurusResult }) => {
    const inOW = owWords.has(r.word);
    const isCopied = copied === r.word;
    const handleClick = () => onObjectWrite ? onObjectWrite(r.word) : copyWord(r.word);
    return (
      <button onClick={handleClick}
        className={`inline-flex items-baseline gap-0.5 leading-snug transition-colors ${onObjectWrite ? "cursor-pointer" : "cursor-copy"} ${
          isCopied    ? "text-accent" :
          r.type === "ant" ? "text-muted-foreground/50 italic hover:text-foreground/70" :
          r.type === "rel" ? "text-muted-foreground/40 italic hover:text-muted-foreground/70" :
          inOW               ? "text-accent/80 hover:text-accent" :
                               "text-foreground/70 hover:text-foreground"
        }`}
        style={{ fontFamily: r.type === "rel" ? SERIF : MONO }}
        title={`${onObjectWrite ? "Object Write" : "Copy"} · ${r.syl || "?"}syl${r.syl !== 1 ? "s" : ""}${inOW ? " · in your OW" : ""}`}>
        {inOW && !isCopied && <span className="text-accent text-[8px] leading-none mr-px">◆</span>}
        <span className="text-[12px]">{isCopied ? "✓" : r.word}</span>
        {r.syl > 0 && (
          <span className="text-[9px] text-muted-foreground/25 ml-0.5" style={{ fontFamily: MONO }}>{r.syl}</span>
        )}
      </button>
    );
  };

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Synonyms &amp; Antonyms
        </span>
        <button onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
          title={collapsed ? "Expand" : "Collapse"}>
          <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </button>
      </div>

      {!collapsed && <>
      {/* Input */}
      <div className="px-3 pt-2.5 pb-2 border-b border-border/40 flex items-center gap-2">
        <input value={word} onChange={e => setWord(e.target.value)}
          onKeyDown={e => e.key === "Enter" && fetchThesaurus(word)}
          placeholder="word…"
          className="flex-1 min-w-0 bg-transparent border-b border-border/50 focus:border-foreground/40 text-[12px] text-foreground placeholder:text-muted-foreground/25 focus:outline-none pb-0.5 transition-colors"
          style={{ fontFamily: MONO }} />
        {word && selectionWord?.word && word === selectionWord.word && (
          <span className="text-[9px] text-muted-foreground/30 shrink-0" style={{ fontFamily: MONO }}>← lyrics</span>
        )}
      </div>

      {/* Results */}
      <div className="p-3 min-h-[110px]">
        {status === "loading" && (
          <p className="text-[10px] text-muted-foreground/30 text-center py-3" style={{ fontFamily: MONO }}>…</p>
        )}
        {status === "error" && (
          <p className="text-[10px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            Couldn't reach thesaurus service
          </p>
        )}
        {status === "idle" && (
          <p className="text-[12px] text-muted-foreground/35 italic text-center py-3 leading-relaxed"
            style={{ fontFamily: SERIF }}>Highlight a word or type one</p>
        )}
        {status === "done" && results.length === 0 && (
          <p className="text-[12px] text-muted-foreground/40 italic text-center py-3" style={{ fontFamily: SERIF }}>
            No results
          </p>
        )}
        {status === "done" && results.length > 0 && (
          <div className="flex flex-col gap-3">
            {synonyms.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40 mb-1.5" style={{ fontFamily: MONO }}>Synonyms</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">{synonyms.map(r => <Chip key={r.word} r={r} />)}</div>
              </div>
            )}
            {antonyms.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40 mb-1.5" style={{ fontFamily: MONO }}>Antonyms</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">{antonyms.map(r => <Chip key={r.word} r={r} />)}</div>
              </div>
            )}
            {related.length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/40 mb-1.5" style={{ fontFamily: MONO }}>Related</div>
                <div className="flex flex-wrap gap-x-2.5 gap-y-1.5">{related.map(r => <Chip key={r.word} r={r} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* OW legend */}
      {results.some(r => owWords.has(r.word)) && (
        <div className="px-3 pb-2.5 flex items-center gap-1.5">
          <span className="text-accent text-[9px]">◆</span>
          <span className="text-[9px] text-muted-foreground/35" style={{ fontFamily: MONO }}>in your object writing</span>
        </div>
      )}
      </>}
    </div>
  );
}

