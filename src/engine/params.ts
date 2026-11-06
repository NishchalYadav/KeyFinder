import type { DetectionParams } from './types';

/**
 * Map the user-facing "sensitivity" (0 = only trust loud, clearly musical
 * input; 1 = accept quiet / messy input) to the noise-gate thresholds.
 *
 *  - gateRms: 0.02 (-34 dBFS) at 0, 0.002 (-54 dBFS) at 1, log-interpolated.
 *  - minTonalness: how "peaky" a frame's spectrum must be to count as music.
 *
 * Low sensitivity = fewer, cleaner frames = steadier answer in a noisy car
 * but slower to wake up on quiet music. High sensitivity = the opposite.
 */
export function paramsForSensitivity(sensitivity: number, includeModes = false): DetectionParams {
  const s = Math.min(1, Math.max(0, sensitivity));
  return {
    gateRms: 0.02 * Math.pow(0.1, s),
    minTonalness: 0.2 - 0.12 * s,
    includeModes,
  };
}
