import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { MONO, SERIF } from "../../data/constants";
import { uid } from "../../format";
import type { AudioNote } from "../../types";

export const MAX_AUDIO_NOTES = 5;
export const MAX_RECORD_SECONDS = 90;
export function fmtDur(s: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
export function pickCodec(): string {
  const prefs = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return prefs.find(t => MediaRecorder.isTypeSupported(t)) ?? "";
}
export function extFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  return "webm";
}
export function VoiceNotesSection({
  notes, userId, projectId, isMobile, onUpdate,
}: {
  notes: AudioNote[]; userId: string | null; projectId: string | null;
  isMobile?: boolean; onUpdate: (notes: AudioNote[]) => void;
}) {
  const [open, setOpen] = useState(!isMobile);
  const [recording, setRecording]     = useState(false);
  const [elapsed, setElapsed]         = useState(0);
  const [uploading, setUploading]     = useState(false);
  const [playingId, setPlayingId]     = useState<string | null>(null);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [editLabel, setEditLabel]     = useState("");
  const [progress, setProgress]       = useState<Record<string, number>>({});

  const mrRef     = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const importRef = useRef<HTMLInputElement>(null);

  // Refresh signed URLs on mount when notes exist
  useEffect(() => {
    if (!notes.length || !userId) return;
    (async () => {
      const refreshed = await Promise.all(notes.map(async n => {
        const { data } = await supabase.storage.from("audio-notes").createSignedUrl(n.storagePath, 3600);
        return data?.signedUrl ? { ...n, url: data.signedUrl } : n;
      }));
      // Only update if any URL changed
      if (refreshed.some((r, i) => r.url !== notes[i].url)) onUpdate(refreshed);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const canRecord = !!userId && !!projectId;
  const recordCount = notes.filter(() => true).length; // kept separate for clarity
  const atLimit = recordCount >= MAX_AUDIO_NOTES;

  const startRecording = async () => {
    if (!canRecord || atLimit || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const codec = pickCodec();
      const mr = new MediaRecorder(stream, codec ? { mimeType: codec } : undefined);
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => { stream.getTracks().forEach(t => t.stop()); handleRecordingDone(mr.mimeType); };
      mr.start(250);
      mrRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e + 1 >= MAX_RECORD_SECONDS) { stopRecording(); return e + 1; }
          return e + 1;
        });
      }, 1000);
    } catch {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mrRef.current?.stop();
    mrRef.current = null;
    setRecording(false);
  };

  const handleRecordingDone = async (mimeType: string) => {
    if (!chunksRef.current.length || !userId || !projectId) return;
    setUploading(true);
    const blob = new Blob(chunksRef.current, { type: mimeType });
    const ext = extFromMime(mimeType);
    const id = uid();
    const path = `${userId}/${projectId}/${id}.${ext}`;
    const dur = elapsed;
    const { error } = await supabase.storage.from("audio-notes").upload(path, blob, { contentType: mimeType });
    if (error) { alert("Upload failed: " + error.message); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from("audio-notes").createSignedUrl(path, 3600);
    const newNote: AudioNote = {
      id, label: `Note ${notes.length + 1}`, storagePath: path,
      url: signed?.signedUrl ?? "", duration: dur, createdAt: new Date().toISOString(),
    };
    onUpdate([...notes, newNote]);
    setUploading(false);
    setElapsed(0);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId || !projectId) return;
    e.target.value = "";
    setUploading(true);
    const id = uid();
    const ext = file.name.split(".").pop() ?? "m4a";
    const path = `${userId}/${projectId}/${id}.${ext}`;
    // Attempt to read duration
    const dur = await new Promise<number>(resolve => {
      const a = new Audio();
      a.src = URL.createObjectURL(file);
      a.onloadedmetadata = () => { URL.revokeObjectURL(a.src); resolve(Math.round(a.duration) || 0); };
      a.onerror = () => resolve(0);
    });
    const { error } = await supabase.storage.from("audio-notes").upload(path, file, { contentType: file.type });
    if (error) { alert("Upload failed: " + error.message); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from("audio-notes").createSignedUrl(path, 3600);
    const newNote: AudioNote = {
      id, label: file.name.replace(/\.[^.]+$/, ""), storagePath: path,
      url: signed?.signedUrl ?? "", duration: dur, createdAt: new Date().toISOString(),
    };
    onUpdate([...notes, newNote]);
    setUploading(false);
  };

  const handleExport = async (note: AudioNote) => {
    try {
      const res = await fetch(note.url);
      const blob = await res.blob();
      const ext = note.storagePath.split(".").pop() ?? "webm";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${note.label}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    } catch { alert("Export failed — try again."); }
  };

  const handleDelete = async (note: AudioNote) => {
    if (!confirm(`Delete "${note.label}"?`)) return;
    // Stop playback if active
    if (playingId === note.id) { audioRefs.current[note.id]?.pause(); setPlayingId(null); }
    await supabase.storage.from("audio-notes").remove([note.storagePath]);
    onUpdate(notes.filter(n => n.id !== note.id));
  };

  const togglePlay = (note: AudioNote) => {
    const el = audioRefs.current[note.id];
    if (!el) return;
    if (playingId === note.id) {
      el.pause(); setPlayingId(null);
    } else {
      // Pause any currently playing
      if (playingId && audioRefs.current[playingId]) audioRefs.current[playingId].pause();
      el.play(); setPlayingId(note.id);
    }
  };

  const commitLabel = () => {
    if (!editingId) return;
    onUpdate(notes.map(n => n.id === editingId ? { ...n, label: editLabel.trim() || n.label } : n));
    setEditingId(null);
  };

  const btnBase = "text-[11px] px-2.5 py-1 border border-border rounded-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div className="border border-border rounded-sm overflow-hidden">
      {/* Header */}
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors text-left">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground" style={{ fontFamily: MONO }}>Voice Notes</span>
        <ChevronDown size={13} className={`text-muted-foreground transition-transform shrink-0 ml-4 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pt-3 pb-4">
          {/* Auth / no-project guard */}
          {!userId ? (
            <p className="text-xs text-muted-foreground/60 italic" style={{ fontFamily: SERIF }}>
              Sign in to record or import voice notes.
            </p>
          ) : !projectId ? (
            <p className="text-xs text-muted-foreground/60 italic" style={{ fontFamily: SERIF }}>
              Save your song first to add voice notes.
            </p>
          ) : (
            <>
              {/* Action row */}
              <div className="flex items-center gap-2 mb-4">
                {recording ? (
                  <>
                    <span className="text-[11px] tabular-nums text-red-500 animate-pulse" style={{ fontFamily: MONO }}>
                      ● {fmtDur(elapsed)} / {fmtDur(MAX_RECORD_SECONDS)}
                    </span>
                    <button onClick={stopRecording} className={btnBase} style={{ fontFamily: MONO }}>Stop</button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={startRecording}
                      disabled={atLimit || uploading}
                      className={btnBase}
                      style={{ fontFamily: MONO }}
                      title={atLimit ? `Limit of ${MAX_AUDIO_NOTES} notes reached` : "Record a voice note"}>
                      {uploading ? "Saving…" : "● Record"}
                    </button>
                    <button
                      onClick={() => importRef.current?.click()}
                      disabled={uploading}
                      className={btnBase}
                      style={{ fontFamily: MONO }}>
                      ↑ Import
                    </button>
                    <input ref={importRef} type="file" accept="audio/*" className="hidden" onChange={handleImport} />
                  </>
                )}
                {notes.length > 0 && !recording && (
                  <span className="text-[10px] text-muted-foreground/40 ml-auto tabular-nums" style={{ fontFamily: MONO }}>
                    {notes.length} / {MAX_AUDIO_NOTES}
                  </span>
                )}
              </div>

              {/* Note list */}
              {notes.length === 0 && !recording && (
                <p className="text-xs text-muted-foreground/40 italic" style={{ fontFamily: SERIF }}>
                  No voice notes yet — record a melody, lyric idea, or anything you want to capture.
                </p>
              )}
              <div className="flex flex-col gap-3">
                {notes.map(note => {
                  const isPlaying = playingId === note.id;
                  const prog = progress[note.id] ?? 0;
                  return (
                    <div key={note.id} className="flex flex-col gap-1">
                      {/* Controls row */}
                      <div className="flex items-center gap-2">
                        {/* Play/pause */}
                        <button
                          onClick={() => togglePlay(note)}
                          className="w-6 h-6 flex items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0 text-[10px]"
                          style={{ fontFamily: MONO }}>
                          {isPlaying ? "❙❙" : "▶"}
                        </button>
                        {/* Label */}
                        {editingId === note.id ? (
                          <input
                            value={editLabel}
                            onChange={e => setEditLabel(e.target.value)}
                            onBlur={commitLabel}
                            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") commitLabel(); }}
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent border-b border-border text-xs text-foreground focus:outline-none focus:border-accent pb-0.5"
                            style={{ fontFamily: SERIF }}
                          />
                        ) : (
                          <button
                            onClick={() => { setEditingId(note.id); setEditLabel(note.label); }}
                            className="flex-1 min-w-0 text-left text-xs text-foreground hover:text-accent transition-colors truncate"
                            style={{ fontFamily: SERIF }}>
                            {note.label}
                          </button>
                        )}
                        {/* Duration */}
                        {note.duration > 0 && (
                          <span className="text-[10px] text-muted-foreground/50 tabular-nums shrink-0" style={{ fontFamily: MONO }}>
                            {fmtDur(note.duration)}
                          </span>
                        )}
                        {/* Export */}
                        <button onClick={() => handleExport(note)}
                          className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
                          title="Download" style={{ fontFamily: MONO }}>↓</button>
                        {/* Delete */}
                        <button onClick={() => handleDelete(note)}
                          className="text-muted-foreground/50 hover:text-destructive transition-colors shrink-0">
                          <X size={12} />
                        </button>
                      </div>
                      {/* Progress bar */}
                      <div className="h-px bg-border/50 rounded-full overflow-hidden ml-8">
                        <div
                          className="h-full bg-accent/60 transition-all duration-100"
                          style={{ width: `${prog * 100}%` }}
                        />
                      </div>
                      {/* Hidden audio element */}
                      <audio
                        ref={el => { if (el) audioRefs.current[note.id] = el; }}
                        src={note.url}
                        preload="metadata"
                        onTimeUpdate={e => {
                          const a = e.currentTarget;
                          if (a.duration) setProgress(p => ({ ...p, [note.id]: a.currentTime / a.duration }));
                        }}
                        onEnded={() => { setPlayingId(null); setProgress(p => ({ ...p, [note.id]: 0 })); }}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

