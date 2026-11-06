import { X } from "lucide-react";
import type { ChordFunction } from "../../lib/theory/function";
import { chordFunction, romanNumeral } from "../../lib/theory/function";
import { CHORD_ROW_HEADING, CHORD_ROW_KEYS, CHORD_ROW_ORDER, type ChordRow, type ChordSuggestion, type ChordSuggestionSets } from "../../lib/theory/chords";
import { abbreviateSectionLabel } from "../../sections";
import { SDEFS } from "../../data/constants";
import { useUiPrefs } from "../../lib/prefs";
import { flash, usePlay } from "../../lib/audio/PlayContext";
import type { Section } from "../../types";

/**
 * Building blocks of the Swiss layout: a narrow label column beside a content
 * column, sections divided by full-width ink rules, no cards, no shadows.
 * Everything here reads theme tokens only (see lib/theme/), so all seven
 * themes share this one layout.
 */

export const LABEL_COL = 56;
export type Key = { key: string; mode: "major" | "minor" } | null;

/** `grid 56px | 1fr` — the one grid the Chords screen is built on. */
export function Row({ label, children, className = "", rule = true, align = "start" }: {
  label: React.ReactNode; children: React.ReactNode; className?: string; rule?: boolean; align?: "start" | "center";
}) {
  return (
    <section className={`grid gap-x-3 ${rule ? "border-b border-[var(--rule)]" : ""} ${align === "center" ? "items-center" : "items-start"} ${className}`}
      style={{ gridTemplateColumns: `${LABEL_COL}px minmax(0, 1fr)` }}>
      <div className="text-[12px] leading-[1.3] text-foreground lowercase break-words min-w-0" style={{ fontFamily: "var(--font-label)" }}>
        {label}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/**
 * "verse\n01". The short label wins when the songwriter has renamed it;
 * otherwise the section's own name, lower-cased, number padded to two digits.
 */
export function sectionLabel(s: Section): React.ReactNode {
  // The short label is the songwriter's own only if it isn't one the app made
  // (`Verse 1`, `Pre. 2`, `V1`)
  const def = SDEFS.find(d => d.v === s.type);
  const madeByApp = !s.shortLabel
    || s.shortLabel === abbreviateSectionLabel(s.label)
    || (!!def && new RegExp(`^${def.s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s+(\\d+|[A-Za-z]))?$`).test(s.shortLabel));
  if (!madeByApp) return s.shortLabel;
  const m = s.label.trim().match(/^(.*?)\s+(\d+|[A-Za-z])$/);
  if (!m) return s.label;
  const n = /^\d+$/.test(m[2]) ? m[2].padStart(2, "0") : m[2].toLowerCase();
  return <>{m[1]}<br />{n}</>;
}

/** The chord-function shape: ● home, ■ lift, ▲ pull, ◆ borrowed. Decorative — the numeral carries the same fact as text. */
export function FunctionMark({ fn, surface = "page", size = 11 }: { fn: ChordFunction | null; surface?: "page" | "panel"; size?: number }) {
  if (!fn) return null;
  const sfx = surface === "panel" ? "-panel" : "";
  const color = fn === "borrowed" ? (surface === "panel" ? "var(--panel-ink)" : "var(--ink)") : `var(--fn-${fn}${sfx})`;
  const shape: React.CSSProperties =
    fn === "home" ? { borderRadius: "50%" }
    : fn === "lift" ? { width: size - 1, height: size - 1 }
    : fn === "pull" ? { clipPath: "polygon(50% 0, 100% 100%, 0 100%)", width: size + 1 }
    : { clipPath: "polygon(50% 0, 100% 50%, 50% 100%, 0 50%)", width: size + 1, height: size + 1 };
  return <span aria-hidden className="inline-block shrink-0" style={{ width: size, height: size, background: color, ...shape }} />;
}

/** The now-playing dot (B3). */
export function NowDot({ size = 12 }: { size?: number }) {
  return <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: "var(--accent-fill)" }} />;
}

/** 20px, or 18px past seven characters — and a long name may give a little more on a 320px phone. */
export const chordSize = (name: string): number | string => (name.length > 7 ? "clamp(15px, 4.7vw, 18px)" : 20);

/** Name styles shared by every chord drawn on the page. */
export const chordNameStyle = (name: string, heavy = false): React.CSSProperties => ({
  fontFamily: "var(--font-display)", fontSize: chordSize(name),
  fontWeight: heavy ? 800 : 700, letterSpacing: "var(--chord-tracking)", lineHeight: 1.1,
});

/** The small muted Roman numeral beside a chord — only with Settings › Show numerals on. */
export function Numeral({ chord, activeKey }: { chord: string; activeKey: Key }) {
  const { showNumerals } = useUiPrefs();
  const r = showNumerals ? romanNumeral(chord, activeKey) : null;
  if (!r) return null;
  return <span className="text-[12px] text-muted-foreground shrink-0" style={{ fontFamily: "var(--font-label)" }}>{r}</span>;
}

export function useChordFunction(chord: string, activeKey: Key): ChordFunction | null {
  const { showFunction } = useUiPrefs();
  return showFunction ? chordFunction(chord, activeKey) : null;
}

/**
 * The chord selector, skinned: an inverted (panel-coloured) block. Its rows,
 * rotation, shortcuts and what a tap does are exactly the selector's — only
 * the skin is new. The rotating heading is the control; tapping it moves to
 * the next set, and the other rotating sets are listed beside it (each a
 * shortcut to the same cycle). USED stays put on its own line.
 *
 * `onPick` places; in Play mode the pills play instead and place nothing.
 */
export function ChordSelectorPanel({ suggestions, chordRow, onCycleChordRow, onPick, activeKey, onRemoveFretboardChord, showKeys, hint, className = "" }: {
  suggestions: ChordSuggestionSets; chordRow: ChordRow; onCycleChordRow: () => void;
  onPick?: (chord: string) => void; activeKey: Key;
  onRemoveFretboardChord?: (name: string) => void;
  /** Draw the keyboard shortcut on each pill (desktop). */
  showKeys?: boolean;
  hint?: string;
  className?: string;
}) {
  const playApi = usePlay();
  const jumpTo = (target: ChordRow) => {
    // Jumping is just cycling until we arrive — the rotation stays the one control
    let r = chordRow, n = 0;
    while (r !== target && n++ < 3) { onCycleChordRow(); r = CHORD_ROW_ORDER[(CHORD_ROW_ORDER.indexOf(r) + 1) % CHORD_ROW_ORDER.length]; }
  };
  const tap = (e: React.MouseEvent<HTMLElement>, chord: string) => {
    if (playApi.on) { flash(e.currentTarget); playApi.play(chord); return; }
    onPick?.(chord);
  };
  const others = CHORD_ROW_ORDER.filter(r => r !== chordRow);
  const items = suggestions[chordRow];

  return (
    <div className={`bg-[var(--panel)] text-[var(--panel-ink)] px-5 pt-4 pb-5 ${className}`} style={{ fontFamily: "var(--font-label)" }}>
      <div className="grid gap-x-3 gap-y-3" style={{ gridTemplateColumns: `${LABEL_COL}px minmax(0, 1fr)` }}>
        <button onClick={onCycleChordRow} title="Show the next set of chords"
          className="text-left text-[12px] leading-tight lowercase py-1 text-[var(--panel-ink)]">
          {CHORD_ROW_HEADING[chordRow]}
        </button>
        <div className="text-[12px] text-[var(--panel-muted)] lowercase py-1 flex flex-wrap gap-x-1.5">
          {others.map((r, i) => (
            <span key={r} className="flex gap-x-1.5">
              <button onClick={() => jumpTo(r)} className="lowercase hover:text-[var(--panel-ink)] transition-colors">{CHORD_ROW_HEADING[r].replace("From ", "")}</button>
              {i < others.length - 1 && <span aria-hidden>·</span>}
            </span>
          ))}
          {hint && <span className="basis-full text-[11px] mt-1">{hint}</span>}
        </div>

        <span />
        {items.length ? (
          <Pills items={items} keys={showKeys ? CHORD_ROW_KEYS[chordRow] : undefined} activeKey={activeKey} onTap={tap}
            onRemove={chordRow === "fretboard" ? onRemoveFretboardChord : undefined} />
        ) : (
          <span className="text-[12px] text-[var(--panel-muted)] italic py-2">
            {chordRow === "fretboard" ? "Nothing added from the fretboard yet" : "Nothing here yet"}
          </span>
        )}

        {suggestions.used.length > 0 && <>
          <span className="text-[12px] lowercase pt-3">used</span>
          <Pills items={suggestions.used} activeKey={activeKey} onTap={tap} />
        </>}
      </div>
    </div>
  );
}

/** Degree labels (I, vi, V/ii…) follow Show numerals; "borrowed" and the off-key dot always show. */
const isNumeralLabel = (l: string) => l !== "borrowed" && l !== "•";

function Pills({ items, keys, activeKey, onTap, onRemove }: {
  items: ChordSuggestion[]; keys?: string[]; activeKey: Key;
  onTap: (e: React.MouseEvent<HTMLElement>, chord: string) => void;
  onRemove?: (chord: string) => void;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(64px, 1fr))" }}>
      {items.map((s, i) => <Pill key={s.chord + s.label} s={s} k={keys?.[i]} activeKey={activeKey} onTap={onTap} onRemove={onRemove} />)}
    </div>
  );
}

function Pill({ s, k, activeKey, onTap, onRemove }: {
  s: ChordSuggestion; k?: string; activeKey: Key;
  onTap: (e: React.MouseEvent<HTMLElement>, chord: string) => void; onRemove?: (chord: string) => void;
}) {
  const fn = useChordFunction(s.chord, activeKey);
  const { showNumerals } = useUiPrefs();
  return (
    <div className="relative group/pill">
      <button onClick={e => onTap(e, s.chord)}
        className="relative w-full h-[46px] flex flex-col items-center justify-center gap-0.5 border border-[var(--panel-rule)] bg-transparent text-[var(--panel-ink)] hover:bg-[color-mix(in_srgb,var(--panel-ink)_8%,transparent)] transition-colors"
        style={{ borderRadius: "var(--radius-selector)" }}>
        {k && <span className="absolute top-0.5 right-1.5 text-[8px] leading-none text-[var(--panel-muted)]">{k}</span>}
        <span className="flex items-center gap-1.5">
          <FunctionMark fn={fn} surface="panel" size={8} />
          <span style={{ fontFamily: "var(--font-display)", fontSize: s.chord.length > 6 ? 13 : 16, fontWeight: 700, letterSpacing: "var(--chord-tracking)", lineHeight: 1 }}>{s.chord}</span>
        </span>
        {s.label && (showNumerals || !isNumeralLabel(s.label)) && <span className="text-[9px] text-[var(--panel-muted)] leading-none">{s.label}</span>}
      </button>
      {onRemove && (
        <button onClick={() => onRemove(s.chord)} aria-label={`Remove ${s.chord} from this song's fretboard chords`}
          title={`Remove ${s.chord} from this song's fretboard chords`}
          className="absolute top-0 left-0 p-1 leading-none text-[var(--panel-muted)] hover:text-[var(--panel-ink)] md:opacity-0 md:group-hover/pill:opacity-100 focus-visible:opacity-100 transition-opacity">
          <X size={9} />
        </button>
      )}
    </div>
  );
}
