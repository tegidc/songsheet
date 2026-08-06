import { useState, useCallback, useEffect, useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { MONO, SERIF } from "../../data/constants";
import { buildSkeletonLyrics, pickFragmentGroup } from "../../lib/text/fragments";
import type { Section, Song } from "../../types";

export type InspirationMode = "fragments" | "form";
export const FRAGMENT_INTERVAL = 15000; // ms — auto-cycle interval
export function InspirationPanel({ song, onAddVerse }: { song: Song; onAddVerse: (lyrics: string) => void }) {
  const [mode,      setMode]      = useState<InspirationMode>("fragments");
  const [collapsed, setCollapsed] = useState(false);

  // ── Fragments ──────────────────────────────────────────────────────────────
  // Source: Notebook + OW + Big Idea + Story — deliberately NOT Production Notes
  const fragmentSource = useMemo(() => [
    song.generalNotes ?? "",
    song.bigIdea ?? "",
    song.story?.beginning ?? "",
    song.story?.middle ?? "",
    song.story?.end ?? "",
    ...(song.objectWritings ?? []).map(o => o.text),
  ].join(" "), [song.generalNotes, song.bigIdea, song.story, song.objectWritings]);

  const hasFragmentContent = fragmentSource.replace(/\s/g, "").length > 20;

  const [fragmentGroup, setFragmentGroup] = useState<string[]>([]);
  const [paused,        setPaused]        = useState(false);
  const [fading,        setFading]        = useState(false);

  const cycleFragments = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      setFragmentGroup(pickFragmentGroup(fragmentSource));
      setFading(false);
    }, 480);
  }, [fragmentSource]);

  // Seed on mount / when content first appears
  useEffect(() => {
    if (hasFragmentContent && fragmentGroup.length === 0)
      setFragmentGroup(pickFragmentGroup(fragmentSource));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasFragmentContent]);

  // Auto-cycle
  useEffect(() => {
    if (paused || !hasFragmentContent) return;
    const id = setInterval(cycleFragments, FRAGMENT_INTERVAL);
    return () => clearInterval(id);
  }, [paused, hasFragmentContent, cycleFragments]);

  // ── Form ───────────────────────────────────────────────────────────────────
  // Same source pool as fragments (OW + Notebook + Big Idea/Story)
  const [formSectionId, setFormSectionId] = useState("");
  const [skeleton,      setSkeleton]      = useState("");

  const effectiveFormSection = useMemo(() => {
    const byId = song.sections.find(s => s.id === formSectionId);
    return byId ?? song.sections.find(s => (s.lyrics ?? "").trim()) ?? song.sections[0] ?? null;
  }, [formSectionId, song.sections]);

  const generateSkeleton = useCallback(() => {
    setSkeleton(buildSkeletonLyrics(effectiveFormSection, fragmentSource));
  }, [effectiveFormSection, fragmentSource]);

  const tabs: { id: InspirationMode; label: string }[] = [
    { id: "fragments", label: "Fragments" },
    { id: "form",      label: "Form"      },
  ];

  const empty = (msg: string) => (
    <p className="text-[12px] text-muted-foreground/50 italic text-center py-4 px-2 leading-relaxed"
      style={{ fontFamily: SERIF }}>{msg}</p>
  );

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
          Inspiration
        </span>
        {mode === "fragments" && !collapsed && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPaused(p => !p)} title={paused ? "Resume" : "Pause"}
              className="text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors leading-none"
              style={{ fontFamily: MONO }}>{paused ? "▶" : "⏸"}</button>
            <button onClick={cycleFragments} title="Next fragment"
              className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors leading-none"
              style={{ fontFamily: MONO }}>↻</button>
          </div>
        )}
        <button onClick={() => setCollapsed(c => !c)}
          className="text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors ml-2"
          title={collapsed ? "Expand" : "Collapse"}>
          <ChevronDown size={11} className={`transition-transform duration-150 ${collapsed ? "-rotate-90" : "rotate-0"}`} />
        </button>
      </div>

      {!collapsed && <>
      {/* Mode tabs */}
      <div className="flex border-b border-border">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setMode(t.id)}
            className={`flex-1 py-1.5 text-[10px] transition-colors ${mode === t.id ? "text-foreground border-b-2 border-foreground" : "text-muted-foreground hover:text-foreground"}`}
            style={{ fontFamily: MONO, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-3 min-h-[180px]">

        {/* Fragments — auto-cycling ambient display */}
        {mode === "fragments" && (
          !hasFragmentContent
            ? empty("Write in Object Writing, Notebook, or your Big Idea to see fragments here.")
            : (
              <div className={`flex flex-col items-center justify-center min-h-[150px] gap-2.5 transition-opacity duration-500 ${fading ? "opacity-0" : "opacity-100"}`}>
                {fragmentGroup.length === 0 ? (
                  <span className="text-[12px] text-muted-foreground/30 italic" style={{ fontFamily: SERIF }}>…</span>
                ) : fragmentGroup.map((f, i) => (
                  <span key={`${i}-${f}`}
                    className={
                      fragmentGroup.length === 1 ? "text-[20px] text-foreground/85 italic leading-snug" :
                      i === 0                    ? "text-[16px] text-foreground/80 italic leading-snug" :
                      i === 1                    ? "text-[13px] text-muted-foreground/65 italic leading-snug" :
                                                   "text-[11px] text-muted-foreground/45 italic leading-snug"
                    }
                    style={{ fontFamily: SERIF, textAlign: "center", maxWidth: "92%" }}>
                    {f}
                  </span>
                ))}
                {!paused && fragmentGroup.length > 0 && (
                  <span className="mt-2 text-[8px] text-muted-foreground/20 tracking-widest" style={{ fontFamily: MONO }}>
                    · · ·
                  </span>
                )}
              </div>
            )
        )}

        {/* Form — section-aware blank-verse skeleton generator */}
        {mode === "form" && (
          <div className="flex flex-col gap-3">
            {/* Section selector + re-roll */}
            <div className="flex items-center gap-2">
              <select
                value={effectiveFormSection?.id ?? ""}
                onChange={e => { setFormSectionId(e.target.value); setSkeleton(""); }}
                className="flex-1 min-w-0 text-[10px] bg-transparent border border-border/50 rounded-sm px-1.5 py-1 text-foreground/70 focus:outline-none cursor-pointer"
                style={{ fontFamily: MONO }}>
                {song.sections.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              {skeleton && (
                <button onClick={generateSkeleton} title="Re-roll skeleton"
                  className="text-[12px] text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 leading-none"
                  style={{ fontFamily: MONO }}>↻</button>
              )}
            </div>

            {song.sections.length === 0 ? (
              empty("Add sections in Lyrics first.")
            ) : !skeleton ? (
              <div className="flex flex-col items-center gap-2.5 py-3">
                <p className="text-[12px] text-muted-foreground/50 italic text-center leading-relaxed" style={{ fontFamily: SERIF }}>
                  Mirror {effectiveFormSection?.label ?? "a section"}'s shape — mostly blank, a few of your own words dropped in.
                </p>
                <button onClick={generateSkeleton}
                  className="text-[11px] px-3 py-1.5 border border-border/60 rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                  style={{ fontFamily: MONO }}>
                  Generate skeleton
                </button>
              </div>
            ) : (
              <>
                {/* Skeleton preview */}
                <div className="bg-muted/20 rounded-sm border border-border/40 px-3 py-3 space-y-0.5">
                  {skeleton.split("\n").map((line, i) => (
                    <div key={i} className="text-[11px] leading-[1.85] text-foreground/60" style={{ fontFamily: MONO }}>
                      {line}
                    </div>
                  ))}
                </div>
                {/* Insert button */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-muted-foreground/35 italic" style={{ fontFamily: SERIF }}>
                    based on {effectiveFormSection?.label ?? "section"} shape
                  </span>
                  <button onClick={() => { onAddVerse(skeleton); setSkeleton(""); }}
                    className="text-[10px] px-3 py-1 border border-border/60 rounded-sm text-accent hover:text-foreground hover:border-foreground/30 transition-colors"
                    style={{ fontFamily: MONO }}>
                    Gaps ↓
                  </button>
                </div>
              </>
            )}
          </div>
        )}

      </div>
      </>}
    </div>
  );
}

