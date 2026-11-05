import { Chord, Note } from "tonal";
import { soundingMidi } from "../theory/tuning";
import type { FretboardChord } from "../../types";

/**
 * Chord → the MIDI notes to sound. Playback only.
 *
 * This reads chord names with `tonal`, which understands the full suffix
 * (maj9, m7b5, 6/9, sus2…) and the slash bass. It is deliberately separate from
 * `theory/chords.ts` `parseChord`, which reduces a name to root + quality for
 * key detection and numbering — those must not change, and they don't need to
 * hear the ninth.
 *
 * Nothing here throws. A name nothing can read voices to `null`, and the
 * caller plays nothing.
 */

export interface Voicing {
  /** Low to high. */
  midi: number[];
  /** Roll the notes low → high (a strum) rather than striking them together. */
  roll: boolean;
}

/** Names the app writes that `tonal` doesn't: `(no5)`, `(add9)`, `°`, `ø`, `Δ`, `-`. */
function normalise(raw: string): { name: string; omit: number[] } {
  let s = raw.trim();
  const omit: number[] = [];
  // (no3) (no5) — remember which degree to drop, then remove the marker
  s = s.replace(/\(?no\s*(3|5)\)?/gi, (_m, d) => { omit.push(d === "3" ? 3 : 5); return ""; });
  // (add9) (maj7) (b5) — tonal reads these without the brackets
  s = s.replace(/[()]/g, "");
  s = s.replace(/ø7?/g, "m7b5").replace(/Δ/g, "maj7");
  // A-7, A- → Am7, Am (the dash-minor shorthand) — only right after the root
  s = s.replace(/^([A-Ga-g][#b]?)-/, "$1m");
  // Lower-case root ("am") — the bar input capitalises, other paths may not
  s = s.replace(/^([a-g])/, c => c.toUpperCase());
  return { name: s, omit };
}

/** The chord as pitch classes (chroma 0–11), root first, plus its bass. */
export function chordTones(raw: string): { root: number; bass: number; tones: number[] } | null {
  try {
    if (!raw || !raw.trim()) return null;
    const { name, omit } = normalise(raw);
    let c = Chord.get(name);
    // Some spellings only read without the slash ("C/E" where the left side is odd)
    if (c.empty && name.includes("/")) {
      const [left, right] = name.split("/");
      const base = Chord.get(left);
      if (!base.empty && Note.chroma(right) !== undefined) c = { ...base, bass: right } as typeof base;
    }
    if (c.empty || !c.tonic) return null;
    const root = Note.chroma(c.tonic);
    if (root === undefined || Number.isNaN(root)) return null;
    // Build from the intervals, not `c.notes` — with a slash bass tonal rotates
    // the notes around the bass, and we want them in chord order from the root.
    const base = Chord.get(name.split("/")[0]);
    const ivs = (base.empty ? c.intervals : base.intervals).filter(iv => {
      const n = parseInt(iv, 10);
      if (omit.includes(5) && n === 5) return false;
      if (omit.includes(3) && n === 3) return false;
      return true;
    });
    const seen = new Set<number>();
    const tones: number[] = [];
    for (const iv of ivs) {
      const pc = Note.chroma(Note.transpose(c.tonic, iv));
      if (pc === undefined || Number.isNaN(pc) || seen.has(pc)) continue;
      seen.add(pc); tones.push(pc);
    }
    if (!tones.length) return null;
    const bassPc = c.bass ? Note.chroma(c.bass) : root;
    return { root, bass: bassPc === undefined || Number.isNaN(bassPc) ? root : bassPc, tones };
  } catch {
    return null;
  }
}

/** Lowest MIDI note with pitch class `pc` at or above `floor`. */
const atOrAbove = (pc: number, floor: number) => floor + ((pc - floor) % 12 + 12) % 12;

/**
 * Keyboard voicing — piano and ambient. Bass (the slash bass, else the root)
 * in C2–B2, a left hand; the chord tones in a close voicing built up from the
 * root in C3–B3, kept under E5, a right hand. Anchoring on the root's own
 * octave (rather than a fixed floor) stops C and D chords leaping an octave
 * above A and B ones.
 */
export function keyboardVoicing(raw: string): Voicing | null {
  const ct = chordTones(raw);
  if (!ct) return null;
  const bass = atOrAbove(ct.bass, 36);           // C2 … B2
  // Very dense chords (13ths) lose the fifth first — it adds mud, not colour.
  let tones = ct.tones;
  if (tones.length > 5) tones = tones.filter((pc, i) => i === 0 || pc !== (ct.root + 7) % 12);
  const upper: number[] = [];
  // The root sits in C3–B3 and everything else stacks closely above it
  let floor = 48;
  for (const pc of tones) {
    const m = atOrAbove(pc, floor);
    upper.push(m);
    floor = m + 1;
  }
  // Anything that climbed past E5 comes down an octave, if that note is free
  const placed = upper.map(m => (m > 76 && !upper.includes(m - 12) ? m - 12 : m));
  const all = [...new Set([bass, ...placed])].sort((a, b) => a - b);
  return { midi: all, roll: false };
}

/**
 * Guitar voicing from a name — a plausible open spread, not a fingering.
 * Bass in E2–D#3, then the other tones at least a minor third apart, six notes
 * at most, under E5. Strummed.
 */
export function guitarVoicing(raw: string): Voicing | null {
  const ct = chordTones(raw);
  if (!ct) return null;
  const bass = atOrAbove(ct.bass, 40);
  // Fifth, then root, then the colour tones — the order a guitar stacks them
  const fifth = (ct.root + 7) % 12;
  const ordered = [
    ...(ct.tones.includes(fifth) ? [fifth] : []),
    ct.root,
    ...ct.tones.filter(pc => pc !== fifth && pc !== ct.root),
  ];
  const notes = [bass];
  let prev = bass;
  // The bass already sounds its own pitch class; the next string up shouldn't
  // repeat it an octave higher before anything else has been said.
  for (const pc of ordered.filter((pc, i) => !(i === 0 && pc === ct.bass))) {
    if (notes.length >= 6) break;
    const m = atOrAbove(pc, prev + 3);
    if (m > 76) continue;
    notes.push(m); prev = m;
  }
  // A chord tone missing entirely (the third, say) gets a place on top if there's room
  for (const pc of ct.tones) {
    if (notes.length >= 6) break;
    if (notes.some(n => n % 12 === pc)) continue;
    const m = atOrAbove(pc, prev + 1);
    if (m <= 79) { notes.push(m); prev = m; }
  }
  return { midi: [...new Set(notes)].sort((a, b) => a - b), roll: true };
}

/**
 * A chord found on the fretboard: its exact shape in its saved tuning. Muted
 * strings are skipped; string 1 is the low one (see `theory/tuning.ts`), so
 * the array order already runs low → high. Rolled, on every instrument.
 */
export function shapeVoicing(fc: Pick<FretboardChord, "frets" | "tuning">): Voicing | null {
  try {
    const open = soundingMidi(fc.tuning);
    const midi = fc.frets
      .map((f, i) => (f === null || f === undefined ? null : open[i] + f))
      .filter((m): m is number => m !== null && Number.isFinite(m));
    return midi.length ? { midi, roll: true } : null;
  } catch {
    return null;
  }
}

/** Display helper for logs and tests — `C3 E3 G3`. */
export const midiNames = (midi: number[]) => midi.map(m => Note.fromMidi(m)).join(" ");
