import { useState, useCallback, useEffect, useMemo, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { FRAGMENT_INTERVAL } from "./InspirationPanel";
import { MONO, SERIF } from "../../data/constants";
import { pickFragmentGroup } from "../../lib/text/fragments";
import type { Song } from "../../types";

// The mobile inspiration strip: one line of suggestion, and the two controls
// that steer it. Positioning is the caller's business — it is fixed under the
// header on the Lyrics tab, and pinned to the top of the full-screen editor.
//
// Three things were wrong with it and all three are about the same 375px of
// space:
//
//   · it showed up to three fragments, each cut to 12 characters, so what you
//     read was "and complic…". A clipped fragment is useless — the whole point
//     is a complete phrase to react to. It now shows one whole one, chosen to
//     fit rather than trimmed to fit.
//   · the mode control was a ✦, the object-writing glyph, so the one sparkle in
//     the interface meant two different things. It is a word now (see below).
//   · refresh sat before the mode control, reading as the thing that would
//     change the inspiration. Inspiration first, then refresh.
export type MobileTool = "inspire" | "rhyme" | "synonyms";
export const MOBILE_MODES: MobileTool[] = ["inspire", "rhyme", "synonyms"];

/** Height of the strip — callers pad by this so nothing starts underneath it. */
export const STRIP_H = 44;

// A word, not a glyph. Three glyphs would be three things to learn, and one of
// them had already collided with object writing; the mono small-caps label is
// the same chrome the rest of the app labels its fields with, and it says what
// it is without being learned.
const MODE_LABEL: Record<MobileTool, string> = {
  inspire: "Inspire", rhyme: "Rhyme", synonyms: "Synonym",
};

// Whole items only, as many as fit the budget. Never a partial one.
function fitItems(items: string[], budget: number, max: number): string[] {
  const out: string[] = [];
  let left = budget;
  for (const it of items) {
    if (out.length >= max) break;
    if (it.length > left) continue;
    out.push(it);
    left -= it.length + 2;
  }
  return out;
}

export function InspirationStrip({ song, selectionWord, offerWord = null, onCommitWord,
  leading, trailing, className = "" }: {
  song: Song;
  selectionWord: { word: string; seq: number } | null;
  /**
   * The word the caret is resting in, offered but not applied. Provisional on
   * purpose: it is drawn as an offer, no lookup runs for it, and it vanishes
   * the moment the caret moves. Tapping it is what makes it real.
   */
  offerWord?: string | null;
  onCommitWord?: (w: string) => void;
  /**
   * The banner is one row, not two. Inside the full-screen editor the caller
   * puts the abbreviated section name here and the way out in `trailing`, so
   * the label, the suggestion and the controls share a single 44px band rather
   * than stacking two of them above the writing.
   */
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const [mode, setMode] = useState<MobileTool>("inspire");
  const [cycleIdx, setCycleIdx] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

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

  const cycleMode = (m: MobileTool) => MOBILE_MODES[(MOBILE_MODES.indexOf(m) + 1) % MOBILE_MODES.length];

  const nextMode = () => {
    setMode(cycleMode);
    setCycleIdx(0);
  };

  const word = selectionWord?.word;

  // An offer for the word already in play would say nothing, so it isn't made.
  // This is also what stops the offer springing back the instant it is taken:
  // committing does not move the caret, so the same word would rest again.
  const offer = offerWord && offerWord !== word ? offerWord : null;

  // Taking the offer is the only thing that changes anything, and it changes
  // both halves at once: the word becomes the active one, and the strip leaves
  // fragments — asking for a word means a word tool is wanted. Reusing the same
  // cycle the mode button uses is deliberate; there is no second path here,
  // just a push off the one mode a committed word has nothing to say about.
  const commitOffer = () => {
    if (!offer) return;
    onCommitWord?.(offer);
    setMode(m => (m === "inspire" ? cycleMode(m) : m));
    setCycleIdx(0);
  };

  // One complete fragment: the first that fits the strip, else the shortest
  // there is. Never trimmed — a phrase cut mid-word is worse than a shorter one.
  const phrase = useMemo(() => {
    if (!fragments.length) return "";
    return fragments.find(f => f.length <= 34)
      ?? [...fragments].sort((a, b) => a.length - b.length)[0];
  }, [fragments]);

  // Rhymes and synonyms are single words, so a handful still fit whole.
  const words: string[] = useMemo(() => {
    if (mode === "rhyme")
      return fitItems(rhymes.slice(cycleIdx * 3).map(r => r.word), 26, 3);
    if (mode === "synonyms")
      return fitItems(syns.slice(cycleIdx * 3), 26, 3);
    return [];
  }, [mode, rhymes, syns, cycleIdx]);

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

  const copy = (w: string) => {
    navigator.clipboard.writeText(w).catch(() => {});
    setCopied(w);
    setTimeout(() => setCopied(c => (c === w ? null : c)), 900);
  };

  const hint = (msg: string) => (
    <span className="text-[11px] text-muted-foreground/45 italic truncate" style={{ fontFamily: SERIF }}>{msg}</span>
  );

  return (
    <div className={`flex items-center gap-2 px-3 bg-muted/50 border-b border-border ${className}`}
      style={{ height: STRIP_H }}>

      {leading}

      {/* The suggestion itself. Serif, because it is the songwriter's own
          words coming back to them — not a control.

          `justify-center` is the point of the whole row: the suggestion sits in
          the optical middle of the space the label and INSPIRE leave it, rather
          than pinned against the label. It is the thing being read, so it gets
          the middle; the controls are furniture and keep the edges. */}
      <div className={`flex-1 min-w-0 flex items-center justify-center gap-2 overflow-hidden transition-opacity duration-300 ${fading ? "opacity-0" : "opacity-100"}`}>
        {/* An offer takes the strip's line while it stands. Dashed and dim so
            it reads as not-yet-applied; the word in the writer's own serif
            because it is their word, and the action named in the interface's
            own mono because tapping is the interface's part. */}
        {offer ? (
          <button onClick={commitOffer}
            className="min-w-0 flex items-center gap-2 px-2 py-1 rounded-sm border border-dashed border-accent/45 active:bg-accent/10 transition-colors">
            <span className="min-w-0 truncate text-[13px] italic text-foreground/75" style={{ fontFamily: SERIF }}>
              {offer}
            </span>
            <span className="shrink-0 text-[8px] uppercase tracking-[0.14em] text-muted-foreground/55" style={{ fontFamily: MONO }}>
              look up
            </span>
          </button>
        ) : <>
        {loading && hint("…")}
        {!loading && noWord && hint("rest the cursor in a word")}

        {!loading && !noWord && mode === "inspire" && (
          phrase
            ? <button onClick={() => copy(phrase)}
                /* Wraps rather than truncates: an unusually long fragment takes
                   a second line, which the strip has room for. Nothing here is
                   ever cut mid-word. */
                className="min-w-0 text-left text-[13px] italic leading-[1.2] text-foreground/85 break-words active:text-accent transition-colors"
                style={{ fontFamily: SERIF }}
                title="Tap to copy">
                {copied === phrase ? "copied" : phrase}
              </button>
            : hint("write in Create to see fragments")
        )}

        {!loading && !noWord && mode !== "inspire" && (
          words.length === 0
            ? hint("no results")
            : words.map(w => (
                <button key={w} onClick={() => copy(w)}
                  className="shrink-0 text-[12px] px-1.5 py-0.5 rounded-sm border border-border/50 text-foreground/80 active:bg-muted transition-colors"
                  style={{ fontFamily: MONO }}>
                  {copied === w ? "copied" : w}
                </button>
              ))
        )}
        </>}
      </div>

      {/* Inspiration first, then refresh — refresh acts on whatever this names. */}
      <button onClick={nextMode}
        className="shrink-0 px-2 py-1 rounded-sm border border-accent/35 text-accent text-[9px] uppercase tracking-[0.14em] leading-none active:bg-accent/10 transition-colors"
        style={{ fontFamily: MONO }}
        title={`Showing ${MODE_LABEL[mode]} — tap to switch`}>
        {MODE_LABEL[mode]}
      </button>

      <button onClick={handleCycle} disabled={!canCycle && !noWord}
        className="shrink-0 text-muted-foreground/70 active:text-foreground disabled:opacity-20 transition-colors p-1"
        title="Another one">
        <RefreshCw size={13} />
      </button>

      {trailing}
    </div>
  );
}
