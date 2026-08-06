export type SectionType = "verse"|"chorus"|"bridge"|"pre-chorus"|"outro"|"intro"|"hook"|"custom";
export type Tab = "lyrics"|"chords"|"notes"|"final";
export interface CP { id: string; lineIdx: number; charIdx: number; chord: string }
export interface Section {
  id: string; type: SectionType; label: string; shortLabel: string;
  chordBars: string[]; chordPositions: CP[]; lyrics: string; notes: string;
}
export interface OWEntry { id: string; text: string; seedWord?: string; savedAt?: string; }
export interface NbEntry { id: string; title: string; text: string; savedAt: string; }
export interface AudioNote {
  id: string; label: string; storagePath: string; url: string;
  duration: number; createdAt: string;
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
  sectionNaming: Partial<Record<SectionType, "number" | "letter">>;
}
export type ProjectStatus = "working" | "finished" | "archived";
export interface Project { id: string; name: string; updated_at: string; status: ProjectStatus }
export interface StandaloneOW { id: string; seed_word: string; body: string; written_at: string }
