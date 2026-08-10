# Word Cloud reference files

Design/behaviour references for the upcoming Word Cloud page. Not imported by
the app, not built by Vite (no `public/` dir exists, and nothing here is
referenced from `index.html` or `src/`), so nothing in this folder ships to
the live site.

## dithered-cloud-particles.html

Reference for **motion and rendering only**: the layered-sine flow field,
S/Z wind patterns with gust envelope, constellation web alpha banding, and
the tap-to-fly-forward reveal.

Its `FIXED` settings block is dialled in — keep those values.

**Known bug:** `pickAt` is defined twice (once for sticky hover, once
without). The second definition silently overwrites the first, dropping
sticky hover. Fix on port.

## word-cloud-wireframe.html

Reference for **structure and behaviour**: nav icon, filter dropdowns and
their dependency, sense scan toggle and pill legend, lyrics toggle, phrase
extraction, copy-to-clipboard, empty state.

Its particle cap and constellation cutoff are sized for demo data — not
production-ready values.

It deliberately **omits** the wind field, Soft Cloud render mode, and
ambient bloom that exist in the other file.

## Porting notes

Neither file should be ported literally. The wireframe uses vanilla JS,
mock projects, and an invented sense lexicon — all three get replaced by
the real React component, Supabase queries, and the app's existing
sense-scan word lists.
