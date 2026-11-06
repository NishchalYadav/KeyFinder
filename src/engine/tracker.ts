/**
 * Live key tracking for microphone mode (also reusable for any PCM stream).
 *
 * Feed it raw mono samples as they arrive (`push`). It:
 *   1. resamples to the engine rate (22.05 kHz),
 *   2. cuts the stream into overlapping 8192-sample frames and keeps the
 *      spectral peaks of the last `windowSec` seconds,
 *   3. every `updateSec` seconds of audio, runs `decideKey` over that window
 *      with older frames fading out (so a modulation or a new song takes over
 *      within a few updates instead of being averaged away),
 *   4. applies hysteresis so the *displayed* key does not flicker between,
 *      say, C major and A minor on every update.
 */
import { DEFAULT_CHROMA_CONFIG, SpectralAnalyzer } from './chroma';
import { resample } from './audioUtils';
import { paramsForSensitivity } from './params';
import { decideKey } from './windowKey';
import type { KeyModel } from './keyDetector';
import type { DetectionParams, KeyResult, SpectralFrame } from './types';

export type TrackerStatus =
  | 'warming' // not enough audio collected yet
  | 'quiet' // below the noise gate
  | 'noisy' // loud but not tonal enough (speech, traffic, crowd, ...)
  | 'ok';

export interface TrackerOptions {
  /** Sample rate of the samples you pass to `push`. */
  inputSampleRate: number;
  /** 0..1, see paramsForSensitivity. */
  sensitivity?: number;
  includeModes?: boolean;
  /** Seconds of audio between results. The spec asks for 2-4. */
  updateSec?: number;
  /** How much history each decision looks at. */
  windowSec?: number;
  /** Seconds for an old frame's weight to halve. */
  halfLifeSec?: number;
  model?: KeyModel;
}

export interface TrackerUpdate {
  status: TrackerStatus;
  /** What the latest window says, unfiltered. */
  raw: KeyResult | null;
  /** What to show the user (hysteresis applied). */
  stable: KeyResult | null;
  tuningCents: number;
  /** Seconds of audio processed so far. */
  time: number;
}

export class KeyTracker {
  private readonly analyzer = new SpectralAnalyzer();
  private readonly cfg = DEFAULT_CHROMA_CONFIG;
  private readonly params: DetectionParams;
  private readonly updateSec: number;
  private readonly windowSec: number;
  private readonly halfLife: number;
  private readonly model?: KeyModel;
  private readonly inRate: number;

  private pending = new Float32Array(0);
  private frames: SpectralFrame[] = [];
  private frameCount = 0;
  private lastUpdateAt = 0;

  private stable: KeyResult | null = null;
  private challenger: { tonic: number; mode: string; streak: number } | null = null;

  constructor(opts: TrackerOptions) {
    this.inRate = opts.inputSampleRate;
    this.params = paramsForSensitivity(opts.sensitivity ?? 0.5, opts.includeModes ?? false);
    this.updateSec = opts.updateSec ?? 3;
    this.windowSec = opts.windowSec ?? 14;
    this.halfLife = opts.halfLifeSec ?? 6;
    this.model = opts.model;
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.frames = [];
    this.frameCount = 0;
    this.lastUpdateAt = 0;
    this.stable = null;
    this.challenger = null;
  }

  /** Push a chunk of mono samples. Returns 0..n updates (usually 0 or 1). */
  push(samples: Float32Array): TrackerUpdate[] {
    const chunk = resample(samples, this.inRate, this.cfg.sampleRate);
    const merged = new Float32Array(this.pending.length + chunk.length);
    merged.set(this.pending);
    merged.set(chunk, this.pending.length);

    const { fftSize, hopSize, sampleRate } = this.cfg;
    const updates: TrackerUpdate[] = [];
    let pos = 0;
    while (merged.length - pos >= fftSize) {
      const time = (this.frameCount * hopSize + fftSize / 2) / sampleRate;
      this.frames.push(this.analyzer.analyze(merged, pos, time));
      this.frameCount++;
      pos += hopSize;

      // Drop frames older than the window.
      const cutoff = time - this.windowSec;
      while (this.frames.length && this.frames[0].time < cutoff) this.frames.shift();

      if (time - this.lastUpdateAt >= this.updateSec) {
        this.lastUpdateAt = time;
        updates.push(this.decide(time));
      }
    }
    this.pending = merged.slice(pos);
    return updates;
  }

  private decide(now: number): TrackerUpdate {
    const d = decideKey(this.frames, this.params, now, this.halfLife, { model: this.model });
    const recent = this.frames.slice(-8);
    const meanRms = recent.reduce((a, f) => a + f.rms, 0) / Math.max(1, recent.length);

    // Need a few seconds of usable frames before we say anything.
    if (!d.result || d.usableFrames < 6) {
      const status: TrackerStatus =
        this.frames.length < 6 ? 'warming' : meanRms < this.params.gateRms ? 'quiet' : 'noisy';
      return { status, raw: null, stable: this.stable, tuningCents: 0, time: now };
    }
    return {
      status: 'ok',
      raw: d.result,
      stable: this.applyHysteresis(d.result),
      tuningCents: d.tuningCents,
      time: now,
    };
  }

  /**
   * Show a new key only after it wins twice in a row (or wins with high
   * confidence while the current one is weak). Confidence of the *current* key
   * is refreshed whenever it keeps winning.
   */
  private applyHysteresis(r: KeyResult): KeyResult {
    const cur = this.stable;
    if (!cur) { this.stable = r; return r; }
    if (cur.tonic === r.tonic && cur.mode === r.mode) {
      this.challenger = null;
      this.stable = r;
      return r;
    }
    const ch = this.challenger;
    if (ch && ch.tonic === r.tonic && ch.mode === r.mode) ch.streak++;
    else this.challenger = { tonic: r.tonic, mode: r.mode, streak: 1 };

    const streak = this.challenger!.streak;
    if (streak >= 2 || (r.confidence > 0.8 && r.confidence > cur.confidence + 0.3)) {
      this.stable = r;
      this.challenger = null;
      return r;
    }
    return cur;
  }
}
