export type SectionType = "verse"|"chorus"|"bridge"|"pre-chorus"|"outro"|"intro"|"hook"|"custom";
export type Tab = "lyrics"|"chords"|"notes"|"final";
export interface CP { id: string; lineIdx: number; charIdx: number; chord: string }
export interface Section {
  id: string; type: SectionType; label: string; shortLabel: string;
  chordBars: string[]; chordPositions: CP[]; lyrics: string; notes: string;
}
export interface OWEntry {
  id: string; text: string; seedWord?: string; savedAt?: string;
  cloudId?: string;   // the standalone_ow row this mirrors — linked pills only
  imported?: boolean; // came FROM the cloud rather than being written here
  sourceId?: string;  // provenance: the row it was copied from. NOT a live link.
}
export interface NbEntry { id: string; title: string; text: string; savedAt: string; }
export interface AudioNote {
  id: string; label: string; storagePath: string; url: string;
  duration: number; createdAt: string;
}
/**
 * Six MIDI note numbers, **low string first** — `midi[0]` is string 1, the
 * thick one. `detune` is a semitone offset applied on top of the named tuning,
 * so "DADGAD down to C" stays one tuning and a number.
 */
export interface Tuning { name: string; midi: number[]; detune: number }
/**
 * A chord found on the fretboard. The tuning travels with it because a
 * fingering means nothing without one — the same six numbers are a different
 * chord in DADGAD than in C G C E A C.
 */
export interface FretboardChord {
  id: string; name: string;
  frets: (number | null)[];   // per string, low first; null is a muted string
  tuning: Tuning;
}
export interface Song {
  title: string; artist: string; key: string;
  tempo: string; timeSignature: string; feel: string;
  sections: Section[]; generalNotes: string;
  productionNotes: string;
  bigIdea: string;
  story: { beginning: string; middle: string; end: string };
  objectWritings: OWEntry[];
  notebookSections?: NbEntry[];
  audioNotes?: AudioNote[];
  /** The tuning this song is in — written only when the songwriter saves it. */
  fretboardTuning?: Tuning;
  /** The working log of chords found on the fretboard for this song. */
  fretboardChords?: FretboardChord[];
  sectionNaming: Partial<Record<SectionType, "number" | "letter">>;
}
export type ProjectStatus = "working" | "finished" | "archived";
export interface Project { id: string; name: string; updated_at: string; status: ProjectStatus }
export interface StandaloneOW { id: string; seed_word: string | null; body: string; written_at: string; origin_song_id?: string | null }
