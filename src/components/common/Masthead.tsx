import { useEffect, useRef, useState } from "react";
import { LABEL_COL } from "../chords/swiss";

/**
 * The song's masthead: the date it was started, stacked small in the label
 * column (26 / 07 / 18 — the project's YYMMDD), and the title large and tight
 * beside it. Lower-case while it is being read; its own case while it is
 * being typed, so editing never lies about what is saved.
 */
export function Masthead({ title, onTitle, prefix, children }: {
  title: string; onTitle: (t: string) => void;
  /** YYMMDD, or null for a song not yet saved (shows today). */
  prefix: string | null;
  children?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  // A textarea so a long title wraps like the poster's; Enter never adds a line.
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
  }, [title, focused]);
  const d = prefix && /^\d{6}$/.test(prefix) ? prefix : todayPrefix();
  return (
    <div className="grid gap-x-3 items-end" style={{ gridTemplateColumns: `${LABEL_COL}px minmax(0, 1fr)` }}>
      <span className="text-[12px] font-medium leading-[1.3] text-foreground pb-1.5" style={{ fontFamily: "var(--font-label)" }}
        aria-label={`Started ${d.slice(4, 6)}/${d.slice(2, 4)}/20${d.slice(0, 2)}`}>
        {d.slice(0, 2)}<br />{d.slice(2, 4)}<br />{d.slice(4, 6)}
      </span>
      <div className="min-w-0">
        <textarea ref={ref} value={title} rows={1} data-large-type
          onChange={e => onTitle(e.target.value.replace(/\n/g, " "))}
          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder="untitled song" aria-label="Song title"
          className={`block w-full bg-transparent resize-none overflow-hidden focus:outline-none text-foreground placeholder:text-muted-foreground/60 ${focused ? "" : "lowercase"}`}
          style={{
            fontFamily: "var(--font-title)", fontWeight: "var(--title-weight)" as unknown as number,
            letterSpacing: "var(--title-tracking)", lineHeight: 0.95,
            fontSize: "clamp(34px, 9vw, 56px)",
          }} />
        {children}
      </div>
    </div>
  );
}

function todayPrefix() {
  const n = new Date();
  return `${String(n.getFullYear()).slice(2)}${String(n.getMonth() + 1).padStart(2, "0")}${String(n.getDate()).padStart(2, "0")}`;
}

/** Three concentric outlines and a filled accent disc, partly off the top-right. Decorative. */
export function Rings() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 300 300"
      className="absolute -z-10 pointer-events-none select-none w-[240px] h-[240px] -right-[84px] -top-[64px] sm:w-[300px] sm:h-[300px] sm:-right-[96px] sm:-top-[70px]">
      <circle cx="150" cy="150" r="140" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.9" vectorEffect="non-scaling-stroke" />
      <circle cx="150" cy="150" r="112" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.9" vectorEffect="non-scaling-stroke" />
      <circle cx="150" cy="150" r="84" fill="none" stroke="var(--ink)" strokeWidth="1" opacity="0.9" vectorEffect="non-scaling-stroke" />
      <circle cx="150" cy="150" r="56" fill="var(--accent-fill)" />
    </svg>
  );
}
