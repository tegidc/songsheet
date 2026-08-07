import { supabase } from "./supabase";
import { normalizeTuning, tuningSignature } from "./theory/tuning";
import type { Tuning } from "../types";

/**
 * Saved tunings are not stored anywhere of their own — they are read back off
 * the songs. A song already has a tuning (`data.fretboardTuning`), so the list
 * of "tunings I use" falls out of the work for free: no new table, no
 * migration, and it syncs across devices because the songs already do.
 *
 * The cost of that choice: a tuning is only remembered once it has been put on
 * a song, which is exactly what the + beside the dropdown does.
 *
 * Only the tuning is fetched, not the songs — PostgREST will project a path
 * out of the jsonb, so this reads six numbers per row rather than every lyric
 * the songwriter has ever written.
 */
export async function fetchSongTunings(limit = 40): Promise<Tuning[]> {
  const { data, error } = await supabase.from("projects")
    .select("updated_at, tuning:data->fretboardTuning")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  // Most recent first, one entry per distinct set of pitches — the same tuning
  // reached from two songs is one line in the dropdown.
  const seen = new Set<string>();
  const out: Tuning[] = [];
  for (const row of data as Array<{ tuning: unknown }>) {
    const t = normalizeTuning(row.tuning);
    if (!t) continue;
    const sig = tuningSignature(t);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(t);
  }
  return out;
}
