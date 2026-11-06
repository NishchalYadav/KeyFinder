/**
 * Offline analysis for In-App Playback mode (and anything else where we have
 * the whole file). Because we see the entire track we can:
 *   - use flat weights over the full duration -> the most accurate "track key",
 *   - answer "what key is it around 1:23?" instantly with `keyAt`,
 *   - find sections where the key changes (`segments`).
 *
 * Everything runs in JS but is cheap: a 4-minute track is ~650 FFTs.
 */
import { DEFAULT_CHROMA_CONFIG, SpectralAnalyzer } from './chroma';
import { downmixToMono, resample } from './audioUtils';
import { paramsForSensitivity } from './params';
import { decideKey } from './windowKey';
import type { KeyModel } from './keyDetector';
import type { DetectionParams, KeyResult, SpectralFrame } from './types';

export interface TrackAnalysis {
  durationSec: number;
  frames: SpectralFrame[];
  params: DetectionParams;
  /** Whole-track key, or null if the audio is silent/atonal. */
  overall: KeyResult | null;
  tuningCents: number;
  /** Key of the audio within +-halfWindowSec of `timeSec`. */
  keyAt(timeSec: number, halfWindowSec?: number): KeyResult | null;
  /** Consecutive sections (>= ~20 s) with a different key. Handy for showing modulations. */
  segments(windowSec?: number): { start: number; end: number; result: KeyResult }[];
}

export interface AnalyzeOptions {
  sensitivity?: number;
  includeModes?: boolean;
  model?: KeyModel;
  /** Called with 0..1 so the UI can show a progress bar. */
  onProgress?: (p: number) => void;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function analyzeTrack(
  channels: Float32Array[],
  sampleRate: number,
  opts: AnalyzeOptions = {},
): Promise<TrackAnalysis> {
  const cfg = DEFAULT_CHROMA_CONFIG;
  const mono = resample(downmixToMono(channels), sampleRate, cfg.sampleRate);
  const params = paramsForSensitivity(opts.sensitivity ?? 0.5, opts.includeModes ?? false);
  const analyzer = new SpectralAnalyzer(cfg);

  const frames: SpectralFrame[] = [];
  const total = Math.max(1, Math.floor((mono.length - cfg.fftSize) / cfg.hopSize) + 1);
  for (let i = 0, pos = 0; pos + cfg.fftSize <= mono.length; i++, pos += cfg.hopSize) {
    frames.push(analyzer.analyze(mono, pos, (pos + cfg.fftSize / 2) / cfg.sampleRate));
    if (i % 60 === 59) { // yield so the UI thread stays responsive
      opts.onProgress?.(Math.min(1, (i + 1) / total));
      await tick();
    }
  }
  opts.onProgress?.(1);

  const model = opts.model;
  const full = decideKey(frames, params, 0, Infinity, { model });
  const durationSec = mono.length / cfg.sampleRate;

  const keyAt = (t: number, half = 8): KeyResult | null => {
    const sub = frames.filter((f) => Math.abs(f.time - t) <= half);
    return decideKey(sub, params, t, Infinity, { model }).result;
  };

  const segments = (windowSec = 20) => {
    const out: { start: number; end: number; result: KeyResult }[] = [];
    for (let s = 0; s < durationSec; s += windowSec) {
      const e = Math.min(durationSec, s + windowSec);
      const sub = frames.filter((f) => f.time >= s && f.time < e);
      const r = decideKey(sub, params, e, Infinity, { model }).result;
      if (!r) continue;
      const last = out[out.length - 1];
      if (last && last.result.tonic === r.tonic && last.result.mode === r.mode) last.end = e;
      else out.push({ start: s, end: e, result: r });
    }
    return out;
  };

  return { durationSec, frames, params, overall: full.result, tuningCents: full.tuningCents, keyAt, segments };
}
