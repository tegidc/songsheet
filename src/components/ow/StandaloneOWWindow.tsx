import { useState, useRef, useEffect } from "react";
import { OWWindow } from "./OWWindow";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { supabase } from "../../lib/supabase";
import { insertStandaloneOW } from "../../lib/owCloud";
import { MONO } from "../../data/constants";
import { owLabel } from "../../lib/text/owLabel";
import type { StandaloneOW } from "../../types";

const SAVE_DEBOUNCE = 800;

// Container for a writing that lives in `standalone_ow` — the sidebar's two
// entry points. `entry` null means a new writing (timed); `entry` set means an
// existing one (no timer, plus the copy/add/create actions).
//
// There is no save gesture. The row is created by the first keystroke and
// updated as the writing goes on; Done/Close/X only put the window away, and
// dismissing it — or hiding the tab — flushes whatever hasn't been written yet.
// A writing with no text never touches the database at all.
export function StandaloneOWWindow({
  entry = null, timerStart = null, onClose, onSaved, onUpdated, onCreateSong, onAddToSong, onDelete,
}: {
  entry?: StandaloneOW | null;
  timerStart?: number | null;
  onClose: () => void;
  /** Called once, when the first keystroke creates the row. */
  onSaved?: (row: StandaloneOW) => void;
  onUpdated?: (row: StandaloneOW) => void;
  onCreateSong?: (seedWord: string, body: string) => void;
  onAddToSong?: (seedWord: string | null, body: string, sourceId: string) => void;
  /** Delete this row from the cloud. `alsoFromSongs` answers the Yes/No. */
  onDelete?: (id: string, alsoFromSongs: boolean) => void;
}) {
  const [seedWord, setSeedWord] = useState(entry?.seed_word ?? "");
  const [body, setBody]         = useState(entry?.body ?? "");
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied]     = useState(false);
  const [added, setAdded]       = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latest    = useRef({ seedWord, body });
  const rowId     = useRef<string | null>(entry?.id ?? null);
  const written   = useRef({ seedWord: entry?.seed_word ?? "", body: entry?.body ?? "" });
  const saving    = useRef(false);
  const dirty     = useRef(false);
  useEffect(() => { latest.current = { seedWord, body }; }, [seedWord, body]);

  // Insert on the first text, update after that. Serialized through `saving`/
  // `dirty` so a burst of keystrokes can't race two inserts into existence.
  const persist = async () => {
    const { seedWord: sw, body: b } = latest.current;
    if (!b.trim()) return;
    if (sw === written.current.seedWord && b === written.current.body) return;
    if (saving.current) { dirty.current = true; return; }
    saving.current = true;
    try {
      const seed_word = sw.trim() || null;
      if (rowId.current) {
        const { error } = await supabase.from("standalone_ow")
          .update({ seed_word, body: b }).eq("id", rowId.current);
        if (error) { setSaveError("Save failed — " + error.message); return; }
        written.current = { seedWord: sw, body: b };
        setSaveError("");
        onUpdated?.({
          id: rowId.current, seed_word, body: b,
          written_at: entry?.written_at ?? new Date().toISOString(),
          origin_song_id: entry?.origin_song_id ?? null,
        });
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setSaveError("Sign in to save writings."); return; }
        // Through the shared insert, so every list reading the cloud hears
        // about this row the same way it hears about a mirrored one.
        const { row, error } = await insertStandaloneOW(user.id, seed_word, b, null);
        if (!row) { setSaveError("Save failed — " + error); return; }
        rowId.current = row.id;
        written.current = { seedWord: sw, body: b };
        setSaveError("");
        onSaved?.(row);
      }
    } finally {
      saving.current = false;
      if (dirty.current) { dirty.current = false; persist(); }
    }
  };

  const handleChange = (text: string, seed?: string) => {
    setBody(text);
    setSeedWord(seed ?? "");
    latest.current = { seedWord: seed ?? "", body: text };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(persist, SAVE_DEBOUNCE);
  };

  // Dismissing the window, or the tab going away, must not cost the last
  // keystrokes — flush rather than wait out the debounce.
  useEffect(() => {
    const flush = () => { clearTimeout(saveTimer.current); persist(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flush(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const btn = "text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors";

  const footer = (
    <>
      {saveError && <span className="text-[11px] text-red-500 mr-1" style={{ fontFamily: MONO }}>{saveError}</span>}
      {entry && (
        <>
          <button onClick={() => { navigator.clipboard.writeText(body).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className={btn} style={{ fontFamily: MONO }}>{copied ? "Copied ✓" : "Copy text"}</button>
          {onAddToSong && (
            <button onClick={() => { onAddToSong(seedWord.trim() || null, body, entry.id); setAdded(true); setTimeout(() => setAdded(false), 2000); }}
              disabled={added}
              className={`text-[12px] px-2.5 py-1 border rounded-sm transition-colors ${added ? "border-accent text-accent" : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"}`}
              style={{ fontFamily: MONO }}>{added ? "Added ✓" : "Add to song"}</button>
          )}
          {onCreateSong && (
            <button onClick={() => { onCreateSong(owLabel(seedWord || null, body), body); onClose(); }}
              className={btn} style={{ fontFamily: MONO }}>Create song from writing</button>
          )}
        </>
      )}
    </>
  );

  // Both answers delete the cloud row — they differ only in what happens to the
  // copies inside songs. Backing out entirely is the backdrop or Escape.
  const runDelete = (alsoFromSongs: boolean) => {
    if (!entry || !onDelete) return;
    // The debounce/unmount flush must not resurrect the row we are deleting.
    clearTimeout(saveTimer.current);
    written.current = { seedWord, body };
    setConfirmDelete(false);
    onDelete(entry.id, alsoFromSongs);
  };

  return (
    <>
      <OWWindow
        text={body}
        seedWord={seedWord || undefined}
        onChange={handleChange}
        onClose={onClose}
        timerStart={timerStart}
        onDrillDown={w => handleChange(body, w)}
        footer={footer}
        closeLabel={entry ? "Close" : "Done"}
        onDelete={entry && onDelete ? () => setConfirmDelete(true) : undefined}
      />
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this pill from songs as well?"
          note="No leaves the writing in the song notebook but removes it from the Object Writing cloud."
          confirmLabel="Yes" cancelLabel="No" destructive
          onConfirm={() => runDelete(true)}
          onDeny={() => runDelete(false)}
          onCancel={() => setConfirmDelete(false)} />
      )}
    </>
  );
}
