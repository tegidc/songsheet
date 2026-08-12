import { useEffect, useMemo, useRef, useState } from "react";
import { MONO, SERIF } from "../../data/constants";
import { SENSES } from "../../data/senses";
import { supabase } from "../../lib/supabase";
import type { Song, StandaloneOW } from "../../types";
import { WordCloudCanvas } from "./WordCloudCanvas";
import { extractPhrases, shuffle, type CloudPhrase } from "../../lib/wordcloud/extract";
import { buildLyricMatcher } from "../../lib/wordcloud/lyricsMatch";
import { FONT_STACKS, PALETTES } from "../../lib/wordcloud/palettes";
import { useWordCloudPrefs } from "../../lib/wordcloud/prefs";
import { PHRASE_CAP } from "../../lib/wordcloud/sizing";
import {
  buildSourceItems, lyricTextsForScope, EVERYTHING,
  type CloudProjectRow, type ContentFilter,
} from "../../lib/wordcloud/source";

const CONTENT_LABELS: Record<ContentFilter, string> = {
  "ow+notes": "Object writing + Notes",
  "ow": "Object writing only",
  "all": "Everything (incl. lyrics)",
};

function contentOptions(scoped: boolean): ContentFilter[] {
  return scoped ? ["ow+notes", "ow", "all"] : ["ow+notes", "ow"];
}

// A full-bleed view across everything written, not one song — mounted as a
// sibling of the header (App owns showWordCloud), not a Tab and not an
// overlay centred over the page. Borrows OWWindow-adjacent mechanics
// (FullScreenEditor's, really: scroll lock + Escape) but has no backdrop of
// its own to click through — it *is* the page below the header.
export function WordCloudView({
  onClose, onWriteEntry,
}: {
  onClose: () => void;
  onWriteEntry: () => void;
}) {
  const prefs = useWordCloudPrefs();
  const palette = PALETTES[prefs.palette];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The panel starts put away, every time. The cloud is the whole point of the
  // view and the controls are largely set-and-forget — the four that are worth
  // remembering already persist themselves (Palette/Typography/Sense scan/
  // lyrics-hide, see lib/wordcloud/prefs.ts), so what's left to decide on open
  // is nothing. Deliberately *not* persisted alongside those: a remembered-open
  // panel would mean the view could open with a quarter of the cloud missing
  // and no way to tell that was a choice made last time.
  const [showPanel, setShowPanel] = useState(false);

  // Projects and Content always reset to "wide open" on each fresh open —
  // unlike Palette/Typography/Sense scan/lyrics-hide, which persist (§9).
  const [projects, setProjects] = useState<CloudProjectRow[] | null>(null);
  const [standalone, setStandalone] = useState<StandaloneOW[] | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>(EVERYTHING);
  const [contentFilter, setContentFilter] = useState<ContentFilter>("ow+notes");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      // `created_at` is the project's genuine start date (added after the
      // baseline schema, see supabase/migrations/20260806_add_created_at_to_
      // projects.sql) — newest-first per §4 means by this, not updated_at.
      supabase.from("projects").select("id, name, data, created_at").order("created_at", { ascending: false }),
      supabase.from("standalone_ow").select("id, seed_word, body, written_at, origin_song_id"),
    ]).then(([p, s]) => {
      if (cancelled) return;
      if (p.error) console.error("Word Cloud: fetch projects failed:", p.error.message);
      if (s.error) console.error("Word Cloud: fetch standalone_ow failed:", s.error.message);
      setProjects(((p.data ?? []) as Array<{ id: string; name: string; data: Song; created_at: string }>)
        .map(row => ({ id: row.id, name: row.name, updatedAt: row.created_at, song: row.data })));
      setStandalone((s.data ?? []) as StandaloneOW[]);
    });
    return () => { cancelled = true; };
  }, []);

  // A lyrics-only Content selection is unreachable once the scope widens back
  // to Everything (§4) — fall back rather than leave a dead selection standing.
  useEffect(() => {
    if (projectFilter === EVERYTHING && contentFilter === "all") setContentFilter("ow+notes");
  }, [projectFilter, contentFilter]);

  const loaded = projects !== null && standalone !== null;

  // Re-sampled on open and on any filter change — no manual reshuffle control.
  const pool = useMemo((): { phrases: CloudPhrase[]; entryCount: number; hiddenCount: number; cappedCount: number } | null => {
    if (!projects || !standalone) return null;
    const items = buildSourceItems(projects, standalone, projectFilter, contentFilter);
    let extracted = extractPhrases(items);
    let hiddenCount = 0;
    if (prefs.hideUsedLyrics) {
      const isUsed = buildLyricMatcher(lyricTextsForScope(projects, projectFilter));
      const before = extracted.length;
      extracted = extracted.filter(p => !isUsed(p.words));
      hiddenCount = before - extracted.length;
    }
    const shuffled = shuffle(extracted);
    const cappedCount = Math.max(0, shuffled.length - PHRASE_CAP);
    return { phrases: shuffled.slice(0, PHRASE_CAP), entryCount: items.length, hiddenCount, cappedCount };
  }, [projects, standalone, projectFilter, contentFilter, prefs.hideUsedLyrics]);

  const scoped = projectFilter !== EVERYTHING;
  const isEmpty = loaded && (!pool || pool.phrases.length === 0);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1400);
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  return (
    <div className="fixed inset-0 z-10 flex flex-col md:flex-row" style={{ background: palette.bg }}>
      <div className="flex-1 min-w-0 relative overflow-hidden">
        {isEmpty ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
            <strong className="text-[15px] font-medium" style={{ fontFamily: SERIF, color: palette.ink }}>
              Nothing to draw from yet
            </strong>
            <p className="max-w-[300px] text-[13px] leading-[1.7]" style={{ fontFamily: MONO, color: palette.mist }}>
              The cloud builds itself from your object writing and notes. Write an entry and it will show up here.
            </p>
            <button onClick={onWriteEntry}
              className="mt-1 text-[12px] px-3 py-1.5 border rounded-sm transition-colors"
              style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line }}>
              Start an object writing session
            </button>
          </div>
        ) : loaded && pool ? (
          <WordCloudCanvas
            phrases={pool.phrases}
            palette={palette}
            typography={prefs.typography}
            senseScanOn={prefs.senseScanOn}
            onCopy={showToast} />
        ) : null}

        {toast && (
          <div className="absolute left-1/2 bottom-8 -translate-x-1/2 px-3.5 py-1.5 rounded-full text-[11px] uppercase tracking-wide pointer-events-none"
            style={{ fontFamily: MONO, background: palette.ink, color: palette.bg }}>
            {toast}
          </div>
        )}
      </div>

      {/* Collapsed, the panel is this one button — parked in the bottom-right
          corner directly above `FloatingOWButton` (fixed bottom-5 right-5,
          which App keeps rendered over the cloud), so the two read as a stack
          in the same corner rather than one sitting on the other. A word, not
          a glyph: no icon says "the things that change what this cloud shows",
          and the panel's own header uses the same word so the button and what
          it opens are named the same thing. */}
      {!showPanel && (
        <button onClick={() => setShowPanel(true)} title="Show controls"
          className="absolute bottom-[60px] right-5 z-20 text-[11px] uppercase tracking-wide px-3 py-1.5 border rounded-sm transition-opacity opacity-80 hover:opacity-100"
          style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line, background: palette.bg }}>
          Controls
        </button>
      )}

      {/* Panel */}
      {showPanel && (
      <aside className="shrink-0 w-full md:w-[260px] max-h-[46%] md:max-h-none overflow-y-auto px-5 py-6 flex flex-col gap-4 border-t md:border-t-0 md:border-l"
        style={{ borderColor: palette.line }}>
        <div className="flex items-center justify-between gap-3 -mt-1">
          <span className="text-[10px] uppercase tracking-wide" style={{ fontFamily: MONO, color: palette.mist }}>Controls</span>
          <button onClick={() => setShowPanel(false)} aria-label="Hide controls" title="Hide controls"
            className="shrink-0 -mr-1 p-1 text-[14px] leading-none transition-opacity opacity-70 hover:opacity-100"
            style={{ fontFamily: MONO, color: palette.mist }}>
            ×
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide" style={{ fontFamily: MONO, color: palette.mist }}>Projects</label>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
            className="text-[12px] bg-transparent border rounded-sm px-2 py-1.5 focus:outline-none cursor-pointer"
            style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line }}>
            <option value={EVERYTHING} style={{ color: "#000" }}>Everything</option>
            {(projects ?? []).map(p => (
              <option key={p.id} value={p.id} style={{ color: "#000" }}>{p.name || "Untitled Song"}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide" style={{ fontFamily: MONO, color: palette.mist }}>Content</label>
          <select value={contentFilter} onChange={e => setContentFilter(e.target.value as ContentFilter)}
            className="text-[12px] bg-transparent border rounded-sm px-2 py-1.5 focus:outline-none cursor-pointer"
            style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line }}>
            {contentOptions(scoped).map(c => (
              <option key={c} value={c} style={{ color: "#000" }}>{CONTENT_LABELS[c]}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] leading-[1.4]" style={{ fontFamily: MONO, color: palette.mist }}>
            Sense scan
          </span>
          <button role="switch" aria-checked={prefs.senseScanOn}
            onClick={() => prefs.setSenseScanOn(!prefs.senseScanOn)}
            className="relative shrink-0 w-8 h-[18px] rounded-full transition-colors"
            style={{ background: prefs.senseScanOn ? palette.accent : palette.line }}>
            <span className="absolute top-[3px] left-[3px] w-3 h-3 rounded-full bg-white transition-transform"
              style={{ transform: prefs.senseScanOn ? "translateX(14px)" : "translateX(0)" }} />
          </button>
        </div>

        {prefs.senseScanOn && (
          <div className="flex flex-wrap gap-1.5 -mt-1.5">
            {SENSES.map(s => (
              <span key={s.label} className={`${s.tw} px-2 py-0.5 rounded-full text-[10px] tracking-wide`}>
                {s.label}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] leading-[1.4]" style={{ fontFamily: MONO, color: palette.mist }}>
            Hide what's already in your lyrics
          </span>
          <button role="switch" aria-checked={prefs.hideUsedLyrics}
            onClick={() => prefs.setHideUsedLyrics(!prefs.hideUsedLyrics)}
            className="relative shrink-0 w-8 h-[18px] rounded-full transition-colors"
            style={{ background: prefs.hideUsedLyrics ? palette.accent : palette.line }}>
            <span className="absolute top-[3px] left-[3px] w-3 h-3 rounded-full bg-white transition-transform"
              style={{ transform: prefs.hideUsedLyrics ? "translateX(14px)" : "translateX(0)" }} />
          </button>
        </div>

        <div className="h-px my-1" style={{ background: palette.line }} />

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide" style={{ fontFamily: MONO, color: palette.mist }}>Palette</label>
          <select value={prefs.palette} onChange={e => prefs.setPalette(e.target.value)}
            className="text-[12px] bg-transparent border rounded-sm px-2 py-1.5 focus:outline-none cursor-pointer"
            style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line }}>
            {Object.keys(PALETTES).map(name => (
              <option key={name} value={name} style={{ color: "#000" }}>{name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] uppercase tracking-wide" style={{ fontFamily: MONO, color: palette.mist }}>Typography</label>
          <select value={prefs.typography} onChange={e => prefs.setTypography(e.target.value)}
            className="text-[12px] bg-transparent border rounded-sm px-2 py-1.5 focus:outline-none cursor-pointer"
            style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line }}>
            {Object.keys(FONT_STACKS).map(name => (
              <option key={name} value={name} style={{ color: "#000" }}>{name}</option>
            ))}
          </select>
        </div>

        {loaded && pool && (
          <div className="text-[11px] leading-[1.8] pt-2" style={{ fontFamily: MONO, color: palette.mist }}>
            <span style={{ color: palette.ink }}>{pool.phrases.length}</span> phrases from{" "}
            <span style={{ color: palette.ink }}>{pool.entryCount}</span> entries
            {pool.hiddenCount > 0 && (
              <><br /><span style={{ color: palette.ink }}>{pool.hiddenCount}</span> hidden</>
            )}
            {pool.cappedCount > 0 && (
              <><br /><span style={{ color: palette.ink }}>{pool.cappedCount}</span> more than the cloud can hold</>
            )}
          </div>
        )}
      </aside>
      )}
    </div>
  );
}
