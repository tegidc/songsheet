import { makeEmptySong, makeSection } from "../sections";
import type { Song, Tab } from "../types";

/**
 * Development only — `?demo=1` opens a sample song on the Chords tab, and
 * `?theme=<id>` previews a theme without saving it. For screenshots and
 * checking by eye; `import.meta.env.DEV` keeps it out of the production build,
 * and the demo song never saves (nothing autosaves signed out, and a signed-in
 * session ignores these parameters entirely — see App.tsx).
 */
const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
const DEV = !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;

export const devThemeOverride: string | null = DEV ? params.get("theme") : null;

export function devDemo(): { song: Song; tab: Tab } | null {
  if (!DEV || params.get("demo") !== "1") return null;
  // Never with a session on this device: a signed-in autosave would write the
  // demo song to Supabase. Signed out, there is no write path at all.
  try { if (localStorage.getItem("songsheet-auth")) return null; } catch { return null; }
  const verse = { ...makeSection("verse"), chordBars: ["Am9/G", "F6", "Fm6", "Fmaj9/C"] };
  const chorus = { ...makeSection("chorus"), chordBars: ["Ebmaj9/Bb", "F6", "Am9/G", "G"] };
  return { song: { ...makeEmptySong(), title: "River in the Dark", key: "C", sections: [verse, chorus] }, tab: "chords" };
}
