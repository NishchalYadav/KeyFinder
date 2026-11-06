/**
 * Shared "frames -> key" step used by both the live tracker and the offline
 * analyser, so microphone mode and in-app mode make decisions identically.
 */
import { estimateTuning, framesToChroma, isUsable } from './chroma';
import { detectKey, type DetectOptions } from './keyDetector';
import type { DetectionParams, KeyResult, SpectralFrame } from './types';

export interface WindowDecision {
  result: KeyResult | null;
  usableFrames: number;
  totalFrames: number;
  /** Estimated tuning offset from A=440 in cents. */
  tuningCents: number;
}

/**
 * Decide the key for `frames`.
 * @param now        time (s) the decay is measured from (usually the newest frame)
 * @param halfLife   seconds for a frame's influence to halve (Infinity = flat weights)
 */
export function decideKey(
  frames: SpectralFrame[],
  params: DetectionParams,
  now: number,
  halfLife: number,
  extra: Omit<DetectOptions, 'includeModes'> = {},
): WindowDecision {
  const w = new Float64Array(frames.length);
  let usable = 0;
  for (let i = 0; i < frames.length; i++) {
    if (!isUsable(frames[i], params)) continue;
    usable++;
    w[i] = Number.isFinite(halfLife) ? Math.pow(0.5, (now - frames[i].time) / halfLife) : 1;
  }
  if (usable === 0) return { result: null, usableFrames: 0, totalFrames: frames.length, tuningCents: 0 };
  const tuning = estimateTuning(frames, w);
  const chroma = framesToChroma(frames, w, tuning);
  const result = detectKey(chroma, { ...extra, includeModes: params.includeModes });
  return { result, usableFrames: usable, totalFrames: frames.length, tuningCents: tuning * 100 };
}
