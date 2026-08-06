import { useState, useRef, useEffect } from "react";
import { OWWindow } from "./OWWindow";
import { supabase } from "../../lib/supabase";
import { MONO } from "../../data/constants";
import { owLabel } from "../../lib/text/owLabel";
import type { StandaloneOW } from "../../types";

// Container for a writing that lives in `standalone_ow` — the sidebar's two
// entry points. `entry` null means a new writing (timed, saved on "Save
// session"); `entry` set means an existing one (no timer, edits sync back to
// its row, plus the copy/add/create actions).
export function StandaloneOWWindow({
  entry = null, timerStart = null, onClose, onSaved, onUpdated, onCreateSong, onAddToSong,
}: {
  entry?: StandaloneOW | null;
  timerStart?: number | null;
  onClose: () => void;
  onSaved?: (row?: StandaloneOW) => void;
  onUpdated?: (row: StandaloneOW) => void;
  onCreateSong?: (seedWord: string, body: string) => void;
  onAddToSong?: (seedWord: string | null, body: string, sourceId: string) => void;
}) {
  const [seedWord, setSeedWord] = useState(entry?.seed_word ?? "");
  const [body, setBody]         = useState(entry?.body ?? "");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");
  const [copied, setCopied]     = useState(false);
  const [added, setAdded]       = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const latest    = useRef({ seedWord, body });
  useEffect(() => { latest.current = { seedWord, body }; }, [seedWord, body]);

  // Existing writing: push edits back to its row (debounced), and flush on unmount
  // so closing the window never drops the last keystrokes.
  const pushUpdate = async () => {
    if (!entry) return;
    const { seedWord: sw, body: b } = latest.current;
    if (sw === (entry.seed_word ?? "") && b === entry.body) return;
    const { error } = await supabase.from("standalone_ow")
      .update({ seed_word: sw.trim() || null, body: b })
      .eq("id", entry.id);
    if (!error) onUpdated?.({ ...entry, seed_word: sw.trim() || null, body: b });
  };

  const handleChange = (text: string, seed?: string) => {
    setBody(text);
    setSeedWord(seed ?? "");
    if (!entry) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(pushUpdate, 1500);
  };

  useEffect(() => () => { clearTimeout(saveTimer.current); pushUpdate(); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  const handleSave = async () => {
    if (!body.trim()) return;
    setSaving(true); setSaveError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); setSaveError("Sign in to save sessions."); return; }
    const { data, error } = await supabase.from("standalone_ow")
      .insert({ user_id: user.id, seed_word: seedWord.trim() || null, body: body.trim() })
      .select("id, seed_word, body, written_at")
      .single();
    setSaving(false);
    if (error) { setSaveError("Save failed — " + error.message); return; }
    if (data) { onSaved?.(data as StandaloneOW); onClose(); }
  };

  const btn = "text-[12px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors";

  const footer = entry ? (
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
  ) : (
    <>
      {saveError && <span className="text-[11px] text-red-500" style={{ fontFamily: MONO }}>{saveError}</span>}
      <button onClick={onClose} className="text-[12px] text-muted-foreground hover:text-foreground transition-colors mr-1"
        style={{ fontFamily: MONO }}>Discard</button>
      <button onClick={handleSave} disabled={!body.trim() || saving}
        className={`${btn} disabled:opacity-30`} style={{ fontFamily: MONO }}>
        {saving ? "Saving…" : "Save session"}
      </button>
    </>
  );

  return (
    <OWWindow
      text={body}
      seedWord={seedWord || undefined}
      onChange={handleChange}
      onClose={onClose}
      timerStart={timerStart}
      onDrillDown={w => handleChange(body, w)}
      footer={footer}
      closeLabel={entry ? "Close" : null}
    />
  );
}
