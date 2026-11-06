/**
 * Key profiles: "what does a typical piece in C major / C minor look like as a
 * 12-bin chroma?" Index 0 = the tonic, 1 = tonic + 1 semitone, etc. To test
 * another key we simply ROTATE the profile so index 0 lands on that tonic.
 *
 * Krumhansl & Kessler (1982): listeners rated how well each chromatic tone
 * "fits" after a key-establishing context. The numbers are those ratings.
 *
 * Temperley (2005, "kostka-payne"-derived): profiles fitted to a corpus of
 * real music. They tend to do better on pop/rock because they weight the
 * 4th/5th and the subtonic differently than the lab ratings.
 *
 * We use BOTH and average the scores: cheap ensemble, a bit more robust than
 * either alone. Add more sets here (Albrecht-Shanahan, Bellman-Budge, a profile
 * you learn from your own labelled data) and they are picked up automatically.
 */
import type { ModeId } from './types';

export interface ProfileSet {
  name: string;
  major: number[];
  minor: number[];
}

export const KRUMHANSL: ProfileSet = {
  name: 'Krumhansl-Kessler',
  major: [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
  minor: [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
};

export const TEMPERLEY: ProfileSet = {
  name: 'Temperley',
  major: [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0],
  minor: [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0],
};

export const PROFILE_SETS: ProfileSet[] = [KRUMHANSL, TEMPERLEY];

/** Rotate so that profile[0] (the tonic weight) lands on pitch class `tonic`. */
export function rotate(profile: number[], tonic: number): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) out[(i + tonic) % 12] = profile[i];
  return out;
}

/**
 * Modes. Each mode uses the same 7 notes as some MAJOR scale ("parent"):
 * D Dorian = C major notes, tonic D. That is why modes are hard: the note
 * *set* alone cannot tell D Dorian from C major - only which note feels like
 * home can, and that is subtle in the audio.
 *
 * `parentOffset`: semitones from the mode's tonic DOWN to its parent major tonic.
 */
export const MODE_PARENT_OFFSET: Record<Exclude<ModeId, 'major' | 'minor'>, number> = {
  dorian: 2,
  phrygian: 4,
  lydian: 5,
  mixolydian: 7,
};

/**
 * Heuristic template for a mode: take the parent major's profile, then swap the
 * weights of the parent tonic and the mode tonic so the mode's own tonic is the
 * heaviest note. It is a reasonable guess, not something fitted to data - the
 * scoring step applies a small penalty to modal candidates so they only win when
 * they clearly beat plain major/minor.
 */
export function modeTemplate(major: number[], tonic: number, mode: ModeId): number[] {
  if (mode === 'major') return rotate(major, tonic);
  if (mode === 'minor') throw new Error('use the set\'s own minor profile');
  const parent = (((tonic - MODE_PARENT_OFFSET[mode]) % 12) + 12) % 12;
  const t = rotate(major, parent);
  const tmp = t[parent];
  t[parent] = t[tonic];
  t[tonic] = tmp;
  return t;
}
