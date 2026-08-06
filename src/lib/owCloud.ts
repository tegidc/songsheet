import { supabase } from "./supabase";
import type { OWEntry, Song, StandaloneOW } from "../types";

// Cloud operations on `standalone_ow` that aren't part of a song's own autosave:
// the two "save to cloud" gestures a loose pill offers, and the discreet delete
// reachable from a standalone writing's window.

export async function fetchOWRow(id: string): Promise<StandaloneOW | null> {
  const { data, error } = await supabase.from("standalone_ow")
    .select("id, seed_word, body, written_at, origin_song_id")
    .eq("id", id).maybeSingle();
  if (error || !data) return null;
  return data as StandaloneOW;
}

/**
 * Overwrite the row a loose entry was copied from. Returns false when the
 * update matched nothing — the original was deleted, so there is no original
 * left to update and the caller must fall back to inserting a new row.
 */
export async function updateOriginal(sourceId: string, seedWord: string | null, body: string): Promise<boolean> {
  const { data, error } = await supabase.from("standalone_ow")
    .update({ seed_word: seedWord, body })
    .eq("id", sourceId)
    .select("id");
  if (error) return false;
  return !!data && data.length > 0;
}

/** Insert a fresh row — a fork of the loose entry, not a link back to it. */
export async function saveAsNew(seedWord: string | null, body: string, originSongId: string | null): Promise<StandaloneOW | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase.from("standalone_ow")
    .insert({ user_id: user.id, seed_word: seedWord, body, origin_song_id: originSongId })
    .select("id, seed_word, body, written_at, origin_song_id").single();
  if (error || !data) return null;
  return data as StandaloneOW;
}

/**
 * Delete a `standalone_ow` row, and decide what happens to the copies of it
 * sitting inside songs.
 *
 * `alsoFromSongs` true  — the writing goes everywhere: the row is deleted and
 *   the pill is removed from every song holding it.
 * `alsoFromSongs` false — only the cloud row goes. Songs keep their text, but
 *   an entry that was linked to this row has nothing to sync to any more, so it
 *   is converted to loose (`imported: true`, `cloudId` cleared) rather than
 *   left pointing at a row that no longer exists — which `syncObjectWritings
 *   ToCloud` would otherwise re-insert as a brand-new row on the next save.
 *
 * Returns the ids of the projects that were rewritten, so an open song can be
 * patched in memory instead of being left to overwrite the change on its next
 * autosave.
 */
export async function deleteStandaloneOW(id: string, alsoFromSongs: boolean): Promise<string[]> {
  const touched: string[] = [];
  const { data: projects } = await supabase.from("projects").select("id, data");
  for (const row of (projects ?? []) as Array<{ id: string; data: Song }>) {
    const entries = row.data?.objectWritings ?? [];
    if (!entries.some(e => e.cloudId === id || e.sourceId === id)) continue;
    const next = applyCloudDeleteToEntries(entries, id, alsoFromSongs);
    const { error } = await supabase.from("projects")
      .update({ data: { ...row.data, objectWritings: next } })
      .eq("id", row.id);
    if (!error) touched.push(row.id);
  }
  await supabase.from("standalone_ow").delete().eq("id", id);
  return touched;
}

/** The same entry-level rewrite, exported so an open song can be patched in memory. */
export function applyCloudDeleteToEntries(entries: OWEntry[], id: string, alsoFromSongs: boolean): OWEntry[] {
  if (alsoFromSongs) return entries.filter(e => e.cloudId !== id && e.sourceId !== id);
  return entries.map(e => {
    if (e.cloudId !== id && e.sourceId !== id) return e;
    const { cloudId: _drop, ...rest } = e;
    return { ...rest, imported: true, sourceId: e.sourceId ?? id };
  });
}
