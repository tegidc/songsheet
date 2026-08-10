import { useEffect } from "react";
import { MONO, SERIF } from "../../data/constants";
import { PALETTES } from "../../lib/wordcloud/palettes";
import { useWordCloudPrefs } from "../../lib/wordcloud/prefs";

// A full-bleed view across everything written, not one song — mounted as a
// sibling of the header (App owns showWordCloud), not a Tab and not an
// overlay centred over the page. Borrows OWWindow-adjacent mechanics
// (FullScreenEditor's, really: scroll lock + Escape) but has no backdrop of
// its own to click through — it *is* the page below the header.
export function WordCloudView({
  onClose, onWriteEntry,
}: {
  onClose: () => void;
  onWriteEntry: () => void;
}) {
  const prefs = useWordCloudPrefs();
  const palette = PALETTES[prefs.palette];

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Data fetch, filters and extraction land in the next commit — for now the
  // view always reads as empty, which is an honest description of what it can
  // show before that lands.
  return (
    <div className="fixed inset-0 z-10" style={{ background: palette.bg }}>
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <strong className="text-[15px] font-medium" style={{ fontFamily: SERIF, color: palette.ink }}>
          Nothing to draw from yet
        </strong>
        <p className="max-w-[300px] text-[13px] leading-[1.7]" style={{ fontFamily: MONO, color: palette.mist }}>
          The cloud builds itself from your object writing and notes. Write an entry and it will show up here.
        </p>
        <button onClick={onWriteEntry}
          className="mt-1 text-[12px] px-3 py-1.5 border rounded-sm transition-colors"
          style={{ fontFamily: MONO, color: palette.ink, borderColor: palette.line }}>
          Start an object writing session
        </button>
      </div>
    </div>
  );
}
