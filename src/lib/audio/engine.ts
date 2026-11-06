import type { Instrument } from "../prefs";
import type { Voicing } from "./voicing";
import { createPad, type Pad } from "./pad";

/**
 * The audio engine. One AudioContext for the app, created only by the user
 * switching Play on (iOS will not start audio any other way), and nothing
 * fetched until then. Only the instrument in use is loaded.
 *
 * Signal path:  instrument → master gain → limiter → speakers
 * The limiter (a fast compressor) is what keeps rapid taps on six-note chords
 * from summing past full scale.
 */

export type EngineStatus = "off" | "loading" | "ready" | "fallback";

type Sampler = {
  start: (e: { note: number; velocity?: number; time?: number; duration?: number | null }) => (time?: number) => void;
  stop: (t?: unknown) => void;
  ready: Promise<void>;
  output?: { volume: number };
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let pad: Pad | null = null;
const samplers: Partial<Record<"piano" | "guitar", Sampler>> = {};
const loading: Partial<Record<"piano" | "guitar", Promise<boolean>>> = {};
let held: Array<(time?: number) => void> = [];

let status: EngineStatus = "off";
// A stable snapshot object, replaced only on change — useSyncExternalStore
// compares by identity and would loop on a fresh object per read.
let snapshot: { status: EngineStatus; note: string } = { status, note: "" };
const listeners = new Set<() => void>();
const setStatus = (s: EngineStatus, note = "") => {
  if (s === status && note === snapshot.note) return;
  status = s; snapshot = { status: s, note };
  listeners.forEach(f => f());
};
export const getStatus = () => snapshot;
export const subscribeStatus = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

/**
 * Call from inside the click/tap that switches Play on. Creates or resumes the
 * context, and asks iOS to treat this as media playback so the ringer switch
 * doesn't mute it.
 */
export function unlock(): AudioContext | null {
  try {
    // iOS 17+: "playback" ignores the silent switch, as music apps do
    const nav = navigator as Navigator & { audioSession?: { type: string } };
    if (nav.audioSession) { try { nav.audioSession.type = "playback"; } catch { /* older WebKit */ } }
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC({ latencyHint: "interactive" });
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.knee.value = 4; limiter.ratio.value = 12;
      limiter.attack.value = 0.003; limiter.release.value = 0.15;
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(limiter); limiter.connect(ctx.destination);
    }
    if (ctx.state !== "running") void ctx.resume();
    // A silent one-sample buffer, started inside the gesture — older iOS
    // needs a node actually started in the tap before it unmutes the context.
    const b = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start(0);
    return ctx;
  } catch {
    return null;
  }
}

/** Suspend when Play goes off — releases the audio hardware on phones. */
export function sleep() {
  releaseHeld(0.3);
  if (ctx && ctx.state === "running") setTimeout(() => { if (ctx && !playOnFlag) void ctx.suspend(); }, 600);
  setStatus("off");
}
let playOnFlag = false;
export function setPlayOnFlag(on: boolean) { playOnFlag = on; }

async function loadSampler(kind: "piano" | "guitar"): Promise<boolean> {
  if (samplers[kind]) return true;
  if (loading[kind]) return loading[kind]!;
  if (!ctx || !master) return false;
  const c = ctx, out = master;
  loading[kind] = (async () => {
    try {
      // Dynamic import: smplr is not in the main bundle at all until Play is used
      const smplr = await import("smplr");
      const inst: Sampler = kind === "piano"
        ? smplr.SplendidGrandPiano(c, {
            destination: out, volume: 90, decayTime: 0.45,
            // E1–C6 covers every voicing this app makes; skip the rest of the keyboard
            notesToLoad: { notes: range(28, 84), velocityRange: [40, 110] },
          }) as unknown as Sampler
        : smplr.Soundfont(c, {
            destination: out, volume: 100, instrument: "acoustic_guitar_steel", kit: "MusyngKite",
          }) as unknown as Sampler;
      await withTimeout(inst.ready, 20000);
      samplers[kind] = inst;
      return true;
    } catch {
      return false;
    } finally {
      delete loading[kind];
    }
  })();
  return loading[kind]!;
}

function ensurePad(): Pad | null {
  if (!ctx || !master) return null;
  if (!pad) pad = createPad(ctx, master);
  return pad;
}

/**
 * Get `inst` ready. Samples that fail (offline, blocked CDN) fall back to the
 * Ambient pad, which needs no network, and say so.
 */
export async function prepare(inst: Instrument): Promise<void> {
  if (!ctx) return;
  if (inst === "ambient") { ensurePad(); setStatus("ready"); return; }
  if (samplers[inst]) { setStatus("ready"); return; }
  setStatus("loading");
  const ok = await loadSampler(inst);
  if (current !== inst) return;               // switched again while loading
  if (ok) setStatus("ready");
  else { ensurePad(); setStatus("fallback", `${inst} samples didn't load — playing ambient`); }
}

let current: Instrument = "piano";
export function setInstrument(inst: Instrument) {
  current = inst;
  if (ctx) void prepare(inst);
}

function releaseHeld(release = 0.25) {
  const t = ctx ? ctx.currentTime : 0;
  held.forEach(stop => { try { stop(t + 0.01); } catch { /* already ended */ } });
  held = [];
  pad?.release(release);
}

/**
 * Sound a voicing. One-shot: the previous chord is let go (piano damps, pad
 * crossfades) as this one starts.
 */
export function playVoicing(v: Voicing | null) {
  if (!v || !v.midi.length || !ctx || !master) return;
  if (ctx.state !== "running") void ctx.resume();
  const now = ctx.currentTime + 0.01;
  const useSampler = current !== "ambient" && samplers[current] && status !== "fallback";
  const roll = v.roll ? (current === "guitar" ? 0.03 : 0.022) : (current === "guitar" ? 0.03 : 0);
  // Quieter per note as chords get denser, so a six-note shape isn't louder than a triad
  const vel = Math.round(Math.max(55, 92 - v.midi.length * 5));

  releaseHeld(useSampler ? 0.25 : 1.2);

  if (useSampler) {
    const s = samplers[current as "piano" | "guitar"]!;
    held = v.midi.map((note, i) => s.start({ note, velocity: vel, time: now + i * roll, duration: current === "guitar" ? 3.5 : 4.5 }));
  } else {
    ensurePad()?.play(v.midi, now, roll);
  }
}

/**
 * The fretboard's own voice: always the guitar, whatever Play's instrument
 * is, and independent of Play mode. Called from inside the click that placed
 * the note, so it can unlock audio itself. The first note waits for the
 * guitar samples (a second or so, once); if they never come, the pad stands in.
 */
const auditioned: string[] = [];
export async function audition(midi: number[], strum = false) {
  const c = unlock();
  if (!c || !master || !midi.length) return;
  const asked = c.currentTime;
  const ok = samplers.guitar ? true : await loadSampler("guitar");
  // A note that arrives long after its click is worse than none
  if (c.currentTime - asked > 2.5) return;
  // Play going off may have suspended the context while the samples loaded
  if (c.state !== "running") { try { await c.resume(); } catch { return; } }
  const now = c.currentTime + 0.01;
  const gap = strum ? 0.035 : 0;
  auditioned.push(midi.join(" ")); if (auditioned.length > 8) auditioned.shift();
  if (ok && samplers.guitar) {
    const vel = Math.round(Math.max(60, 95 - midi.length * 5));
    midi.forEach((note, i) => samplers.guitar!.start({ note, velocity: vel, time: now + i * gap, duration: 3 }));
  } else {
    ensurePad()?.play(midi, now, gap);
  }
}

/** Test/inspection hook: the engine's live state. */
export const engineDebug = () => ({ ctxState: ctx?.state ?? "none", status, current, loaded: Object.keys(samplers), auditioned: auditioned.slice(-8) });

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("timeout")), ms);
    p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); });
  });
}
