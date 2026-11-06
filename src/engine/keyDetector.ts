/**
 * STEP 2 of key detection: chroma -> key (Krumhansl-Schmuckler).
 *
 * K-S in one sentence: correlate the 12-bin chroma with the 24 rotated
 * major/minor profiles and pick the key whose profile correlates best.
 * Pearson correlation is used because it ignores overall level and offset -
 * it only compares the *shape* of note usage.
 *
 * Extras on top of textbook K-S:
 *   - Ensemble of two profile sets (averaged correlation).
 *   - Optional modal candidates (Dorian, Phrygian, Lydian, Mixolydian) with a
 *     small penalty so they must clearly beat plain major/minor.
 *   - A calibrated-ish confidence (see `detectKey`).
 *   - An optional ML blend hook (`KeyModel`) - see docs in README.
 */
import { MODE_PARENT_OFFSET, PROFILE_SETS, modeTemplate, rotate } from './profiles';
import type { KeyCandidate, KeyResult, ModeId } from './types';

export const MODAL_PENALTY = 0.04;
/** Softmax temperature: smaller = more decisive probabilities. Tuned on synthetic data (tests/engine.test.ts). */
export const SOFTMAX_TEMPERATURE = 0.06;

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y; da += x * x; db += y * y;
  }
  const den = Math.sqrt(da * db);
  return den === 0 ? 0 : num / den;
}

export const MAJOR_MINOR: ModeId[] = ['major', 'minor'];
export const MODAL: ModeId[] = ['dorian', 'phrygian', 'lydian', 'mixolydian'];

/** Pre-rotated templates: templates[mode][tonic] = list of profiles (one per profile set). */
const templateCache = new Map<ModeId, number[][][]>();
function templatesFor(mode: ModeId): number[][][] {
  let t = templateCache.get(mode);
  if (!t) {
    t = [];
    for (let tonic = 0; tonic < 12; tonic++) {
      t.push(
        PROFILE_SETS.map((ps) =>
          mode === 'major' ? rotate(ps.major, tonic)
          : mode === 'minor' ? rotate(ps.minor, tonic)
          : modeTemplate(ps.major, tonic, mode),
        ),
      );
    }
    templateCache.set(mode, t);
  }
  return t;
}

/** Optional learned model: chroma (12) -> logits/probabilities over the keys it knows. */
export interface KeyModel {
  /** Return a probability per (tonic, mode) it can score; unlisted keys get 0. */
  predict(chroma: number[]): Partial<Record<string, number>>; // key like "0:major"
}

export interface DetectOptions {
  includeModes?: boolean;
  /** Optional ML model; its probabilities are averaged with the K-S softmax. */
  model?: KeyModel;
  /** 0..1 weight of the model in the blend. Default 0.5. */
  modelWeight?: number;
}

/** Score every candidate key, best first. */
export function rankKeys(chroma: number[], opts: DetectOptions = {}): KeyCandidate[] {
  const modes: ModeId[] = opts.includeModes ? [...MAJOR_MINOR, ...MODAL] : MAJOR_MINOR;
  const raw: { tonic: number; mode: ModeId; score: number }[] = [];
  for (const mode of modes) {
    const tpl = templatesFor(mode);
    for (let tonic = 0; tonic < 12; tonic++) {
      let s = 0;
      for (const p of tpl[tonic]) s += pearson(chroma, p);
      s /= tpl[tonic].length;
      if (mode in MODE_PARENT_OFFSET) s -= MODAL_PENALTY;
      raw.push({ tonic, mode, score: s });
    }
  }
  // Softmax over scores -> probabilities.
  const maxS = Math.max(...raw.map((r) => r.score));
  const exps = raw.map((r) => Math.exp((r.score - maxS) / SOFTMAX_TEMPERATURE));
  const z = exps.reduce((a, b) => a + b, 0);
  let cands: KeyCandidate[] = raw.map((r, i) => ({ ...r, probability: exps[i] / z }));

  if (opts.model) {
    const w = opts.modelWeight ?? 0.5;
    const mp = opts.model.predict(chroma);
    cands = cands.map((c) => ({
      ...c,
      probability: (1 - w) * c.probability + w * (mp[`${c.tonic}:${c.mode}`] ?? 0),
    }));
  }
  return cands.sort((a, b) => b.probability - a.probability || b.score - a.score);
}

/**
 * Detect the key of a chroma vector.
 *
 * confidence = probability(best key)  x  fitFactor
 *   - probability: softmax over all candidate keys. It collapses toward 0.5 when
 *     two keys tie - typically a major key and its relative minor, which share
 *     all their notes - so "C major vs A minor" honestly reads as ~50%.
 *   - fitFactor: how well the best template matches in absolute terms
 *     (correlation 0.25 -> 0.2, correlation 0.75+ -> 1). Atonal / noisy /
 *     very sparse audio matches nothing well and is capped low even if one
 *     key happens to edge out the rest.
 */
export function detectKey(chroma: number[], opts: DetectOptions = {}): KeyResult | null {
  const energy = chroma.reduce((a, b) => a + b, 0);
  if (!(energy > 0)) return null;
  const ranked = rankKeys(chroma, opts);
  const best = ranked[0];
  const fitFactor = Math.min(1, Math.max(0.2, (best.score - 0.25) / 0.5));
  return {
    tonic: best.tonic,
    mode: best.mode,
    confidence: Math.min(1, best.probability * fitFactor),
    fit: best.score,
    runnerUp: ranked[1] ?? null,
    chroma,
  };
}
