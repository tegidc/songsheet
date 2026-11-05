/**
 * The Ambient instrument: a soft pad made entirely in Web Audio, so it needs
 * no samples and works offline (it is also the fallback when samples fail).
 *
 * Per note, three slightly detuned oscillators (two triangles a few cents
 * apart, one quiet saw an octave down for body) → a lowpass → the chord's own
 * envelope bus. Every chord bus feeds a shared dry/wet split, the wet side
 * through a convolver whose impulse response is generated (decaying stereo
 * noise), so there is no IR file to fetch either.
 *
 * A new chord crossfades: the old bus releases over ~1.2 s as the new one
 * swells in over 0.4 s. Left alone, a chord holds a few seconds and then
 * releases over 2.5 s, so it is still a one-shot.
 */

export interface Pad {
  play: (midi: number[], when: number, roll: number) => void;
  release: (seconds: number) => void;
}

const ATTACK = 0.4;
const RELEASE = 2.5;
const HOLD = 3.2;

export function createPad(ctx: AudioContext, out: AudioNode): Pad {
  const dry = ctx.createGain(); dry.gain.value = 0.75;
  const wet = ctx.createGain(); wet.gain.value = 0.45;
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 3.2, 2.6);
  dry.connect(out); wet.connect(verb); verb.connect(out);

  let live: { bus: GainNode; oscs: OscillatorNode[]; end: number } | null = null;

  const let_go = (seconds: number) => {
    if (!live) return;
    const { bus, oscs } = live;
    const t = ctx.currentTime;
    bus.gain.cancelScheduledValues(t);
    bus.gain.setValueAtTime(bus.gain.value, t);
    bus.gain.setTargetAtTime(0, t, Math.max(0.05, seconds / 4));
    oscs.forEach(o => { try { o.stop(t + seconds + 0.2); } catch { /* stopped */ } });
    live = null;
  };

  return {
    release: let_go,
    play(midi, when, roll) {
      let_go(1.2);
      const bus = ctx.createGain();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1400; lp.Q.value = 0.4;
      bus.connect(dry); bus.connect(wet);
      lp.connect(bus);

      // Level per note falls with chord size; the bus envelope does the shaping
      const perNote = 0.16 / Math.sqrt(midi.length);
      const oscs: OscillatorNode[] = [];
      midi.forEach((m, i) => {
        const f = 440 * Math.pow(2, (m - 69) / 12);
        const g = ctx.createGain(); g.gain.value = perNote;
        g.connect(lp);
        const start = when + i * roll;
        const voices: Array<[OscillatorType, number, number, number]> = [
          ["triangle", f, -6, 1],
          ["triangle", f, +7, 1],
          ["sawtooth", f / 2, 0, 0.18],
        ];
        for (const [type, freq, cents, level] of voices) {
          const o = ctx.createOscillator();
          o.type = type; o.frequency.value = freq; o.detune.value = cents;
          const vg = ctx.createGain(); vg.gain.value = level;
          o.connect(vg); vg.connect(g);
          o.start(start);
          oscs.push(o);
        }
      });

      const end = when + ATTACK + HOLD;
      bus.gain.setValueAtTime(0, when);
      bus.gain.linearRampToValueAtTime(1, when + ATTACK);
      bus.gain.setValueAtTime(1, end);
      bus.gain.setTargetAtTime(0, end, RELEASE / 4);
      oscs.forEach(o => o.stop(end + RELEASE + 0.3));
      live = { bus, oscs, end };
    },
  };
}

/** Exponentially decaying stereo noise — a plain, warm room. */
function impulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // A touch of pre-delay, then the tail; soften the very top end by
      // averaging with the previous sample
      const t = i / len;
      const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      d[i] = i < rate * 0.012 ? 0 : (n + (d[i - 1] ?? 0)) * 0.5;
    }
  }
  return buf;
}
