import { useSyncExternalStore } from "react";
import { supabase } from "./supabase";
import type { OWEntry, Song, StandaloneOW } from "../types";

// Cloud operations on `standalone_ow`: the two "save to cloud" gestures a loose
// pill offers, the discreet delete reachable from a standalone writing's window,
// and — since it is the one fact every reader of the table hangs off — the
// insert itself, wherever it is made from.

// ── "The cloud has a writing it didn't have" ─────────────────────────────────
// Rows appear by three routes: the sidebar's own window, "Save as new" on a
// loose pill, and a linked writing mirrored out of a song by that song's
// autosave. Every reader of the table (the sidebar list and the count in its
// header, the picker) has to hear about all three. Remembering to bump a key
// beside each insert is three things kept in step by hand, and the song path
// was the one that got missed — so the sidebar went on showing the cloud as of
// whenever it last happened to refetch. The insert is the event, so the signal
// is raised here, by the single function that does it.
let owCloudVersion = 0;
const owCloudListeners = new Set<() => void>();

function notifyOWCloudChanged() {
  owCloudVersion++;
  owCloudListeners.forEach(fn => fn());
}

function subscribeOWCloud(fn: () => void) {
  owCloudListeners.add(fn);
  return () => { owCloudListeners.delete(fn); };
}

/**
 * A number that changes whenever the *set* of `standalone_ow` rows does — a row
 * created, a row deleted, or the by-hand overwrite of one. Put it in a fetch
 * effect's deps and that fetch re-runs whichever path made the change.
 *
 * Deliberately not bumped by the two continuous update paths (a song's autosave
 * mirroring a linked entry, the standalone window's own 800ms debounce): those
 * fire while someone is typing, and refetching every list in the app on each
 * keystroke burst would buy nothing — the row is already listed.
 */
export function useOWCloudVersion(): number {
  return useSyncExternalStore(subscribeOWCloud, () => owCloudVersion, () => owCloudVersion);
}

/**
 * The one insert into `standalone_ow`. Every route that creates a cloud writing
 * comes through here so that "a writing was created" is raised once, in one
 * place, rather than being a bump each call site has to remember. The failure
 * message comes back with the row because the standalone window puts it on
 * screen; the song's mirror has nowhere to say it and ignores it.
 */
export async function insertStandaloneOW(
  userId: string, seedWord: string | null, body: string, originSongId: string | null,
): Promise<{ row: StandaloneOW | null; error: string | null }> {
  const { data, error } = await supabase.from("standalone_ow")
    .insert({ user_id: userId, seed_word: seedWord, body, origin_song_id: originSongId })
    .select("id, seed_word, body, written_at, origin_song_id").single();
  if (error || !data) return { row: null, error: error?.message ?? "unknown" };
  notifyOWCloudChanged();
  return { row: data as StandaloneOW, error: null };
}

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
  const hit = !!data && data.length > 0;
  // The label and the date a list shows for this row can both have moved.
  if (hit) notifyOWCloudChanged();
  return hit;
}

/** Insert a fresh row — a fork of the loose entry, not a link back to it. */
export async function saveAsNew(seedWord: string | null, body: string, originSongId: string | null): Promise<StandaloneOW | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { row } = await insertStandaloneOW(user.id, seedWord, body, originSongId);
  return row;
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
  notifyOWCloudChanged();
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
