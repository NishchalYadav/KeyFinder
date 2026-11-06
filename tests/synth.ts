/**
 * Tiny music synthesiser for tests: chord progressions + a scale-based melody
 * + optional noise, so we can check the engine on all 24 keys without needing
 * audio files. Harmonic tones (1/h amplitude, 8 partials) mimic real
 * instruments closely enough to exercise the partial-vs-fundamental problem.
 */
import { MODE_INTERVALS } from '../src/engine/musicTheory';
import type { ModeId } from '../src/engine/types';

const midiToHz = (m: number, cents = 0) => 440 * Math.pow(2, (m - 69 + cents / 100) / 12);

// Mulberry32: deterministic RNG so test failures are reproducible.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addTone(out: Float32Array, sr: number, start: number, dur: number, hz: number, amp: number) {
  const s0 = Math.floor(start * sr);
  const n = Math.floor(dur * sr);
  for (let h = 1; h <= 6; h++) {
    const f = hz * h;
    if (f > sr / 2 - 200) break;
    const a = amp / h;
    const w = (2 * Math.PI * f) / sr;
    for (let i = 0; i < n && s0 + i < out.length; i++) {
      // short attack/release envelope
      const e = Math.min(1, i / (0.02 * sr), (n - i) / (0.05 * sr));
      out[s0 + i] += a * e * Math.sin(w * i);
    }
  }
}

export interface SynthOptions {
  tonic: number;
  mode: ModeId;
  seconds?: number;
  sr?: number;
  detuneCents?: number;
  noiseDb?: number | null; // signal-to-noise ratio in dB; null = none
  gain?: number;
  seed?: number;
}

/** Degrees (0-based) of the progression, per mode. Chosen to be typical, not "easy". */
function progression(mode: ModeId): number[][] {
  switch (mode) {
    case 'major': return [[0, 4, 5, 3], [0, 3, 4, 0], [5, 3, 0, 4]]; // I V vi IV / I IV V I / vi IV I V
    // i VI iv V / i iv V i / i III VII V  (V is MAJOR - raised 7th - as in real minor-key songs)
    case 'minor': return [[0, 5, 3, 4], [0, 3, 4, 0], [0, 2, 6, 4]];
    default: return [[0, 3, 0, 3]];
  }
}

export function synthSong(o: SynthOptions): Float32Array {
  const sr = o.sr ?? 22050;
  const seconds = o.seconds ?? 18;
  const out = new Float32Array(Math.floor(seconds * sr));
  const rand = rng(o.seed ?? 1);
  const scale = MODE_INTERVALS[o.mode];
  const cents = o.detuneCents ?? 0;
  const prog = progression(o.mode);
  const chordLen = 1.5;
  const nChords = Math.floor(seconds / chordLen);
  const base = 48 + o.tonic; // tonic around C3..B3

  for (let c = 0; c < nChords; c++) {
    const p = prog[Math.floor(c / 4) % prog.length];
    const deg = p[c % 4];
    const t0 = c * chordLen;
    const rootSemis = scale[deg];
    let thirdSemis = scale[(deg + 2) % 7] + (deg + 2 >= 7 ? 12 : 0);
    const harmonicV = o.mode === 'minor' && deg === 4;
    if (harmonicV) thirdSemis += 1; // major V: raised leading tone
    const fifthSemis = scale[(deg + 4) % 7] + (deg + 4 >= 7 ? 12 : 0);
    // bass (octave below), triad
    addTone(out, sr, t0, chordLen, midiToHz(base - 12 + rootSemis, cents), 0.25);
    for (const s of [rootSemis, thirdSemis, fifthSemis]) addTone(out, sr, t0, chordLen, midiToHz(base + s, cents), 0.12);
    // melody: 3 scale notes per chord in the octave above
    for (let m = 0; m < 3; m++) {
      const d = Math.floor(rand() * 7);
      addTone(out, sr, t0 + (m * chordLen) / 3, chordLen / 3, midiToHz(base + 12 + scale[d], cents), 0.1);
    }
  }
  // normalise to a peak of `gain`
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = (o.gain ?? 0.5) / (peak || 1);
  for (let i = 0; i < out.length; i++) out[i] *= g;

  if (o.noiseDb != null) {
    let sig = 0;
    for (const v of out) sig += v * v;
    sig = Math.sqrt(sig / out.length);
    const nAmp = sig / Math.pow(10, o.noiseDb / 20);
    for (let i = 0; i < out.length; i++) out[i] += (rand() * 2 - 1) * nAmp * Math.sqrt(3);
  }
  return out;
}

/** Plain white noise, for gate tests. */
export function whiteNoise(seconds: number, sr: number, amp: number, seed = 7): Float32Array {
  const r = rng(seed);
  const out = new Float32Array(Math.floor(seconds * sr));
  for (let i = 0; i < out.length; i++) out[i] = (r() * 2 - 1) * amp;
  return out;
}
