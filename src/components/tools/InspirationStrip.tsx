import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { MONO, SERIF } from "../../data/constants";
import { pickFragmentGroup } from "../../lib/text/fragments";
import { usePrefersReducedMotion } from "../../lib/usePrefersReducedMotion";
import type { Song } from "../../types";

// The mobile inspiration strip: one line of suggestion, and the controls that
// steer it. Positioning is the caller's business — it is fixed under the header
// on the Lyrics tab, and it is the whole top banner of the full-screen editor.
//
// Three things were wrong with it and all three are about the same 375px of
// space:
//
//   · it showed up to three fragments, each cut to 12 characters, so what you
//     read was "and complic…". A clipped fragment is useless — the whole point
//     is a complete phrase to react to. It now shows whole ones, chosen to fit
//     rather than trimmed to fit.
//   · the mode control was a ✦, the object-writing glyph, so the one sparkle in
//     the interface meant two different things. It is a word now (see below).
//   · refresh sat before the mode control, reading as the thing that would
//     change the inspiration. Inspiration first, then refresh.
export type MobileTool = "inspire" | "rhyme" | "synonyms";
export const MOBILE_MODES: MobileTool[] = ["inspire", "rhyme", "synonyms"];

/** Height of the strip — callers pad by this so nothing starts underneath it. */
export const STRIP_H = 44;

/**
 * How often a fragment changes on its own. Six seconds, against the desktop
 * panel's fifteen: the strip sits directly above a line someone is writing, so
 * it has to be quick enough to be worth glancing at and quiet enough to ignore.
 */
export const STRIP_FRAGMENT_INTERVAL = 6000;

/**
 * The dissolve between an old fragment and a new one. Fade out, swap, fade in
 * — not a literal overlap, because two phrases of different lengths sharing a
 * box would move the centred text sideways as they crossed, and movement is
 * exactly what must not happen above someone's writing.
 */
const FADE_MS = 260;

/**
 * What one half aims at when it chooses from its group — the same fits-or-
 * shortest rule the single fragment used, just against a smaller number. It is
 * a *preference*, not the fit test: whether two actually go on the line is
 * measured, because the space left over depends on how long the banner's label
 * is, and "V1" and "NOTEBOOK" are not the same amount of room.
 */
const HALF_BUDGET = 14;

/** Flex gaps either side of the `·`, which the measurement has to allow for. */
const PAIR_GAPS = 16;

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

/** One half of the fragment line: what it says, whether it is held, mid-fade. */
type Half = { text: string; pinned: boolean; fading: boolean };

const EMPTY_HALVES: Half[] = [
  { text: "", pinned: false, fading: false },
  { text: "", pinned: false, fading: false },
];

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
  const reduceMotion = usePrefersReducedMotion();

  // ── Inspire state ──────────────────────────────────────────────────────────
  const fragmentSource = useMemo(() => [
    song.generalNotes ?? "",
    song.bigIdea ?? "",
    song.story?.beginning ?? "",
    song.story?.middle ?? "",
    song.story?.end ?? "",
    ...(song.objectWritings ?? []).map(o => o.text),
  ].join(" "), [song.generalNotes, song.bigIdea, song.story, song.objectWritings]);

  // One roll of one half: a fresh group from the pool, reduced by the same
  // fits-or-shortest rule the single fragment used — the first that fits the
  // half's budget, else the shortest there is. Never trimmed; a phrase cut
  // mid-word is worse than a shorter one.
  const rollHalf = useCallback(() => {
    const group = pickFragmentGroup(fragmentSource);
    if (!group.length) return "";
    return group.find(f => f.length <= HALF_BUDGET)
      ?? [...group].sort((a, b) => a.length - b.length)[0];
  }, [fragmentSource]);

  // Refs so the clock below never has to depend on any of this. An interval
  // that re-created itself whenever the source text or the motion preference
  // changed would silently restart the cycle on every keystroke — the timer is
  // reset by deliberate actions only, and this is what keeps that true.
  const rollRef = useRef(rollHalf);        rollRef.current = rollHalf;
  const motionRef = useRef(reduceMotion);  motionRef.current = reduceMotion;

  const [halves, setHalves] = useState<Half[]>(() =>
    EMPTY_HALVES.map(h => ({ ...h, text: pickFragmentGroup(fragmentSource)[0] ?? "" })));
  const halvesRef = useRef(halves);        halvesRef.current = halves;

  /**
   * Re-roll every half `match` picks out, fading each through the change. The
   * halves to change are chosen once, up front: pinning one mid-fade must not
   * strand it at zero opacity.
   */
  const rollHalves = useCallback((match: (h: Half, i: number) => boolean) => {
    const hit = halvesRef.current.map(match);
    if (!hit.some(Boolean)) return;
    const swap = () => setHalves(hs =>
      hs.map((h, i) => (hit[i] ? { ...h, text: rollRef.current(), fading: false } : h)));
    if (motionRef.current) { swap(); return; }
    setHalves(hs => hs.map((h, i) => (hit[i] ? { ...h, fading: true } : h)));
    setTimeout(swap, FADE_MS);
  }, []);

  // Bumping this is what restarts the clock. It is bumped by the *actions* —
  // in the handlers, not in a render — so a re-roll a moment before a tick can
  // never be overwritten by that tick. That was the bug: the interval kept its
  // original phase through a manual change, so refresh appeared not to work.
  const [clock, setClock] = useState(0);
  const restartClock = () => setClock(c => c + 1);

  useEffect(() => {
    if (mode !== "inspire") return;
    const id = setInterval(() => rollHalves(h => !h.pinned), STRIP_FRAGMENT_INTERVAL);
    return () => clearInterval(id);
  }, [mode, clock, rollHalves]);

  // First real content arriving is not a change to react to, so it seeds the
  // halves without touching the clock.
  useEffect(() => {
    if (halvesRef.current.every(h => !h.text) && fragmentSource.trim())
      rollHalves(() => true);
  }, [fragmentSource, rollHalves]);

  /** Tapping a half: re-roll it, and hold it — it stops taking the clock. */
  const takeHalf = (i: number) => {
    setHalves(hs => hs.map((h, j) => (j === i ? { ...h, pinned: true } : h)));
    rollHalves((_, j) => j === i);
    restartClock();
  };

  /** Refresh: everything is let go and rolled again. */
  const refreshFragments = () => {
    setHalves(hs => hs.map(h => ({ ...h, pinned: false })));
    rollHalves(() => true);
    restartClock();
  };

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

  // ── Does the pair actually fit? ────────────────────────────────────────────
  // Measured, not estimated. A character count cannot answer this: the space
  // the fragments get is whatever the banner's label and controls leave them,
  // and an italic serif has no fixed character width. So both phrases are
  // measured in an off-screen probe carrying the same type, before paint, and
  // the second half only appears if the two genuinely go side by side. Two
  // fragments wrapping onto two lines inside a 44px band is the thing this
  // exists to prevent.
  const contentRef = useRef<HTMLDivElement>(null);
  const probeRef   = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState(0);
  const [pairFits, setPairFits] = useState(false);

  useEffect(() => {
    const box = contentRef.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setRoom(box.clientWidth));
    ro.observe(box);
    setRoom(box.clientWidth);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const box = contentRef.current, probe = probeRef.current;
    const [a, b] = halves;
    if (!box || !probe || !a.text || !b.text) { setPairFits(false); return; }
    const widthOf = (t: string) => { probe.textContent = t; return probe.getBoundingClientRect().width; };
    setPairFits(widthOf(a.text) + widthOf(b.text) + widthOf("·") + PAIR_GAPS <= box.clientWidth);
  }, [halves, room]);

  const shownHalves = pairFits ? [0, 1] : (halves[0].text ? [0] : []);

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
    if (mode === "inspire") { refreshFragments(); return; }
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
      <div ref={contentRef} className="flex-1 min-w-0 flex items-center justify-center gap-2 overflow-hidden">
        {/* The measuring probe: same type as a fragment, never painted, never
            part of the layout. It is what makes "where both fit" a fact. */}
        <span ref={probeRef} aria-hidden
          className="absolute invisible whitespace-pre text-[13px] italic pointer-events-none"
          style={{ fontFamily: SERIF, left: -9999, top: -9999 }} />

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
          shownHalves.length === 0
            ? hint("write in Create to see fragments")
            : shownHalves.map((i, n) => (
                <span key={i} className="min-w-0 flex items-center gap-2">
                  {n > 0 && <span className="shrink-0 text-[12px] text-muted-foreground/35" style={{ fontFamily: SERIF }}>·</span>}
                  {/* Each half is its own control: tapping re-rolls it and
                      holds it, and the other one carries on. A held half wears
                      the accent, the app's one colour for "this is the live
                      thing right now" — no movement, nothing to learn. */}
                  <button onClick={() => takeHalf(i)}
                    className={[
                      "min-w-0 text-left text-[13px] italic leading-[1.2] transition-colors",
                      // A lone fragment may wrap — an unusually long one takes a
                      // second line rather than being cut mid-word. A pair has
                      // been measured to fit on one, so it must not.
                      pairFits ? "whitespace-nowrap" : "break-words",
                      reduceMotion ? "" : "transition-opacity duration-[260ms]",
                      halves[i].fading ? "opacity-0" : "opacity-100",
                      halves[i].pinned ? "text-accent/75" : "text-foreground/85",
                    ].join(" ")}
                    style={{ fontFamily: SERIF }}
                    title={halves[i].pinned ? "Held — tap for another" : "Tap to hold this one"}>
                    {halves[i].text}
                  </button>
                </span>
              ))
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
        title={mode === "inspire" ? "Let both go and roll again" : "Another one"}>
        <RefreshCw size={13} />
      </button>

      {trailing}
    </div>
  );
}
