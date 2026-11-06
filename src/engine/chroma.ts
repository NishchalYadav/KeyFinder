/**
 * STEP 1 of key detection: audio -> chromagram.
 *
 * A "chroma vector" is 12 numbers: how much energy the audio has in each pitch
 * class (C, C#, D ... B), with all octaves folded together. Key detection is
 * then a question of which scale's note usage that 12-number fingerprint
 * resembles most.
 *
 * Pipeline per frame (8192 samples @ 22.05 kHz = 0.37 s, hop 4096):
 *   1. Hann window + FFT.
 *   2. Pick spectral PEAKS (local maxima well above the average level) and
 *      refine their frequency with parabolic interpolation. Using peaks rather
 *      than every FFT bin ignores broadband noise/percussion and gives sub-bin
 *      frequency accuracy, which matters because low notes are only a few Hz
 *      apart.
 *   3. Store (frequency, weight) pairs -> `SpectralFrame`.
 *
 * Later (`framesToChroma`) the peaks of many frames are folded into 12 bins
 * using a TUNING estimate, so songs recorded a bit sharp/flat (or played back
 * at a slightly off speed) are still assigned to the right pitch classes.
 */
import { FFT } from './fft';
import { rms } from './audioUtils';
import type { DetectionParams, SpectralFrame } from './types';

export interface ChromaConfig {
  sampleRate: number;
  fftSize: number;
  hopSize: number;
  /** Ignore everything below this: rumble, and bins too coarse to resolve semitones. */
  minFreq: number;
  /** Ignore everything above this: mostly hiss/cymbals, and upper partials that map to the wrong pitch class. */
  maxFreq: number;
}

export const DEFAULT_CHROMA_CONFIG: ChromaConfig = {
  sampleRate: 22050,
  fftSize: 8192,
  hopSize: 4096,
  minFreq: 70,
  maxFreq: 4000,
};

export class SpectralAnalyzer {
  readonly cfg: ChromaConfig;
  private readonly fft: FFT;
  private readonly window: Float64Array;
  private readonly re: Float64Array;
  private readonly im: Float64Array;
  private readonly mag: Float64Array;
  private readonly kMin: number;
  private readonly kMax: number;

  constructor(cfg: ChromaConfig = DEFAULT_CHROMA_CONFIG) {
    this.cfg = cfg;
    const n = cfg.fftSize;
    this.fft = new FFT(n);
    this.window = new Float64Array(n);
    for (let i = 0; i < n; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    this.re = new Float64Array(n);
    this.im = new Float64Array(n);
    this.mag = new Float64Array(n / 2);
    const binHz = cfg.sampleRate / n;
    this.kMin = Math.max(2, Math.floor(cfg.minFreq / binHz));
    this.kMax = Math.min(n / 2 - 2, Math.ceil(cfg.maxFreq / binHz));
  }

  /** Analyse `fftSize` samples starting at `offset`. `time` = frame centre in seconds. */
  analyze(samples: Float32Array, offset: number, time: number): SpectralFrame {
    const { fftSize: n, sampleRate } = this.cfg;
    const { re, im, mag, window } = this;
    for (let i = 0; i < n; i++) {
      re[i] = samples[offset + i] * window[i];
      im[i] = 0;
    }
    const frameRms = rms(samples, offset, offset + n);
    this.fft.transform(re, im);

    let sum = 0;
    let max = 0;
    let energy = 0;
    for (let k = this.kMin; k <= this.kMax; k++) {
      const m = Math.hypot(re[k], im[k]);
      mag[k] = m;
      sum += m;
      energy += m * m;
      if (m > max) max = m;
    }
    const meanMag = sum / (this.kMax - this.kMin + 1);
    // A bin is a "peak" if it is a local maximum AND clearly above the crowd.
    const threshold = Math.max(max * 0.02, meanMag * 3);
    const binHz = sampleRate / n;

    const freqs: number[] = [];
    const weights: number[] = [];
    let peakEnergy = 0;
    for (let k = this.kMin + 1; k < this.kMax; k++) {
      const m = mag[k];
      if (m <= threshold || m <= mag[k - 1] || m < mag[k + 1]) continue;
      // Parabolic interpolation on log-magnitude -> fractional bin position.
      const a = Math.log(mag[k - 1] + 1e-12);
      const b = Math.log(m + 1e-12);
      const c = Math.log(mag[k + 1] + 1e-12);
      const denom = a - 2 * b + c;
      const delta = denom === 0 ? 0 : (0.5 * (a - c)) / denom;
      const f = (k + delta) * binHz;
      // Weight: sqrt-compress the magnitude (so one loud partial can't dominate
      // the whole frame) and gently favour low/mid frequencies, where the
      // fundamentals and the bass line - the strongest tonic cues - live.
      weights.push(Math.sqrt(m) / (1 + f / 2000));
      freqs.push(f);
      peakEnergy += m * m;
    }
    return {
      time,
      rms: frameRms,
      tonalness: energy > 0 ? peakEnergy / energy : 0,
      peakFreq: Float32Array.from(freqs),
      peakWeight: Float32Array.from(weights),
    };
  }
}

/** Is this frame loud and tonal enough to trust? (The "noise gate".) */
export function isUsable(f: SpectralFrame, p: DetectionParams): boolean {
  return f.rms >= p.gateRms && f.tonalness >= p.minTonalness && f.peakFreq.length >= 3;
}

/**
 * Estimate how far the music is tuned from A4 = 440 Hz, in semitones (-0.5..0.5).
 * Every peak sits at some fractional distance from the nearest 12-TET note; we
 * average those distances on a circle (so +0.49 and -0.49 agree) weighted by
 * peak strength.
 */
export function estimateTuning(frames: SpectralFrame[], weights: ArrayLike<number>): number {
  let c = 0;
  let s = 0;
  let total = 0;
  for (let i = 0; i < frames.length; i++) {
    const w = weights[i];
    if (!w) continue;
    const { peakFreq, peakWeight } = frames[i];
    for (let j = 0; j < peakFreq.length; j++) {
      const m = 69 + 12 * Math.log2(peakFreq[j] / 440);
      const ang = 2 * Math.PI * (m - Math.round(m));
      const pw = peakWeight[j] * w;
      c += pw * Math.cos(ang);
      s += pw * Math.sin(ang);
      total += pw;
    }
  }
  if (total === 0) return 0;
  // Resultant length ~0 means deviations are uniformly spread (noise, or
  // non-tonal audio): there is no reliable tuning, so assume 0.
  if (Math.hypot(c, s) / total < 0.15) return 0;
  return Math.atan2(s, c) / (2 * Math.PI);
}

/**
 * Fold the peaks of several frames into one 12-bin chroma vector (sums to 1).
 *
 * `frameWeights[i]` lets the caller fade out old frames and zero-out gated
 * ones. Each frame is first normalised to sum 1 so that a loud chorus does not
 * outvote a quiet verse - we want "which notes are used", not "what's loudest".
 */
export function framesToChroma(
  frames: SpectralFrame[],
  frameWeights: ArrayLike<number>,
  tuning: number,
): number[] {
  const out = new Float64Array(12);
  const tmp = new Float64Array(12);
  for (let i = 0; i < frames.length; i++) {
    const fw = frameWeights[i];
    if (!fw) continue;
    tmp.fill(0);
    const { peakFreq, peakWeight } = frames[i];
    let sum = 0;
    for (let j = 0; j < peakFreq.length; j++) {
      const m = 69 + 12 * Math.log2(peakFreq[j] / 440) - tuning;
      const r = Math.round(m);
      // Peaks that fall between two notes (inharmonic partials, noise) count less.
      const closeness = 0.5 + 0.5 * Math.cos(2 * Math.PI * (m - r));
      const pc = ((r % 12) + 12) % 12; // MIDI 69 = A -> pc 9; 69 % 12 = 9. Good.
      const v = peakWeight[j] * closeness;
      tmp[pc] += v;
      sum += v;
    }
    if (sum <= 0) continue;
    for (let p = 0; p < 12; p++) out[p] += (fw * tmp[p]) / sum;
  }
  let total = 0;
  for (let p = 0; p < 12; p++) total += out[p];
  return Array.from(out, (v) => (total > 0 ? v / total : 0));
}
