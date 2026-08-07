import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { Plus, Music, Music2, AlertCircle, ChevronDown, FolderOpen, LogIn } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { useIsMobile } from "./components/ui/use-mobile";
import { AuthModal } from "../components/auth/AuthModal";
import { AnalyseChordsPanel } from "../components/chords/AnalyseChordsPanel";
import { ChordRowGrid } from "../components/chords/ChordRowGrid";
import { MobileChordSection } from "../components/chords/MobileChordSection";
import { NotebookSection } from "../components/create/NotebookSection";
import { ProductionSection } from "../components/create/ProductionSection";
import { StoryAndBigIdea } from "../components/create/StoryAndBigIdea";
import { VoiceNotesSection } from "../components/create/VoiceNotesSection";
import { FinalSectionView } from "../components/final/FinalSectionView";
import { LyricBlock } from "../components/lyrics/LyricBlock";
import { MobileLyricTools } from "../components/lyrics/MobileLyricTools";
import { FloatingOWButton } from "../components/ow/FloatingOWButton";
import { ObjectWritingSection } from "../components/ow/ObjectWritingSection";
import { OWCloudPicker } from "../components/ow/OWCloudPicker";
import { OWPillRow } from "../components/ow/OWPillRow";
import { OWWindow } from "../components/ow/OWWindow";
import { StandaloneOWWindow } from "../components/ow/StandaloneOWWindow";
import { ConfirmDialog } from "../components/common/ConfirmDialog";
import { ProjectsSidebar } from "../components/sidebar/ProjectsSidebar";
import { InspirationPanel } from "../components/tools/InspirationPanel";
import { RhymePanel } from "../components/tools/RhymePanel";
import { ThesaurusPanel } from "../components/tools/ThesaurusPanel";
import { FS, MONO, SANS, SCOL, SDEFS, SERIF, TIMER_OPTS, isEditorialBar } from "../data/constants";
import { TSIGS } from "../data/music";
import { newProjectPrefix, parseProjectPrefix, prefixFromDate, projectNameWithPrefix, uid } from "../format";
import { applyCloudDeleteToEntries, deleteStandaloneOW, fetchOWRow, saveAsNew, updateOriginal } from "../lib/owCloud";
import { owLabel } from "../lib/text/owLabel";
import { loadOWPool } from "../lib/text/owPool";
import { useSelectedWord } from "../lib/useSelectedWord";
import { buildChordSuggestions, parseChord } from "../lib/theory/chords";
import type { IdeaResult } from "../lib/theory/ideas";
import { generateBridgeIdea, generateIdea } from "../lib/theory/ideas";
import { detectKey, formatDetectedKey, parseDeclaredKey } from "../lib/theory/key";
import { distributeChords, sortCP, syncBarsToPositions } from "../lib/theory/layout";
import { EMPTY_SONG, isPristineSong, makeEmptySong, makeSection, normalizeSection, renumberSections } from "../sections";
import type { NbEntry, OWEntry, Section, SectionType, Song, Tab } from "../types";

export default function App() {
  const isMobile = useIsMobile();
  // Desktop only: on touch, selecting text raises the OS copy/paste bar and
  // needs a different trigger (Phase 5). The plain button still works there.
  const selectedWord = useSelectedWord(!isMobile);
  const [song, setSong]               = useState<Song>(EMPTY_SONG);
  const [tab, setTab]                 = useState<Tab>("notes");
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [nashville, setNashville]     = useState(false);
  const [showChordSuggest, setShowChordSuggest] = useState(false);
  const [chordsClipboard, setChordsClipboard] = useState<string[] | null>(null);
  const [idea, setIdea]               = useState<IdeaResult | null>(null);
  const [ideaUndo, setIdeaUndo]       = useState<{ newSectionId: string } | null>(null);
  const [bridge, setBridge]           = useState<IdeaResult | null>(null);
  const [bridgeUndo, setBridgeUndo]   = useState<{ sectionId: string; bars: string[] } | null>(null);
  const [user, setUser]               = useState<User | null>(null);
  const [authModal, setAuthModal]     = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<"idle"|"saving"|"saved"|"error">("idle");
  const [lyricSelection,   setLyricSelection]   = useState<{ word: string; seq: number } | null>(null);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [showGlobalOW, setShowGlobalOW]         = useState(false);
  const [owRefreshKey, setOwRefreshKey]         = useState(0);
  // The in-song writing currently open in a window, if any. `committed` says
  // whether it has made it into song.objectWritings yet (see openOW below).
  const [owWindow, setOwWindow] = useState<{ entry: OWEntry; timer: number | null; committed: boolean } | null>(null);
  const owWindowRef = useRef<typeof owWindow>(null);
  // "Save to cloud" on a loose pill: the pending Update-original confirmation
  // (carrying what would be overwritten) and the one-line result afterwards.
  const [owCloudConfirm, setOwCloudConfirm] = useState<{ sourceId: string; detail: string } | null>(null);
  const [owCloudMsg, setOwCloudMsg] = useState("");
  const [showOWPicker, setShowOWPicker] = useState(false);
  const autoSaveTimer  = useRef<ReturnType<typeof setTimeout>>();
  const forceSaveTimer = useRef<ReturnType<typeof setInterval>>();
  const pendingRef     = useRef(false);
  // The YYMMDD prefix of the currently open project's name — set on load or on
  // first insert, then reused on every subsequent save so it never drifts to
  // today's date. Null only when no project has been loaded/created yet.
  const currentProjectPrefixRef = useRef<string | null>(null);
  // Set right before setSong() in loadProject/newSong — where the song is being
  // *replaced wholesale* with existing-or-blank content rather than edited — so
  // the debounce effect can tell that apart from a real user edit and skip
  // scheduling a pointless save. Not set in createSongFromOW: that call fills a
  // brand-new song with real content the user asked to bring in, which should
  // save like any other edit.
  const suppressNextAutosaveRef = useRef(false);
  // Refs so doSave always reads current values without stale closures
  const songRef              = useRef(song);
  const userRef              = useRef(user);
  const currentProjectIdRef  = useRef(currentProjectId);
  useEffect(() => { songRef.current = song; }, [song]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => { currentProjectIdRef.current = currentProjectId; }, [currentProjectId]);

  const tapTimes = useRef<number[]>([]);
  const tapTempo = () => {
    const now = Date.now();
    if (tapTimes.current.length && now - tapTimes.current[tapTimes.current.length - 1] > 3000)
      tapTimes.current = [];
    tapTimes.current.push(now);
    if (tapTimes.current.length > 1) {
      const gaps = tapTimes.current.slice(1).map((t, i) => t - tapTimes.current[i]);
      const bpm = Math.round(60000 / (gaps.reduce((a, b) => a + b) / gaps.length));
      updateSong({ tempo: String(bpm) });
    }
  };

  const charRef = useRef<HTMLSpanElement>(null);
  const [charWidth, setCharWidth] = useState(8.4);
  useEffect(() => {
    if (charRef.current) setCharWidth(charRef.current.getBoundingClientRect().width);
  }, []);

  // Seed OW word pool from Datamuse on mount (fire-and-forget)
  useEffect(() => { loadOWPool(); }, []);

  // Auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => setUser(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  // Signing out clears the sheet as well as the session. Leaving the previous
  // account's song on screen is wrong on its own, and it would also block the
  // auto-open above from firing if someone signed back in without reloading.
  const signOut = async () => {
    await supabase.auth.signOut();
    currentProjectPrefixRef.current = null;
    suppressNextAutosaveRef.current = true;
    setSong(makeEmptySong());
    setCurrentProjectId(null);
    setShowSidebar(false);
  };

  // Mirror writings composed inside this song ("linked" entries) into standalone_ow,
  // so they stop being invisible to the cloud. Runs alongside the song's own autosave —
  // an entry with a cloudId gets updated, one without gets inserted and stamped with the
  // new row's id; if the update hits zero rows (the cloud row was deleted separately) we
  // clear cloudId and insert fresh so the pill re-links rather than staying orphaned.
  const syncObjectWritingsToCloud = useCallback(async (entries: OWEntry[], userId: string, projectId: string | null) => {
    for (const entry of entries) {
      if (entry.imported) continue;
      if (!entry.text.trim()) continue;
      const seedWord = entry.seedWord?.trim() || null;

      if (!entry.cloudId) {
        // Entries written before this sync existed have no `imported` flag either way —
        // if a standalone_ow row with identical body already exists, this is almost
        // certainly a pre-Phase-2 import, not a new writing. Adopt it as loose instead
        // of inserting a duplicate.
        const { data: existing, error: findError } = await supabase.from("standalone_ow")
          .select("id")
          .eq("user_id", userId)
          .eq("body", entry.text)
          .limit(1);
        if (!findError && existing && existing.length > 0) {
          const sourceId = existing[0].id;
          setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).map(e => e.id === entry.id ? { ...e, imported: true, sourceId } : e) }));
          continue;
        }

        const { data, error } = await supabase.from("standalone_ow")
          .insert({ user_id: userId, seed_word: seedWord, body: entry.text, origin_song_id: projectId })
          .select("id").single();
        if (!error && data) {
          const cloudId = data.id;
          setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).map(e => e.id === entry.id ? { ...e, cloudId } : e) }));
        }
        continue;
      }

      const { data: updated, error } = await supabase.from("standalone_ow")
        .update({ seed_word: seedWord, body: entry.text })
        .eq("id", entry.cloudId)
        .select("id");
      if (!error && updated && updated.length === 0) {
        const { data, error: insertError } = await supabase.from("standalone_ow")
          .insert({ user_id: userId, seed_word: seedWord, body: entry.text, origin_song_id: projectId })
          .select("id").single();
        if (!insertError && data) {
          const cloudId = data.id;
          setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).map(e => e.id === entry.id ? { ...e, cloudId } : e) }));
        }
      }
    }
  }, []);

  // Unified save — handles both first-create (insert) and subsequent updates
  const doSave = useCallback(async () => {
    const u   = userRef.current;
    const s   = songRef.current;
    const pid = currentProjectIdRef.current;
    if (!u) return;
    pendingRef.current = false;
    let effectivePid = pid;
    if (pid) {
      setAutoSaveState("saving");
      // Reuse the existing prefix — it records when the song was started and
      // must never be regenerated from today's date on an update.
      const prefix = currentProjectPrefixRef.current ?? newProjectPrefix();
      const { error } = await supabase.from("projects")
        .update({ name: projectNameWithPrefix(prefix, s.title), data: s })
        .eq("id", pid);
      if (error) {
        pendingRef.current = true;
        console.error("Auto-save failed:", error.message);
        setAutoSaveState("error");
        setTimeout(() => setAutoSaveState("idle"), 3000);
      } else {
        setAutoSaveState("saved");
        setTimeout(() => setAutoSaveState("idle"), 2000);
      }
    } else {
      // First save — silent, no indicator. A brand-new project mints today's prefix.
      const prefix = newProjectPrefix();
      const { data, error } = await supabase.from("projects")
        .insert({ user_id: u.id, name: projectNameWithPrefix(prefix, s.title), data: s })
        .select("id").single();
      if (error) {
        pendingRef.current = true;
        console.error("Auto-create project failed:", error.message);
      } else if (data) {
        currentProjectPrefixRef.current = prefix;
        setCurrentProjectId(data.id);
        effectivePid = data.id;
      }
    }
    syncObjectWritingsToCloud(s.objectWritings ?? [], u.id, effectivePid);
  }, [syncObjectWritingsToCloud]);

  // Debounce trigger (2s after last edit). Loading/replacing the song (loadProject,
  // newSong, createSongFromOW) changes `song` just like an edit would, so those set
  // suppressNextAutosaveRef first — this effect consumes that flag and skips
  // scheduling once, instead of treating "song object changed" as "user typed
  // something". Depends on `!!user` rather than `user` itself so a token refresh
  // (a new user object, same signed-in state) can't re-arm the timer on its own.
  useEffect(() => {
    if (!user) return;
    if (suppressNextAutosaveRef.current) {
      suppressNextAutosaveRef.current = false;
      return;
    }
    const hasMeaningful = song.title.trim() ||
      song.sections.some(s => (s.lyrics ?? "").trim() || (s.chordBars ?? []).some(b => b.trim())) ||
      (song.objectWritings ?? []).some(e => !e.imported && e.text.trim());
    if (!hasMeaningful) return;
    pendingRef.current = true;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(doSave, 2000);
    return () => clearTimeout(autoSaveTimer.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song, !!user]);

  // Force-save every 30s if there are pending changes
  useEffect(() => {
    if (!user) return;
    forceSaveTimer.current = setInterval(() => {
      if (pendingRef.current) doSave();
    }, 30000);
    return () => clearInterval(forceSaveTimer.current);
  }, [user, doSave]);

  // Leaving mid-debounce shouldn't cost the last edits — an object writing is
  // saved from its first keystroke, so a hidden tab must flush rather than wait
  // out the 2s timer. Gated on pendingRef, which only the debounce effect sets,
  // so this can't write for a song the user merely opened.
  useEffect(() => {
    if (!user) return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && pendingRef.current) {
        clearTimeout(autoSaveTimer.current);
        doSave();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [user, doSave]);

  // Section management
  const updateSong = useCallback((patch: Partial<Song>) => setSong(p => ({ ...p, ...patch })), []);

  const updateSection = useCallback((id: string, patch: Partial<Section>) => {
    setSong(p => ({
      ...p,
      sections: p.sections.map(s => {
        if (s.id !== id) return s;
        const merged = { ...s, ...patch };
        if (patch.chordBars) merged.chordPositions = syncBarsToPositions(patch.chordBars, s.chordBars ?? [], s.chordPositions ?? [], merged.lyrics ?? "");
        return merged;
      }),
    }));
  }, []);

  const addSection = (type: SectionType) => {
    setSong(p => {
      const raw = [...p.sections, makeSection(type, p.sections.filter(s => s.type === type).length + 1)];
      return { ...p, sections: renumberSections(raw, p.sectionNaming) };
    });
  };

  // Alt+key shortcuts to add sections (chords tab only, not when typing in an input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || e.metaKey || e.ctrlKey) return;
      if (tab !== "chords") return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const def = SDEFS.find(d => d.k === e.key.toLowerCase());
      if (def) { e.preventDefault(); addSection(def.v); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tab, addSection]);

  const dupSection = (id: string) => {
    setSong(p => {
      const idx = p.sections.findIndex(s => s.id === id);
      if (idx === -1) return p;
      const orig = p.sections[idx];
      const copy: Section = {
        ...orig, id: uid(),
        label: orig.label, shortLabel: orig.shortLabel, // renumber will fix
        chordBars: [...orig.chordBars],
        chordPositions: (orig.chordPositions ?? []).map(cp => ({ ...cp, id: uid() })),
      };
      const next = [...p.sections]; next.splice(idx + 1, 0, copy);
      return { ...p, sections: renumberSections(next, p.sectionNaming) };
    });
  };

  const delSection = (id: string) => setSong(p => {
    const filtered = p.sections.filter(s => s.id !== id);
    return { ...p, sections: renumberSections(filtered, p.sectionNaming) };
  });

  const moveSection = (id: string, dir: -1 | 1) => {
    setSong(p => {
      const secs = [...p.sections];
      const i = secs.findIndex(s => s.id === id);
      const j = i + dir;
      if (j < 0 || j >= secs.length) return p;
      [secs[i], secs[j]] = [secs[j], secs[i]];
      return { ...p, sections: renumberSections(secs, p.sectionNaming) };
    });
  };

  const toggleNaming = (type: SectionType) => {
    setSong(p => {
      const current = p.sectionNaming[type] ?? "number";
      const naming = { ...p.sectionNaming, [type]: current === "number" ? "letter" : "number" } as Partial<Record<SectionType, "number"|"letter">>;
      return { ...p, sectionNaming: naming, sections: renumberSections(p.sections, naming) };
    });
  };

  // A writing opened from inside the song. While it is empty it lives only
  // here, as a draft — it is appended to song.objectWritings by the keystroke
  // that gives it text, so opening a window and closing it again leaves the
  // song (and its updated_at) untouched.
  const openOW = useCallback((entry: OWEntry, timer: number | null, committed: boolean) => {
    setOwCloudMsg("");
    owWindowRef.current = { entry, timer, committed };
    setOwWindow(owWindowRef.current);
  }, []);

  // Patch one committed entry in place, keeping the open window's copy in step.
  const patchOWEntry = useCallback((id: string, patch: Partial<OWEntry>) => {
    const w = owWindowRef.current;
    if (w && w.entry.id === id) {
      owWindowRef.current = { ...w, entry: { ...w.entry, ...patch } };
      setOwWindow(owWindowRef.current);
    }
    setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).map(e => e.id === id ? { ...e, ...patch } : e) }));
  }, []);

  // Removing a pill takes the writing out of *this song* and nothing else —
  // true for both kinds. standalone_ow is never touched from here; the only
  // place a cloud row can be deleted is the control inside its own window.
  const deleteOWEntry = useCallback((id: string) => {
    setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).filter(e => e.id !== id) }));
    if (owWindowRef.current?.entry.id === id) { owWindowRef.current = null; setOwWindow(null); }
  }, []);

  // A writing brought in from the cloud lands loose: imported, carrying its
  // provenance, with no cloudId — so it never syncs back and the two copies are
  // free to diverge. The single path for every route in (picker, sidebar).
  const importOWFromCloud = useCallback((seedWord: string | null, body: string, sourceId: string) => {
    setSong(p => ({
      ...p,
      objectWritings: [...(p.objectWritings ?? []), {
        id: uid(), text: body, seedWord: seedWord ?? undefined,
        savedAt: new Date().toISOString(), imported: true, sourceId,
      }],
    }));
  }, []);

  // Deleting a cloud writing rewrites every song holding it, in the database.
  // The song open right now is also held in memory, and its next autosave would
  // put the old objectWritings straight back — so patch it here with the same
  // rewrite rather than leaving the two to disagree.
  const deleteCloudOW = useCallback(async (id: string, alsoFromSongs: boolean) => {
    setSong(p => {
      const entries = p.objectWritings ?? [];
      // Untouched songs must stay untouched — rewriting unconditionally would
      // dirty the open song and schedule a save it never earned.
      if (!entries.some(e => e.cloudId === id || e.sourceId === id)) return p;
      return { ...p, objectWritings: applyCloudDeleteToEntries(entries, id, alsoFromSongs) };
    });
    const w = owWindowRef.current;
    if (w && (w.entry.cloudId === id || w.entry.sourceId === id)) { owWindowRef.current = null; setOwWindow(null); }
    await deleteStandaloneOW(id, alsoFromSongs);
    setOwRefreshKey(k => k + 1);
  }, []);

  // ── Save to cloud, offered on loose pills only (linked ones already sync) ──

  const owSaveAsNew = useCallback(async (message: string) => {
    const w = owWindowRef.current;
    if (!w) return;
    const row = await saveAsNew(w.entry.seedWord?.trim() || null, w.entry.text, currentProjectIdRef.current);
    if (!row) { setOwCloudMsg("Save failed."); return; }
    // A fork, not a link: the entry stays loose. Provenance moves to the row
    // that now exists, so a later "Update original" has something to hit.
    patchOWEntry(w.entry.id, { sourceId: row.id });
    setOwCloudMsg(message);
    setOwRefreshKey(k => k + 1);
  }, [patchOWEntry]);

  // Without a sourceId, or with an original that has since been deleted, there
  // is nothing to overwrite — fall back to inserting rather than failing, and
  // say which happened.
  const owUpdateOriginal = useCallback(async () => {
    const w = owWindowRef.current;
    if (!w) return;
    const sourceId = w.entry.sourceId;
    if (!sourceId) { await owSaveAsNew("No original to update — saved as a new writing."); return; }
    const row = await fetchOWRow(sourceId);
    if (!row) { await owSaveAsNew("The original was deleted — saved as a new writing."); return; }
    setOwCloudConfirm({
      sourceId,
      detail: `${owLabel(row.seed_word, row.body) || "Object Writing"} · ${new Date(row.written_at).toLocaleDateString()}`,
    });
  }, [owSaveAsNew]);

  const owConfirmUpdateOriginal = useCallback(async () => {
    const w = owWindowRef.current;
    const pending = owCloudConfirm;
    setOwCloudConfirm(null);
    if (!w || !pending) return;
    const ok = await updateOriginal(pending.sourceId, w.entry.seedWord?.trim() || null, w.entry.text);
    if (ok) { setOwCloudMsg("Original updated."); setOwRefreshKey(k => k + 1); }
    else await owSaveAsNew("The original was deleted — saved as a new writing.");
  }, [owCloudConfirm, owSaveAsNew]);

  const newObjectWriting = useCallback((seedWord?: string, timer: number = TIMER_OPTS[3]) =>
    openOW({ id: uid(), text: "", seedWord }, timer, false), [openOW]);

  // From a selected word — the Lyrics "Object Write [word]" button and the
  // thesaurus. Short timer: the word is already chosen, so the writing starts.
  const handleObjectWrite = useCallback((word: string) =>
    newObjectWriting(word, TIMER_OPTS[1]), [newObjectWriting]);

  const changeOW = useCallback((text: string, seedWord?: string) => {
    const w = owWindowRef.current;
    if (!w) return;
    const entry = { ...w.entry, text, seedWord };
    const commit = !w.committed && !!text.trim();
    const next = { ...w, entry, committed: w.committed || commit };
    owWindowRef.current = next;   // set eagerly so the next keystroke sees it
    setOwWindow(next);
    if (commit) setSong(p => ({ ...p, objectWritings: [...(p.objectWritings ?? []), entry] }));
    else if (w.committed) setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).map(e => e.id === entry.id ? { ...e, text, seedWord } : e) }));
  }, []);

  // Done / X — put the writing away. A committed entry the user emptied out
  // again has nothing left to be, so it leaves the song with the window.
  const closeOW = useCallback(() => {
    const w = owWindowRef.current;
    if (w?.committed && !w.entry.text.trim())
      setSong(p => ({ ...p, objectWritings: (p.objectWritings ?? []).filter(e => e.id !== w.entry.id) }));
    owWindowRef.current = null;
    setOwWindow(null);
  }, []);

  const addVerseFromFill = (lyrics: string) => {
    setSong(p => {
      const n = p.sections.filter(s => s.type === "verse").length + 1;
      const newSection: Section = { ...makeSection("verse", n), lyrics };
      const raw = [...p.sections, newSection];
      return { ...p, sections: renumberSections(raw, p.sectionNaming) };
    });
  };

  const splitSection = (id: string, parts: Array<{ type: SectionType; label: string; lyrics: string }>) => {
    setSong(p => {
      const idx = p.sections.findIndex(s => s.id === id);
      if (idx === -1) return p;
      const orig = p.sections[idx];
      const newSecs = parts.map((part, i) => ({
        ...makeSection(part.type),
        lyrics:         part.lyrics,
        // Inherit chord bars only for the first split section
        chordBars:      i === 0 ? orig.chordBars      : ["", "", "", ""],
        chordPositions: i === 0 ? orig.chordPositions : [],
      }));
      const next = [...p.sections];
      next.splice(idx, 1, ...newSecs);
      return { ...p, sections: renumberSections(next, p.sectionNaming) };
    });
  };

  const switchTab = (t: Tab) => {
    if (t === "final") {
      setSong(p => ({
        ...p,
        sections: p.sections.map(s => ({
          ...s,
          chordPositions: (s.chordPositions ?? []).length > 0
            ? s.chordPositions
            : distributeChords((s.chordBars ?? []).filter(b => b.trim()), s.lyrics ?? ""),
        })),
      }));
    }
    setTab(t);
  };

  const loadProject = (id: string, loadedSong: Song, name: string, createdAt?: string | null,
                       opts: { auto?: boolean } = {}) => {
    // created_at is the song's genuine start date; the name is only consulted
    // for rows that somehow have no usable one.
    currentProjectPrefixRef.current =
      (createdAt ? prefixFromDate(createdAt) : "") || parseProjectPrefix(name) || newProjectPrefix();
    const ls = loadedSong as Song & { objectWriting?: string; mode?: string };
    const rawKey = (loadedSong.key ?? "");
    const legacyMode = ls.mode ?? "major";
    const key = legacyMode === "minor" && rawKey && !rawKey.endsWith("m") ? rawKey + "m" : rawKey;
    const rawSections = (loadedSong.sections ?? []).map(s => normalizeSection(s as Partial<Section>));
    const merged: Song = {
      ...makeEmptySong(),
      ...loadedSong,
      key,
      sections: rawSections.length ? rawSections : makeEmptySong().sections,
      bigIdea: loadedSong.bigIdea ?? "",
      story: loadedSong.story ?? { beginning: "", middle: "", end: "" },
      objectWritings: loadedSong.objectWritings
        ?? (ls.objectWriting ? [{ id: uid(), text: ls.objectWriting }] : []),
      productionNotes: loadedSong.productionNotes ?? "",
      sectionNaming: loadedSong.sectionNaming ?? {},
      audioNotes: Array.isArray(loadedSong.audioNotes) ? loadedSong.audioNotes : [],
    };
    suppressNextAutosaveRef.current = true;
    // Drop the previous song's pinned proposal; this one re-pins from its own chords.
    setPinnedSuggestion(null);
    setSong(merged); setCurrentProjectId(id); setTab("lyrics");
    // On desktop keep the sidebar pinned open; on mobile close the overlay after
    // picking. Skipped when the song opened itself on sign-in — the user didn't
    // ask for the sidebar, so its state is left as it was.
    if (!opts.auto) setShowSidebar(!isMobile);
  };

  const newSong = () => {
    currentProjectPrefixRef.current = null;
    suppressNextAutosaveRef.current = true;
    setPinnedSuggestion(null);
    setSong(makeEmptySong()); setCurrentProjectId(null);
  };

  // Signing in — or arriving with a session already stored — lands you back in
  // the song you were last working on, rather than on a blank sheet you have to
  // navigate away from.
  //
  // Once per sign-in, not once per `user` object: `onAuthStateChange` also fires
  // on token refresh, and re-running this would yank a song out from under
  // someone mid-edit. The ref re-arms on sign-out so signing back in works.
  //
  // "Last worked on" is `updated_at` desc, the same order the sidebar shows,
  // minus archived songs — archiving one is a statement that you're done with
  // it, so it shouldn't be what greets you. Rows predating the status column
  // have `status` null and are treated as working.
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (!user) { autoOpenedRef.current = false; return; }
    if (autoOpenedRef.current) return;
    autoOpenedRef.current = true;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.from("projects")
        .select("id, data, name, created_at")
        .or("status.is.null,status.neq.archived")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled || error || !data) return;
      // The fetch is in flight while the app is already usable, so re-check
      // rather than assume: a song opened by hand, or a blank sheet written
      // into, must not be replaced by this.
      if (currentProjectIdRef.current || !isPristineSong(songRef.current)) return;
      loadProject(data.id, data.data as Song, data.name as string,
        data.created_at as string | null, { auto: true });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!user]);

  const createSongFromOW = useCallback((seedWord: string, body: string) => {
    currentProjectPrefixRef.current = null;
    setSong({
      ...makeEmptySong(),
      title: seedWord,
      objectWritings: [{ id: uid(), text: body, seedWord }],
    });
    setCurrentProjectId(null);
    setShowSidebar(false);
    setTab("notes");
  }, []);

  const toggleSidebar = () => setShowSidebar(s => !s);

  // Everything the songwriter has written here — the pool the "Detail" button
  // pulls a word from. Needed outside the Create tab now that a writing can be
  // opened from the Lyrics tab too.
  const allSongText = useMemo(() => {
    const s = song.story ?? { beginning: "", middle: "", end: "" };
    return [song.generalNotes, song.bigIdea, s.beginning, s.middle, s.end,
      ...song.sections.map(sec => sec.lyrics)].join(" ");
  }, [song.generalNotes, song.bigIdea, song.story, song.sections]);

  const saveOWToNotebook = useCallback((title: string, text: string) => {
    const nb: NbEntry = { id: uid(), title, text, savedAt: new Date().toISOString() };
    setSong(p => ({ ...p, notebookSections: [...(p.notebookSections ?? []), nb] }));
  }, []);

  // ── Analysis: the key is a lens, not a fact about the song ─────────────────
  // Everything chord-related — Nashville numbers, diatonic membership, parallel
  // chords, Ideas, Bridge — reads through `activeKey`, which is the key the
  // songwriter declared whenever they have declared one. Detection only ever
  // proposes: it never writes to `song.key`, and adding chords never moves the
  // lens under the analysis.
  const allChords = song.sections.flatMap(s => s.chordBars).filter(b => b.trim() && !isEditorialBar(b));
  const liveDetected = useMemo(() => detectKey(allChords), [allChords.join("|")]);
  const declaredKey = useMemo(() => parseDeclaredKey(song.key), [song.key]);
  // Until a key is declared the app reads live, exactly as it always has — there
  // is no lens of the songwriter's choosing yet. Declaring one pins the proposal
  // where it stands, so filling in bars stops moving anything under the
  // analysis; the panel's ↻ is then the only thing that re-runs detection.
  const [pinnedSuggestion, setPinnedSuggestion] = useState<{ key: string; mode: "major"|"minor" } | null>(null);
  useEffect(() => {
    if (!declaredKey) setPinnedSuggestion(null);
    else setPinnedSuggestion(p => p ?? liveDetected);
  }, [declaredKey, liveDetected]);
  const suggestion = pinnedSuggestion ?? liveDetected;
  const activeKey = useMemo(
    () => declaredKey ? { key: declaredKey.root, mode: declaredKey.mode } : liveDetected,
    [declaredKey, liveDetected]);
  const activeKeyName = activeKey ? formatDetectedKey(activeKey.key, activeKey.mode) : "";
  const pickerSuggestions = useMemo(() => buildChordSuggestions(activeKey, allChords),
    [activeKey?.key, activeKey?.mode, allChords.join("|")]);
  const verseFirst  = song.sections.find(s => s.type === "verse")?.chordBars.find(b => b.trim());
  const chorusFirst = song.sections.find(s => s.type === "chorus")?.chordBars.find(b => b.trim());
  const sameFirst = !!verseFirst && !!chorusFirst && (() => {
    const vp = parseChord(verseFirst); const cp = parseChord(chorusFirst);
    return vp && cp && vp.root === cp.root && vp.q === cp.q;
  })();

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: SANS }}>
      <span ref={charRef} aria-hidden
        style={{ visibility: "hidden", position: "fixed", top: 0, left: 0, fontFamily: MONO, fontSize: FS + "px", whiteSpace: "pre" }}>0</span>

      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:px-6 py-3 flex items-center gap-3 md:gap-4">
        <Music size={15} className="text-accent shrink-0" />
        <span className="text-[12px] tracking-widest uppercase text-muted-foreground" style={{ fontFamily: MONO }}>SongSheet</span>

        {/* Sidebar toggle + OW button + sign-in */}
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <button onClick={toggleSidebar}
                className={`flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 border rounded-sm transition-colors ${showSidebar ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                style={{ fontFamily: MONO }} title="Projects">
                <FolderOpen size={11} />
              </button>
              <button onClick={() => setShowGlobalOW(true)}
                className="flex items-center justify-center text-[14px] px-2.5 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors leading-none"
                title="New Object Writing session">
                ✦
              </button>
            </>
          ) : (
            <button onClick={() => setAuthModal(true)}
              className="flex items-center gap-1.5 text-[12px] px-3 py-1.5 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              style={{ fontFamily: MONO }}>
              <LogIn size={11} /> Sign in to save
            </button>
          )}
        </div>

        {/* Auto-save indicator — right side */}
        <div className="ml-auto flex items-center gap-2">
          {autoSaveState === "saving" && (
            <span className="text-[10px] text-muted-foreground/60" style={{ fontFamily: MONO }}>Auto-saving…</span>
          )}
          {autoSaveState === "saved" && (
            <span className="text-[10px] text-accent/80" style={{ fontFamily: MONO }}>Saved ✓</span>
          )}
          {autoSaveState === "error" && (
            <span className="text-[10px] text-destructive" style={{ fontFamily: MONO }}>Save failed — check console</span>
          )}
        </div>
      </header>

      {/* Body: projects sidebar (left) + main workspace */}
      <div className="flex items-start">
      {/* Desktop: inline pushing sidebar */}
      {user && showSidebar && !isMobile && (
        <ProjectsSidebar
          onLoad={loadProject}
          onNew={newSong}
          currentProjectId={currentProjectId}
          onSignOut={signOut}
          onCreateSongFromOW={createSongFromOW}
          onAddOWToSong={(seedWord, body, sourceId) => {
            importOWFromCloud(seedWord, body, sourceId);
            setTab("notes");
          }}
          onDeleteCloudOW={deleteCloudOW}
          owRefreshKey={owRefreshKey} />
      )}
      {/* Mobile: overlay drawer with backdrop */}
      {user && showSidebar && isMobile && (
        <div className="fixed inset-0 z-40 flex" style={{ top: 49 }}>
          <div className="absolute inset-0 bg-foreground/30 backdrop-blur-sm" onClick={toggleSidebar} />
          <div className="relative z-10 h-full">
            <ProjectsSidebar
              mobile
              onClose={toggleSidebar}
              onLoad={loadProject}
              onNew={newSong}
              currentProjectId={currentProjectId}
              onSignOut={signOut}
              onCreateSongFromOW={createSongFromOW}
              onAddOWToSong={(seedWord, body, sourceId) => {
                importOWFromCloud(seedWord, body, sourceId);
                setShowGlobalOW(true);
                toggleSidebar();
              }}
              onDeleteCloudOW={deleteCloudOW}
          owRefreshKey={owRefreshKey} />
          </div>
        </div>
      )}
      <main className="flex-1 min-w-0 max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-10">
        {/* Song meta */}
        {(() => { return (
        <section className="mb-4 md:mb-10">
          <div className="flex items-center gap-2">
            <input value={song.title} onChange={e => updateSong({ title: e.target.value })} placeholder="Untitled Song"
              className="flex-1 min-w-0 bg-transparent text-[1.5rem] md:text-[2.6rem] leading-tight text-foreground placeholder:text-muted-foreground/25 focus:outline-none border-b border-transparent focus:border-border pb-1 mb-1 transition-colors"
              style={{ fontFamily: SERIF, fontWeight: 500 }} />
            <button onClick={() => setMetaExpanded(v => !v)}
              className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors p-1.5 -mr-1"
              title={metaExpanded ? "Hide song details" : "Show song details"}>
              <ChevronDown size={16} className={`transition-transform ${metaExpanded ? "rotate-180" : ""}`} />
            </button>
          </div>
          {/* Collapsed summary line */}
          {!metaExpanded && (song.artist || song.key || song.tempo) && (
            <div className="text-[11px] text-muted-foreground/60 truncate" style={{ fontFamily: MONO }}>
              {[song.artist, song.key, song.tempo && `${song.tempo}bpm`, song.timeSignature].filter(Boolean).join(" · ")}
            </div>
          )}

          {metaExpanded && <>
          <input value={song.artist} onChange={e => updateSong({ artist: e.target.value })} placeholder="Artist / Writer"
            className="w-full bg-transparent text-base text-muted-foreground placeholder:text-muted-foreground/30 focus:outline-none border-b border-transparent focus:border-border pb-0.5 mb-5 transition-colors"
            style={{ fontFamily: SERIF, fontStyle: "italic" }} />

          {/* Compact meta + structure index */}
          <div className="flex flex-col md:flex-row items-start gap-4 md:gap-8 mt-5">
            {/* Left: meta fields */}
            <div className="flex flex-col gap-2">
              {/* Row 1: Key · Time · Tempo */}
              <div className="flex items-center gap-5">
                {/* Key */}
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70" style={{ fontFamily: MONO }}>Key</span>
                  <input value={song.key} onChange={e => updateSong({ key: e.target.value })} placeholder="Am"
                    className="w-10 bg-transparent text-[12px] text-foreground/60 placeholder:text-muted-foreground/30 focus:outline-none border-b border-border/50 focus:border-muted-foreground/50 pb-px transition-colors"
                    style={{ fontFamily: MONO }} />
                </label>

                {/* Time signature — arrow cycle */}
                <div className="flex items-center gap-1">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70 mr-1" style={{ fontFamily: MONO }}>Time</span>
                  <button onClick={() => { const i = TSIGS.indexOf(song.timeSignature); updateSong({ timeSignature: TSIGS[(i - 1 + TSIGS.length) % TSIGS.length] }); }}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[10px] leading-none px-0.5">‹</button>
                  <span className="text-[12px] text-foreground/60 tabular-nums w-7 text-center" style={{ fontFamily: MONO }}>
                    {song.timeSignature}
                  </span>
                  <button onClick={() => { const i = TSIGS.indexOf(song.timeSignature); updateSong({ timeSignature: TSIGS[(i + 1) % TSIGS.length] }); }}
                    className="text-muted-foreground/50 hover:text-muted-foreground transition-colors text-[10px] leading-none px-0.5">›</button>
                </div>

                {/* Tempo + tap */}
                <label className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70" style={{ fontFamily: MONO }}>Tempo</span>
                  <input value={song.tempo} onChange={e => updateSong({ tempo: e.target.value })} placeholder="120"
                    className="w-10 bg-transparent text-[12px] text-foreground/60 placeholder:text-muted-foreground/30 focus:outline-none border-b border-border/50 focus:border-muted-foreground/50 pb-px transition-colors"
                    style={{ fontFamily: MONO }} />
                  <button onClick={tapTempo} title="Tap tempo"
                    className="text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors border border-border/40 rounded-sm px-1 py-px leading-none"
                    style={{ fontFamily: MONO }}>tap</button>
                </label>
              </div>

              {/* Row 2: Feel */}
              <label className="flex items-center gap-1.5">
                <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70" style={{ fontFamily: MONO }}>Feel</span>
                <input value={song.feel} onChange={e => updateSong({ feel: e.target.value })} placeholder="slow burn, anthemic, late night…"
                  className="bg-transparent text-[12px] text-foreground/60 placeholder:text-muted-foreground/30 focus:outline-none border-b border-border/50 focus:border-muted-foreground/50 pb-px w-56 transition-colors"
                  style={{ fontFamily: MONO }} />
              </label>
            </div>

            {/* Right: structure index — vertical list, 2 cols if >7 */}
            {song.sections.length > 0 && (
              <div className={`md:ml-auto w-full md:w-auto ${song.sections.length > 7 ? "columns-2 gap-x-4" : ""}`}>
                {song.sections.map(s => (
                  <button
                    key={s.id}
                    onClick={() => {
                      switchTab("lyrics");
                      setTimeout(() => {
                        document.getElementById(`section-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 60);
                    }}
                    className="block text-[9px] text-muted-foreground/60 hover:text-foreground/70 transition-colors text-left md:text-right w-full leading-[1.8] break-inside-avoid"
                    style={{ fontFamily: MONO }}>
                    {s.shortLabel}
                  </button>
                ))}
              </div>
            )}
          </div>
          </>}
        </section>
        ); })()}

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border mb-6 md:mb-8">
          {(["notes","lyrics","chords","final"] as Tab[]).map(t => (
            <button key={t} onClick={() => switchTab(t)}
              className={`pb-2 text-xs capitalize tracking-wide transition-colors ${tab === t ? "border-b-2 border-foreground text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
              style={{ marginBottom: -1, fontFamily: SANS }}>
              {t === "notes" ? "create" : t}
            </button>
          ))}
        </div>

        {/* ── Lyrics ── */}
        {tab === "lyrics" && (
          <div className="flex items-start gap-6">
            {/* Section cards */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {song.sections.length > 1 && (() => {
                const anyCollapsed = song.sections.some(s => sectionCollapsed[s.id]);
                const allCollapsed = song.sections.every(s => sectionCollapsed[s.id]);
                return (
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        const next: Record<string, boolean> = {};
                        song.sections.forEach(s => { next[s.id] = !allCollapsed; });
                        setSectionCollapsed(next);
                      }}
                      className="text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors"
                      style={{ fontFamily: MONO }}>
                      {allCollapsed ? "expand all" : anyCollapsed ? "expand all" : "collapse all"}
                    </button>
                  </div>
                );
              })()}
              {/* Object Write button for highlighted lyric word */}
              {lyricSelection && (
                <div className="flex items-center -mt-1">
                  <button
                    onClick={() => handleObjectWrite(lyricSelection.word)}
                    className="text-[11px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors flex items-center gap-1.5"
                    style={{ fontFamily: MONO }}>
                    <span className="text-accent/70">✦</span> Object Write &ldquo;{lyricSelection.word}&rdquo;
                  </button>
                </div>
              )}
              {song.sections.map((s, i) => (
                <LyricBlock key={s.id} section={s} idx={i} total={song.sections.length}
                  onChange={ns => updateSection(s.id, ns)}
                  onDelete={() => delSection(s.id)}
                  onMove={dir => moveSection(s.id, dir)}
                  onDuplicate={() => dupSection(s.id)}
                  onToggleNaming={() => toggleNaming(s.type)}
                  namingStyle={song.sectionNaming[s.type] ?? "number"}
                  onWordSelect={w => setLyricSelection(prev => ({ word: w, seq: (prev?.seq ?? 0) + 1 }))}
                  onSplitSections={parts => splitSection(s.id, parts)}
                  collapsed={!!sectionCollapsed[s.id]}
                  onToggleCollapse={() => setSectionCollapsed(p => ({ ...p, [s.id]: !p[s.id] }))} />
              ))}
              <div className="flex flex-wrap gap-2 mt-2">
                {SDEFS.map(t => (
                  <button key={t.v} onClick={() => addSection(t.v)}
                    className={`${SCOL[t.v]} flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-sm border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors`}
                    style={{ fontFamily: MONO }}>
                    <Plus size={10} />{t.l}
                  </button>
                ))}
              </div>
            </div>

            {/* Right column: Inspiration + Thesaurus + Rhyme & Metre — desktop only */}
            {!isMobile && (
              <div className="w-60 shrink-0 sticky top-24 flex flex-col gap-3">
                <InspirationPanel song={song} onAddVerse={addVerseFromFill} />
                <ThesaurusPanel song={song} selectionWord={lyricSelection} onObjectWrite={handleObjectWrite} />
                <RhymePanel song={song} selectionWord={lyricSelection} />
              </div>
            )}
          </div>
        )}
        {/* Mobile lyric tools: bottom bar + sheet */}
        {isMobile && tab === "lyrics" && (
          <MobileLyricTools
            song={song}
            onAddVerse={addVerseFromFill}
            selectionWord={lyricSelection}
            onObjectWrite={handleObjectWrite} />
        )}

        {/* ── Chords ── */}
        {tab === "chords" && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <button onClick={() => setShowAnalysis(p => !p)}
                className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${showAnalysis ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                style={{ fontFamily: MONO }}>
                Analyse chords
              </button>
              <div className="flex items-center gap-2 ml-auto">
                <button onClick={() => setShowChordSuggest(v => !v)} title="Toggle chord selector"
                  className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${showChordSuggest ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                  style={{ fontFamily: MONO }}>
                  <Music2 size={11} />Chord Selector
                </button>
                <button onClick={() => setNashville(n => !n)} title="Toggle Nashville Number System"
                  className={`text-[12px] px-3 py-1.5 border rounded-sm transition-colors ${nashville ? "border-foreground/30 text-foreground bg-muted/40" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
                  style={{ fontFamily: MONO }}>
                  {nashville ? "Chords" : "# Nashville"}
                </button>
              </div>
              {sameFirst && <span className="flex items-center gap-1 text-[12px] text-red-500" style={{ fontFamily: MONO }}>
                <AlertCircle size={11} /> verse & chorus share first chord
              </span>}
            </div>

            {showAnalysis && (
              <AnalyseChordsPanel
                song={song}
                activeKey={activeKey}
                suggestion={suggestion}
                idea={idea}
                ideaUndo={ideaUndo}
                onReroll={(sectionId) => setIdea(generateIdea(song, activeKey, sectionId))}
                onApply={(sectionId, bars) => {
                  const newId = uid();
                  setIdeaUndo({ newSectionId: newId });
                  setSong(p => {
                    const idx = p.sections.findIndex(s => s.id === sectionId);
                    if (idx === -1) return p;
                    const orig = p.sections[idx];
                    const newSec: Section = { ...orig, id: newId, chordBars: bars, chordPositions: [] };
                    const next = [...p.sections];
                    next.splice(idx + 1, 0, newSec);
                    return { ...p, sections: renumberSections(next, p.sectionNaming) };
                  });
                }}
                onUndo={() => {
                  if (!ideaUndo) return;
                  setSong(p => {
                    const filtered = p.sections.filter(s => s.id !== ideaUndo.newSectionId);
                    return { ...p, sections: renumberSections(filtered, p.sectionNaming) };
                  });
                  setIdeaUndo(null);
                }}
                bridge={bridge}
                bridgeUndo={bridgeUndo}
                onBridgeGenerate={() => setBridge(generateBridgeIdea(song, activeKey))}
                onBridgeApply={(sectionId, bars) => {
                  const orig = song.sections.find(s => s.id === sectionId)?.chordBars;
                  if (orig) setBridgeUndo({ sectionId, bars: [...orig] });
                  updateSection(sectionId, { chordBars: bars });
                }}
                onBridgeUndo={() => {
                  if (bridgeUndo) { updateSection(bridgeUndo.sectionId, { chordBars: bridgeUndo.bars }); setBridgeUndo(null); }
                }}
                onSetKey={key => updateSong({ key })}
                onRedetect={() => setPinnedSuggestion(liveDetected)}
                onClose={() => setShowAnalysis(false)} />
            )}

            <div className="border border-border rounded-sm overflow-hidden mb-6">
              {!isMobile && (
                <div className="flex border-b border-border bg-muted/40">
                  <div className="shrink-0 border-r border-border px-3 py-1.5" style={{ width: 136 }}>
                    <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Section</span>
                  </div>
                  <div className="flex-1 px-3 py-1.5">
                    <span className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>
                      Bars · Tab adds · ← → navigate · Backspace on empty removes
                    </span>
                  </div>
                </div>
              )}
              {song.sections.length === 0 && (
                <div className="px-6 py-8 text-center text-xs text-muted-foreground" style={{ fontFamily: SERIF, fontStyle: "italic" }}>
                  Add a section below.
                </div>
              )}
              {isMobile && song.sections.map((s, i) => (
                <MobileChordSection key={s.id} section={s} idx={i} total={song.sections.length}
                  onBarsChange={bars => updateSection(s.id, { chordBars: bars })}
                  onShortLabelChange={v => updateSection(s.id, { shortLabel: v })}
                  onDuplicate={() => dupSection(s.id)}
                  onDelete={() => delSection(s.id)}
                  onMove={dir => moveSection(s.id, dir)}
                  onToggleNaming={() => toggleNaming(s.type)}
                  namingStyle={song.sectionNaming[s.type] ?? "number"}
                  activeKey={activeKey}
                  warnFirst={!!sameFirst && (s.type === "verse" || s.type === "chorus")}
                  suggestions={pickerSuggestions}
                  onCopyBars={() => setChordsClipboard([...s.chordBars])}
                  onPasteBars={chordsClipboard ? () => updateSection(s.id, { chordBars: [...chordsClipboard] }) : null}
                  onRepeatBars={() => {
                    const ne = s.chordBars.filter(b => !isEditorialBar(b) && b.trim());
                    if (ne.length) updateSection(s.id, { chordBars: [...s.chordBars, ...ne] });
                  }} />
              ))}
              {!isMobile && song.sections.map((s, i) => (
                <ChordRowGrid key={s.id} section={s} idx={i} total={song.sections.length}
                  onBarsChange={bars => updateSection(s.id, { chordBars: bars })}
                  onShortLabelChange={v => updateSection(s.id, { shortLabel: v })}
                  onDuplicate={() => dupSection(s.id)}
                  onDelete={() => delSection(s.id)}
                  onMove={dir => moveSection(s.id, dir)}
                  onToggleNaming={() => toggleNaming(s.type)}
                  namingStyle={song.sectionNaming[s.type] ?? "number"}
                  activeKey={activeKey}
                  warnFirst={!!sameFirst && (s.type === "verse" || s.type === "chorus")}
                  nashville={nashville} songKey={activeKeyName}
                  suggestions={pickerSuggestions} showSuggest={showChordSuggest}
                  onCopyBars={() => setChordsClipboard([...s.chordBars])}
                  onPasteBars={chordsClipboard ? () => updateSection(s.id, { chordBars: [...chordsClipboard] }) : null}
                  onRepeatBars={() => {
                    const ne = s.chordBars.filter(b => !isEditorialBar(b) && b.trim());
                    if (ne.length) updateSection(s.id, { chordBars: [...s.chordBars, ...ne] });
                  }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {SDEFS.map(t => (
                <button key={t.v} onClick={() => addSection(t.v)} title={`Add ${t.l} (Alt+${t.k.toUpperCase()})`}
                  className={`${SCOL[t.v]} flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-sm border border-border text-foreground/70 hover:text-foreground hover:border-foreground/30 transition-colors`}
                  style={{ fontFamily: MONO }}>
                  <Plus size={10} />{t.l}
                  <kbd className="ml-0.5 text-[8px] text-muted-foreground/50 border border-border/50 rounded px-0.5 leading-none" style={{ fontFamily: MONO }}>⌥{t.k}</kbd>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Notes ── */}
        {tab === "notes" && (() => {
          const s = song.story ?? { beginning: "", middle: "", end: "" };
          return (
            <div className="flex flex-col gap-4">
              {/* 1. Story + Big Idea */}
              <StoryAndBigIdea
                story={s} bigIdea={song.bigIdea ?? ""}
                onStoryChange={ns => updateSong({ story: ns })}
                onBigIdeaChange={v => updateSong({ bigIdea: v })}
                isMobile={isMobile} />

              {/* 2. Voice Notes */}
              <VoiceNotesSection
                notes={song.audioNotes ?? []}
                userId={user?.id ?? null}
                projectId={currentProjectId}
                isMobile={isMobile}
                onUpdate={audioNotes => updateSong({ audioNotes })} />

              {/* 3. Production */}
              <ProductionSection
                value={song.productionNotes ?? ""}
                onChange={v => updateSong({ productionNotes: v })}
                isMobile={isMobile} />

              {/* 4. Notebook */}
              <NotebookSection
                value={song.generalNotes}
                onChange={v => updateSong({ generalNotes: v })}
                nbSections={song.notebookSections ?? []}
                onDeleteNbSection={id => updateSong({ notebookSections: (song.notebookSections ?? []).filter(s => s.id !== id) })}
                isMobile={isMobile} />

              {/* 5. The song's writings, as pills */}
              <OWPillRow
                entries={song.objectWritings ?? []}
                onOpen={id => {
                  const entry = (song.objectWritings ?? []).find(e => e.id === id);
                  if (entry) openOW(entry, null, true);
                }}
                onDelete={deleteOWEntry}
                isMobile={isMobile} />

              {/* 6. Object Writing area */}
              <ObjectWritingSection
                onNew={() => newObjectWriting()}
                onOpenPicker={user ? () => setShowOWPicker(true) : undefined}
                isMobile={isMobile} />
            </div>
          );
        })()}

        {/* ── Final ── */}
        {tab === "final" && (
          <div>
            <p className="text-[10px] text-muted-foreground/50 mb-6" style={{ fontFamily: MONO }}>
              {isMobile
                ? "tap chord row to place · tap chord to select · use toolbar to move or edit · tap lyric to edit"
                : "click chord row to place · select: ←→ move  ↑↓ change line  Shift+←→ jump  ↵ edit  Del remove · click lyric to edit"}
            </p>
            {song.sections.length === 0
              ? <p className="text-muted-foreground text-xs" style={{ fontFamily: SERIF, fontStyle: "italic" }}>Add sections in Lyrics or Chords first.</p>
              : song.sections.map(s => (
                <FinalSectionView key={s.id} section={s} charWidth={charWidth} isMobile={isMobile}
                  onUpdate={p => {
                    const patch = { ...p };
                    if (p.chordPositions && !p.chordBars)
                      patch.chordBars = sortCP(p.chordPositions).map(cp => cp.chord);
                    setSong(prev => ({ ...prev, sections: prev.sections.map(sec => sec.id === s.id ? { ...sec, ...patch } : sec) }));
                  }} />
              ))}
          </div>
        )}
      </main>

      </div>{/* end body flex */}

      {/* Capture a writing from anywhere, without leaving the tab you're on */}
      <FloatingOWButton
        word={selectedWord}
        onStart={w => (w ? handleObjectWrite(w) : newObjectWriting())} />

      {/* Modals */}
      {authModal && <AuthModal onClose={() => setAuthModal(false)} />}
      {owWindow && (
        <OWWindow
          key={owWindow.entry.id}   /* a different writing is a fresh window: timer state must not carry over */
          text={owWindow.entry.text}
          seedWord={owWindow.entry.seedWord}
          onChange={changeOW}
          onClose={closeOW}
          timerStart={owWindow.timer}
          onDrillDown={(word: string) => newObjectWriting(word, TIMER_OPTS[1])}
          onSaveToNotebook={saveOWToNotebook}
          allSongText={allSongText}
          footer={owWindow.entry.imported ? (
            <>
              {owCloudMsg && (
                <span className="text-[11px] text-muted-foreground/70 mr-1" style={{ fontFamily: MONO }}>{owCloudMsg}</span>
              )}
              <button onClick={owUpdateOriginal}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                style={{ fontFamily: MONO }}>Update original</button>
              <button onClick={() => owSaveAsNew("Saved as a new writing.")}
                className="text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                style={{ fontFamily: MONO }}>Save as new</button>
            </>
          ) : undefined}
          isMobile={isMobile} />
      )}
      {showOWPicker && (
        <OWCloudPicker
          onImport={row => importOWFromCloud(row.seed_word, row.body, row.id)}
          onClose={() => setShowOWPicker(false)} />
      )}
      {owCloudConfirm && (
        <ConfirmDialog
          title="Overwrite the original with this version?"
          detail={owCloudConfirm.detail}
          note="The old version is gone — this replaces it in the Object Writing cloud."
          confirmLabel="Overwrite" cancelLabel="Cancel" destructive
          onConfirm={owConfirmUpdateOriginal}
          onCancel={() => setOwCloudConfirm(null)} />
      )}
      {showGlobalOW && (
        <StandaloneOWWindow
          timerStart={TIMER_OPTS[3]}
          onClose={() => setShowGlobalOW(false)}
          onSaved={() => setOwRefreshKey(k => k + 1)}
        />
      )}

    </div>
  );
}
