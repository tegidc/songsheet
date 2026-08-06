import { useState, useRef, useEffect, useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { StandaloneOWWindow } from "../ow/StandaloneOWWindow";
import { MONO, SERIF, TIMER_OPTS } from "../../data/constants";
import { formatRelativeTime } from "../../format";
import { owLabel } from "../../lib/text/owLabel";
import type { AudioNote, Project, ProjectStatus, Song, StandaloneOW, Tab } from "../../types";

export const STATUS_DOT: Record<ProjectStatus, string> = {
  working:  "bg-accent",
  finished: "bg-emerald-500/70",
  archived: "bg-muted-foreground/30",
};
export const STATUS_LABEL: Record<ProjectStatus, string> = {
  working:  "Working",
  finished: "Finished",
  archived: "Archived",
};

export function ProjectsSidebar({ onLoad, onNew, onSignOut, currentProjectId, onCreateSongFromOW, onAddOWToSong, owRefreshKey, mobile = false, onClose }: {
  onLoad: (id: string, song: Song, name: string, createdAt?: string | null) => void;
  onNew: () => void;
  onSignOut: () => void;
  currentProjectId: string | null;
  onCreateSongFromOW: (seedWord: string, body: string) => void;
  onAddOWToSong?: (seedWord: string | null, body: string, sourceId: string) => void;
  owRefreshKey: number;
  mobile?: boolean;
  onClose?: () => void;
}) {
  const [projects, setProjects]         = useState<Project[]>([]);
  const [loading, setLoading]           = useState(true);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [open, setOpen]                 = useState<Record<ProjectStatus, boolean>>({
    working: true, finished: false, archived: false,
  });
  const [standaloneOWs, setStandaloneOWs] = useState<StandaloneOW[]>([]);
  const [owOpen, setOwOpen]               = useState(false);
  const [owSession, setOwSession]         = useState(false);
  const [owDetail, setOwDetail]           = useState<StandaloneOW | null>(null);

  useEffect(() => {
    setLoading(true);
    supabase.from("projects")
      .select("id, name, updated_at, status")
      .order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error("Fetch projects failed:", error.message);
        setProjects((data as Project[]) ?? []);
        setLoading(false);
      });
  }, [refreshKey]);

  useEffect(() => { setRefreshKey(k => k + 1); }, [currentProjectId]);

  // Fetch standalone OW entries (re-runs when owRefreshKey bumps — e.g. saved from header button)
  useEffect(() => {
    supabase.from("standalone_ow")
      .select("id, seed_word, body, written_at, origin_song_id")
      .order("written_at", { ascending: false })
      .then(({ data }) => setStandaloneOWs((data as StandaloneOW[]) ?? []));
  }, [owRefreshKey]);

  // Word cloud frequency map
  const owWordFreq = useMemo(() => {
    const freq: Record<string, number> = {};
    standaloneOWs.forEach(e => {
      const w = owLabel(e.seed_word, e.body).toLowerCase().trim();
      if (!w) return;
      freq[w] = (freq[w] ?? 0) + 1;
    });
    return freq;
  }, [standaloneOWs]);

  const owWordsSorted = useMemo(() => {
    const words = Object.entries(owWordFreq);
    const maxFreq = Math.max(1, ...words.map(([, f]) => f));
    return words.map(([word, freq]) => ({ word, freq, size: 10 + Math.round((freq / maxFreq) * 6) }))
      .sort((a, b) => b.freq - a.freq);
  }, [owWordFreq]);

  const load = async (id: string) => {
    const { data } = await supabase.from("projects").select("data, name, created_at").eq("id", id).single();
    if (data) onLoad(id, data.data as Song, data.name as string, data.created_at as string | null);
  };

  const del = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    // Remove any audio note files from Storage first
    const { data: proj } = await supabase.from("projects").select("data").eq("id", id).single();
    const audioNotes: AudioNote[] = (proj?.data as Song)?.audioNotes ?? [];
    if (audioNotes.length) {
      await supabase.storage.from("audio-notes").remove(audioNotes.map(n => n.storagePath));
    }
    await supabase.from("projects").delete().eq("id", id);
    setProjects(p => p.filter(pr => pr.id !== id));
  };

  const setStatus = async (id: string, next: ProjectStatus) => {
    await supabase.from("projects").update({ status: next }).eq("id", id);
    setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: next } : pr));
    setOpen(o => ({ ...o, [next]: true }));
  };

  const renamePrj = async (id: string, name: string) => {
    if (!name.trim()) return;
    await supabase.from("projects").update({ name: name.trim() }).eq("id", id);
    setProjects(p => p.map(pr => pr.id === id ? { ...pr, name: name.trim() } : pr));
  };

  const active = currentProjectId ? projects.find(p => p.id === currentProjectId) : null;
  const others = projects.filter(p => p.id !== currentProjectId);
  const groups: ProjectStatus[] = ["working", "finished", "archived"];

  /* ── Sub-components ── */
  const StatusPicker = ({ id, current }: { id: string; current: ProjectStatus }) => (
    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
      {(["working","finished","archived"] as ProjectStatus[]).map(s => (
        <button key={s} onClick={e => { e.stopPropagation(); setStatus(id, s); }}
          className="flex items-center justify-center w-3.5 h-3.5 rounded-full transition-all"
          title={STATUS_LABEL[s]}>
          <span className={`rounded-full transition-all ${
            s === current
              ? `w-2.5 h-2.5 ${STATUS_DOT[s]} ring-1 ring-offset-1 ring-foreground/20`
              : `w-1.5 h-1.5 ${STATUS_DOT[s]} opacity-35 hover:opacity-70`
          }`} />
        </button>
      ))}
    </div>
  );

  const ProjectRow = ({ p }: { p: Project }) => {
    const [editing, setEditing] = useState(false);
    const [nameVal, setNameVal] = useState(p.name);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

    const commitRename = () => {
      setEditing(false);
      renamePrj(p.id, nameVal || p.name);
    };

    return (
      <div onClick={() => !editing && load(p.id)}
        className="w-full text-left px-3 py-2 border-b border-border/30 hover:bg-foreground/[0.04] transition-colors group cursor-pointer">
        <div className="flex items-center gap-1 min-w-0">
          {editing ? (
            <input ref={inputRef} value={nameVal}
              onChange={e => setNameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") { setEditing(false); setNameVal(p.name); } }}
              onClick={e => e.stopPropagation()}
              className="flex-1 min-w-0 bg-transparent border-b border-accent text-[10px] text-foreground focus:outline-none pb-px"
              style={{ fontFamily: MONO }} />
          ) : (
            <span className="text-[10px] text-foreground/60 truncate leading-snug flex-1 min-w-0"
              style={{ fontFamily: MONO }}>{p.name}</span>
          )}
          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={e => { e.stopPropagation(); setEditing(true); }}
              className="text-muted-foreground/40 hover:text-foreground transition-colors p-0.5"
              title="Rename">
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8.5 1.5a1.414 1.414 0 0 1 2 2L3.5 10.5l-3 .5.5-3z"/>
              </svg>
            </button>
            <StatusPicker id={p.id} current={p.status ?? "working"} />
            <button onClick={e => del(p.id, e)}
              className="text-muted-foreground/40 hover:text-destructive transition-colors p-0.5">
              <X size={9} />
            </button>
          </div>
        </div>
        <span className="text-[9px] text-muted-foreground/40" style={{ fontFamily: MONO }}>
          {formatRelativeTime(p.updated_at)}
        </span>
      </div>
    );
  };

  return (
    <aside className={mobile
        ? "w-full max-w-[85vw] h-full border-r border-border flex flex-col bg-background shadow-2xl"
        : "w-64 shrink-0 border-r border-border flex flex-col bg-foreground/[0.025]"}
      style={mobile ? undefined : { minHeight: "calc(100vh - 49px)" }}>

      {/* Header */}
      <div className="px-3 py-2 border-b border-border/60 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/70"
          style={{ fontFamily: MONO }}>Projects</span>
        {mobile && (
          <button onClick={onClose} className="text-muted-foreground/60 hover:text-foreground transition-colors p-1 -mr-1" title="Close">
            <X size={14} />
          </button>
        )}
      </div>

      {/* New song — top */}
      <div className="px-3 py-2 border-b border-border/40">
        <button onClick={onNew}
          className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
          style={{ fontFamily: MONO }}>
          + New song
        </button>
      </div>

      {/* Project list */}
      <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>

        {/* Active project pinned */}
        {active && (
          <div className="px-3 py-2.5 border-b border-border/50 bg-foreground/[0.04] group">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[active.status ?? "working"]}`} />
              <span className="text-[10px] text-foreground/80 truncate leading-tight flex-1 min-w-0"
                style={{ fontFamily: MONO }}>{active.name}</span>
              <span className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <StatusPicker id={active.id} current={active.status ?? "working"} />
              </span>
            </div>
            <span className="text-[9px] text-muted-foreground/50 ml-3" style={{ fontFamily: MONO }}>
              {formatRelativeTime(active.updated_at)}
            </span>
          </div>
        )}

        {loading ? (
          <div className="px-3 py-6 text-[10px] text-muted-foreground/50 text-center"
            style={{ fontFamily: MONO }}>Loading…</div>
        ) : others.length === 0 && !active ? (
          <div className="px-3 py-6 text-[10px] text-muted-foreground/40 text-center italic"
            style={{ fontFamily: MONO }}>Start writing — your song saves automatically</div>
        ) : (
          groups.map(status => {
            const group = others.filter(p => (p.status ?? "working") === status);
            if (group.length === 0) return null;
            const isOpen = open[status];
            return (
              <div key={status} className="border-b border-border/30 last:border-b-0">
                <button onClick={() => setOpen(o => ({ ...o, [status]: !o[status] }))}
                  className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-foreground/[0.03] transition-colors">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                    <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"
                      style={{ fontFamily: MONO }}>
                      {STATUS_LABEL[status]}{!isOpen && ` (${group.length})`}
                    </span>
                  </div>
                  <ChevronDown size={9}
                    className={`text-muted-foreground/40 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </button>
                {isOpen && group.map(p => <ProjectRow key={p.id} p={p} />)}
              </div>
            );
          })
        )}
      </div>

      {/* ── Object Writing Sessions ── */}
      <div className="border-t border-border/30">
        <button onClick={() => setOwOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-foreground/[0.03] transition-colors">
          <div className="flex items-center gap-1.5">
            <span className="text-[8px] text-accent/60">✦</span>
            <span className="text-[9px] uppercase tracking-[0.12em] text-muted-foreground/60"
              style={{ fontFamily: MONO }}>
              Object Writing{standaloneOWs.length > 0 ? ` (${standaloneOWs.length})` : ""}
            </span>
          </div>
          <ChevronDown size={9}
            className={`text-muted-foreground/40 transition-transform ${owOpen ? "rotate-180" : ""}`} />
        </button>

        {owOpen && (
          <div className="px-3 pb-3">
            <button onClick={() => setOwSession(true)}
              className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors mb-3 block"
              style={{ fontFamily: MONO }}>
              + New session
            </button>

            {/* Word cloud */}
            {owWordsSorted.length > 0 && (
              <div className="flex flex-wrap gap-x-2 gap-y-1.5">
                {owWordsSorted.map(({ word, size }) => {
                  const entry = standaloneOWs.find(e => owLabel(e.seed_word, e.body).toLowerCase().trim() === word);
                  return (
                    <button key={word}
                      onClick={() => entry && setOwDetail(entry)}
                      className="text-muted-foreground/50 hover:text-accent transition-colors italic leading-tight"
                      style={{ fontFamily: SERIF, fontSize: size }}>
                      {word}
                    </button>
                  );
                })}
              </div>
            )}

            {standaloneOWs.length === 0 && (
              <p className="text-[10px] text-muted-foreground/30 italic" style={{ fontFamily: SERIF }}>
                Sessions will appear here as a word cloud.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Sign out — bottom, muted */}
      <div className="px-3 py-3 border-t border-border/30">
        <button onClick={onSignOut}
          className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
          style={{ fontFamily: MONO }}>
          Sign out
        </button>
      </div>

      {/* New standalone writing */}
      {owSession && (
        <StandaloneOWWindow
          timerStart={TIMER_OPTS[3]}
          onClose={() => setOwSession(false)}
          onSaved={entry => entry && setStandaloneOWs(prev => [entry, ...prev])}
        />
      )}

      {/* Existing standalone writing */}
      {owDetail && (
        <StandaloneOWWindow
          key={owDetail.id}
          entry={owDetail}
          onClose={() => setOwDetail(null)}
          onUpdated={row => setStandaloneOWs(prev => prev.map(e => e.id === row.id ? { ...e, ...row } : e))}
          onCreateSong={(seedWord, body) => { onCreateSongFromOW(seedWord, body); setOwDetail(null); }}
          onAddToSong={onAddOWToSong}
        />
      )}
    </aside>
  );
}

