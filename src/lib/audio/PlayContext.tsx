import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FretboardChord } from "../../types";
import { getUiPrefs, useUiPrefs } from "../prefs";
import * as engine from "./engine";
import { guitarVoicing, keyboardVoicing, midiNames, shapeVoicing, type Voicing } from "./voicing";

/**
 * Play mode. While it is on, tapping a chord anywhere it is drawn sounds it and
 * does nothing else — no select, no place, no edit, no picker, no write. Every
 * tap site asks `usePlay().on` and, if so, calls `play` *instead of* its usual
 * handler; that branch is the whole play-only guard.
 *
 * Session state on purpose: Play always starts off, so opening the app never
 * makes a sound and never touches audio until asked.
 */

export interface PlayApi {
  on: boolean;
  setOn: (on: boolean) => void;
  status: engine.EngineStatus;
  note: string;
  /** Sound a chord by name. `id` marks which on-screen chord it was (now-playing). */
  play: (name: string, id?: string) => void;
  /** Sound an exact fretboard shape. */
  playShape: (shape: Pick<FretboardChord, "frets" | "tuning">, id?: string) => void;
  /** The on-screen chord sounding most recently, or null. */
  nowPlaying: string | null;
  /**
   * Hear chords that aren't in the song — an idea, a join — whether or not
   * Play is on: one chord, or a run of them a bar apart. Call from inside a
   * tap (it may start audio). Returns the run's length in ms; a new call
   * stops the last.
   */
  hear: (names: string[], secondsPerBar?: number) => number;
  /** Stop a run that `hear` started. */
  stopHearing: () => void;
}

const noop = () => {};
const IS_DEV = !!(import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
const PlayCtx = createContext<PlayApi>({
  on: false, setOn: noop, status: "off", note: "", play: noop, playShape: noop, nowPlaying: null,
  hear: () => 0, stopHearing: noop,
});
export const usePlay = () => useContext(PlayCtx);

export function PlayProvider({ fretboardChords, capsLock = false, children }: {
  /** The open song's fretboard log — a chord with one of these names plays its exact shape. */
  fretboardChords: FretboardChord[] | undefined;
  /** Caps Lock follows Play while this is true (the desktop Chords screen). */
  capsLock?: boolean;
  children: React.ReactNode;
}) {
  const [on, setOnState] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const { instrument } = useUiPrefs();
  const st = useSyncExternalStore(engine.subscribeStatus, engine.getStatus, engine.getStatus);

  const shapes = useRef(fretboardChords);
  useEffect(() => { shapes.current = fretboardChords; }, [fretboardChords]);

  // Must run synchronously inside the tap that flips the switch — iOS only
  // lets audio start from a user gesture.
  const setOn = useCallback((next: boolean) => {
    engine.setPlayOnFlag(next);
    if (next) {
      if (!engine.unlock()) return;
      engine.setInstrument(getUiPrefs().instrument);
      void engine.prepare(getUiPrefs().instrument);
    } else {
      engine.sleep();
      setNowPlaying(null);
    }
    setOnState(next);
  }, []);

  // Caps Lock is Play: on is play, off is edit. Read from the key's own
  // events — macOS sends keydown when it locks and keyup when it unlocks,
  // Windows both on every press — so both are heard and the lock *state*
  // decides, never the press count. The keydown is a user gesture, so audio
  // may start from it.
  const onRef = useRef(on);
  useEffect(() => { onRef.current = on; }, [on]);
  useEffect(() => {
    if (!capsLock) return;
    const sync = (e: KeyboardEvent) => {
      if (e.key !== "CapsLock" || typeof e.getModifierState !== "function") return;
      const locked = e.getModifierState("CapsLock");
      if (locked !== onRef.current) setOn(locked);
    };
    window.addEventListener("keydown", sync);
    window.addEventListener("keyup", sync);
    return () => { window.removeEventListener("keydown", sync); window.removeEventListener("keyup", sync); };
  }, [capsLock, setOn]);

  // Instrument changes while on: load just that one
  useEffect(() => { if (on) engine.setInstrument(instrument); }, [instrument, on]);

  const voice = useCallback((name: string): Voicing | null => {
    const trimmed = name.trim();
    // A fretboard chord of this exact name plays its own shape. The most recent
    // entry wins if the same name was logged twice.
    const fc = [...(shapes.current ?? [])].reverse().find(c => c.name === trimmed);
    if (fc) return shapeVoicing(fc);
    return getUiPrefs().instrument === "guitar" ? guitarVoicing(trimmed) : keyboardVoicing(trimmed);
  }, []);

  const play = useCallback((name: string, id?: string) => {
    const v = voice(name);
    if (IS_DEV) console.debug("[play]", name, v ? midiNames(v.midi) : "(nothing)");
    engine.playVoicing(v);
    if (v) setNowPlaying(id ?? null);
  }, [voice]);

  const playShape = useCallback((shape: Pick<FretboardChord, "frets" | "tuning">, id?: string) => {
    const v = shapeVoicing(shape);
    engine.playVoicing(v);
    if (v) setNowPlaying(id ?? null);
  }, []);

  const timers = useRef<number[]>([]);
  const stopHearing = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);
  const hear = useCallback((names: string[], secondsPerBar = 1.8) => {
    stopHearing();
    const run = names.map(n => n.trim()).filter(Boolean);
    if (!run.length || !engine.unlock()) return 0;
    const inst = getUiPrefs().instrument;
    engine.setInstrument(inst);
    const ms = secondsPerBar * 1000;
    void engine.prepare(inst).then(() => {
      run.forEach((n, i) => timers.current.push(window.setTimeout(() => engine.playVoicing(voice(n)), i * ms)));
      // Play off: let the context go again once the run has rung out
      timers.current.push(window.setTimeout(() => { if (!onRef.current) engine.sleep(); }, run.length * ms + 3500));
    });
    return run.length * ms;
  }, [voice, stopHearing]);

  const value = useMemo<PlayApi>(() => ({
    on, setOn, status: st.status, note: st.note, play, playShape, nowPlaying, hear, stopHearing,
  }), [on, setOn, st.status, st.note, play, playShape, nowPlaying, hear, stopHearing]);

  return <PlayCtx.Provider value={value}>{children}</PlayCtx.Provider>;
}

/**
 * The brief visual flash on a tapped chord. Web Animations on the element
 * itself, so it costs no React state and never re-renders a row.
 */
export function flash(el: Element | null) {
  if (!el || typeof (el as HTMLElement).animate !== "function") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  (el as HTMLElement).animate(
    reduce
      ? [{ opacity: 0.55 }, { opacity: 1 }]
      : [
          { backgroundColor: "color-mix(in srgb, var(--accent-fill, var(--accent)) 38%, transparent)" },
          { backgroundColor: "transparent" },
        ],
    { duration: reduce ? 220 : 420, easing: "ease-out" },
  );
}

// Dev-only inspection hook, for checking voicings from the console
if (IS_DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__songsheetAudio = {
    keyboardVoicing, guitarVoicing, shapeVoicing, midiNames, engine: engine.engineDebug,
  };
}
