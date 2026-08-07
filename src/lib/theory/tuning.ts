import type { Tuning } from "../../types";

/**
 * A tuning is six MIDI note numbers, **low string first** — string 1 is the
 * thick one. That is the opposite of the usual 1-is-the-thin-E convention and
 * it is deliberate: the whole app numbers strings the way this songwriter
 * counts them, and the array order matches the numbering so `midi[0]` is
 * always string 1.
 *
 * `detune` is a semitone offset applied to every string *on top of* whatever
 * tuning is selected, so "DADGAD down to C" is one tuning plus a number rather
 * than a seventh preset nobody would find.
 */

// One spelling per pitch class, chosen for how a guitarist writes it: flats for
// the flat keys (Eb, Ab, Bb), sharps for the sharp ones (C#, F#). The app has
// no key context down here — a fretboard shape is named before any key is
// known — so a fixed table is the honest answer rather than a guess.
export const PC_NAMES = ["C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"];

export const pcName = (pc: number) => PC_NAMES[((pc % 12) + 12) % 12];
export const noteName = (midi: number) => pcName(midi);

/** Octave number in scientific pitch notation — only used for tuning readouts. */
export const octaveOf = (midi: number) => Math.floor(midi / 12) - 1;

export const TUNING_PRESETS: Tuning[] = [
  { name: "Standard", midi: [40, 45, 50, 55, 59, 64], detune: 0 },  // E2 A2 D3 G3 B3 E4
  { name: "DADGAD",   midi: [38, 45, 50, 55, 57, 62], detune: 0 },  // D2 A2 D3 G3 A3 D4
];

export const STRING_COUNT = 6;

/** The pitches actually sounding — the tuning with its detune applied. */
export const soundingMidi = (t: Tuning): number[] => t.midi.map(m => m + t.detune);

/** `C G C E A C`, low string first. The line that says what a tuning *is*. */
export const tuningLetters = (t: Tuning): string => soundingMidi(t).map(noteName).join(" ");

/** Identity of a tuning as a set of pitches — what two tunings being "the same" means. */
export const tuningSignature = (t: Tuning): string => soundingMidi(t).join(",");

/** `DADGAD −2` — the preset name plus however far it has been dropped. */
export function tuningLabel(t: Tuning): string {
  if (!t.detune) return t.name;
  return `${t.name} ${t.detune > 0 ? "+" : "−"}${Math.abs(t.detune)}`;
}

export const cloneTuning = (t: Tuning): Tuning => ({ ...t, midi: [...t.midi] });

/** Defensive reader for a tuning coming back from `projects.data`. */
export function normalizeTuning(raw: unknown): Tuning | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Partial<Tuning>;
  if (!Array.isArray(t.midi) || t.midi.length !== STRING_COUNT) return null;
  if (!t.midi.every(m => typeof m === "number" && Number.isFinite(m))) return null;
  return {
    name: typeof t.name === "string" && t.name.trim() ? t.name : "Custom",
    midi: t.midi.map(m => Math.round(m)),
    detune: typeof t.detune === "number" && Number.isFinite(t.detune) ? Math.round(t.detune) : 0,
  };
}
