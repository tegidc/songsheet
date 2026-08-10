import type { Song, StandaloneOW } from "../../types";
import type { CloudSourceItem } from "./extract";

export interface CloudProjectRow {
  id: string;
  name: string;
  updatedAt: string;
  song: Song;
}

export type ContentFilter = "ow+notes" | "ow" | "all";

export const EVERYTHING = "__everything__";

/**
 * §2's rule, exactly: title and production notes are never included, under any
 * filter setting. Object writing, notes (song.notebookSections[] AND each
 * section.notes), and — single-project + "Everything" content only — lyrics.
 */
function walkSong(project: CloudProjectRow, includeLyrics: boolean) {
  const objectwriting: CloudSourceItem[] = [];
  const note: CloudSourceItem[] = [];
  const lyric: CloudSourceItem[] = [];

  for (const ow of project.song.objectWritings ?? []) {
    if (ow.text?.trim()) objectwriting.push({ text: ow.text, sourceId: project.id });
  }
  for (const nb of project.song.notebookSections ?? []) {
    if (nb.text?.trim()) note.push({ text: nb.text, sourceId: project.id });
  }
  for (const section of project.song.sections ?? []) {
    if (section.notes?.trim()) note.push({ text: section.notes, sourceId: project.id });
    if (includeLyrics && section.lyrics?.trim()) lyric.push({ text: section.lyrics, sourceId: project.id });
  }

  return { objectwriting, note, lyric };
}

function standaloneItems(rows: StandaloneOW[], scopeProjectId: string | null): CloudSourceItem[] {
  return rows
    .filter(row => scopeProjectId === null || row.origin_song_id === scopeProjectId)
    .filter(row => row.body?.trim())
    .map(row => ({ text: row.body, sourceId: row.id }));
}

/**
 * The draw: everything the current Projects + Content filter selects, as flat
 * (text, sourceId) pairs ready for extraction. `projectFilter` is `EVERYTHING`
 * or a project id.
 */
export function buildSourceItems(
  projects: CloudProjectRow[],
  standalone: StandaloneOW[],
  projectFilter: string,
  contentFilter: ContentFilter,
): CloudSourceItem[] {
  const scopeProjectId = projectFilter === EVERYTHING ? null : projectFilter;
  const includeLyrics = contentFilter === "all";
  const includeNotes = contentFilter !== "ow";

  const scoped = scopeProjectId ? projects.filter(p => p.id === scopeProjectId) : projects;

  const items: CloudSourceItem[] = [];
  for (const project of scoped) {
    const { objectwriting, note, lyric } = walkSong(project, includeLyrics);
    items.push(...objectwriting);
    if (includeNotes) items.push(...note);
    if (includeLyrics) items.push(...lyric);
  }
  items.push(...standaloneItems(standalone, scopeProjectId));
  return items;
}

/**
 * Lyric vocabulary for §6's "hide what's already in your lyrics" — scoped the
 * same way as the draw, so a single-project cloud only checks that project's
 * lyrics.
 */
export function lyricTextsForScope(projects: CloudProjectRow[], projectFilter: string): string[] {
  const scopeProjectId = projectFilter === EVERYTHING ? null : projectFilter;
  const scoped = scopeProjectId ? projects.filter(p => p.id === scopeProjectId) : projects;
  return scoped.flatMap(p => (p.song.sections ?? []).map(s => s.lyrics).filter((l): l is string => !!l?.trim()));
}
