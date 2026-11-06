/** Shared types for the key-detection engine (pure TypeScript, no native deps). */

/** Pitch classes are integers 0..11 with C = 0, C#/Db = 1, ... B = 11. */
export type ModeId =
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian';

export interface KeyId {
  tonic: number; // 0..11
  mode: ModeId;
}

export interface KeyCandidate extends KeyId {
  /** Mean Pearson correlation between the chroma and the key templates (-1..1). */
  score: number;
  /** Softmax probability over all candidates (0..1). */
  probability: number;
}

export interface KeyResult extends KeyId {
  /** 0..1. See `detectKey` for exactly how this is computed. */
  confidence: number;
  /** Best raw correlation (-1..1); a "how well does the audio fit any key" signal. */
  fit: number;
  /** Second-best candidate, useful for showing "or C Major" when ambiguous. */
  runnerUp: KeyCandidate | null;
  /** The 12-bin chroma vector the decision was based on (normalised to sum 1). */
  chroma: number[];
}

/**
 * Peaks + loudness of one FFT frame. We store peaks rather than a finished
 * chroma vector so that tuning can be estimated over a whole window and then
 * applied afterwards (see chroma.ts).
 */
export interface SpectralFrame {
  /** Time of the frame centre, seconds from the start of the stream/track. */
  time: number;
  /** RMS of the raw (un-windowed) samples, 0..1. Used by the noise gate. */
  rms: number;
  /** Fraction of band energy that sits in spectral peaks (0..1). Noise -> low. */
  tonalness: number;
  peakFreq: Float32Array;
  peakWeight: Float32Array;
}

/** Knobs derived from the user's "sensitivity" setting. */
export interface DetectionParams {
  /** Frames quieter than this (RMS) are ignored by the noise gate. */
  gateRms: number;
  /** Frames less tonal than this are treated as noise and ignored. */
  minTonalness: number;
  /** Also test Dorian / Phrygian / Lydian / Mixolydian templates. */
  includeModes: boolean;
}
