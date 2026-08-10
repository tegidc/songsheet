import { useEffect, useMemo, useState } from "react";
import { MONO, SERIF } from "../../data/constants";
import { supabase } from "../../lib/supabase";
import type { Song, StandaloneOW } from "../../types";
import { extractPhrases, shuffle, type CloudPhrase } from "../../lib/wordcloud/extract";
import { buildLyricMatcher } from "../../lib/wordcloud/lyricsMatch";
import { PALETTES } from "../../lib/wordcloud/palettes";
import { useWordCloudPrefs } from "../../lib/wordcloud/prefs";
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
  const pool = useMemo((): { phrases: CloudPhrase[]; entryCount: number; hiddenCount: number } | null => {
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
    return { phrases: shuffle(extracted), entryCount: items.length, hiddenCount };
  }, [projects, standalone, projectFilter, contentFilter, prefs.hideUsedLyrics]);

  const scoped = projectFilter !== EVERYTHING;
  const isEmpty = loaded && (!pool || pool.phrases.length === 0);

  return (
    <div className="fixed inset-0 z-10 flex flex-col md:flex-row" style={{ background: palette.bg }}>
      {/* Stage — the canvas lands here in the next commit. A plain list for
          now, so the filters and the lyrics rule can be checked against
          readable output before the render gets harder to eyeball. */}
      <div className="flex-1 min-w-0 relative overflow-y-auto">
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
          <ul className="max-w-xl mx-auto px-6 py-10 flex flex-col gap-2">
            {pool.phrases.map((p, i) => (
              <li key={p.phrase + i} className="text-[14px] leading-[1.6]" style={{ fontFamily: SERIF, color: palette.ink }}>
                {p.phrase}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Panel */}
      <aside className="shrink-0 w-full md:w-[260px] max-h-[46%] md:max-h-none overflow-y-auto px-5 py-6 flex flex-col gap-4 border-t md:border-t-0 md:border-l"
        style={{ borderColor: palette.line }}>
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

        {/* Sense scan toggle + legend lands here in a later commit. */}

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

        {loaded && pool && (
          <div className="text-[11px] leading-[1.8] pt-2" style={{ fontFamily: MONO, color: palette.mist }}>
            <span style={{ color: palette.ink }}>{pool.phrases.length}</span> phrases from{" "}
            <span style={{ color: palette.ink }}>{pool.entryCount}</span> entries
            {pool.hiddenCount > 0 && (
              <><br /><span style={{ color: palette.ink }}>{pool.hiddenCount}</span> hidden</>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
