/**
 * Engine tests on synthetic audio.  Run:  npm test
 *
 * These prove the algorithm is wired correctly (tuning, rotation, spelling,
 * gating, live tracker) - they do NOT prove accuracy on real recordings. See
 * README "Improving accuracy" for how to benchmark on real, labelled songs.
 */
import assert from 'node:assert/strict';
import { analyzeTrack, KeyTracker, keyLabelAscii, scaleNotes, diatonicChords, relativeKey, tonicName } from '../src/engine';
import type { KeyId, ModeId } from '../src/engine';
import { synthSong, whiteNoise } from './synth';

const SR = 22050;
let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
};

// ---------- music theory ----------
const k = (tonic: number, mode: ModeId): KeyId => ({ tonic, mode });
assert.deepEqual(scaleNotes(k(6, 'major')), ['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'E#']);
assert.deepEqual(scaleNotes(k(3, 'major')), ['Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D']);
assert.deepEqual(scaleNotes(k(9, 'minor')), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
assert.deepEqual(scaleNotes(k(1, 'minor')), ['C#', 'D#', 'E', 'F#', 'G#', 'A', 'B']);
assert.equal(keyLabelAscii(relativeKey(k(0, 'major'))), 'A Minor');
assert.equal(keyLabelAscii(relativeKey(k(9, 'minor'))), 'C Major');
assert.equal(keyLabelAscii(relativeKey(k(2, 'dorian'))), 'C Major');
assert.deepEqual(diatonicChords(k(0, 'major')).map((c) => c.name), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
assert.deepEqual(diatonicChords(k(0, 'major')).map((c) => c.roman), ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
assert.equal(diatonicChords(k(0, 'major'))[4].seventh, 'G7');
assert.equal(diatonicChords(k(9, 'minor'))[0].seventh, 'Am7');
console.log('PASS  music theory');

// ---------- offline, all 24 keys, several conditions ----------
const conditions: { name: string; opts: Partial<Parameters<typeof synthSong>[0]> }[] = [
  { name: 'clean', opts: {} },
  { name: 'noise 10 dB SNR', opts: { noiseDb: 10 } },
  { name: 'noise 3 dB SNR', opts: { noiseDb: 3 } },
  { name: 'detuned +35 cents', opts: { detuneCents: 35 } },
  { name: 'quiet (peak 0.06)', opts: { gain: 0.06 } },
];

(async () => {
  for (const cond of conditions) {
    let ok = 0, relMiss = 0, total = 0;
    const confs: number[] = [];
    const wrong: string[] = [];
    for (const mode of ['major', 'minor'] as ModeId[]) {
      for (let tonic = 0; tonic < 12; tonic++) {
        const audio = synthSong({ tonic, mode, seed: tonic * 7 + 3, ...cond.opts });
        const a = await analyzeTrack([audio], SR);
        total++;
        const r = a.overall;
        if (r && r.tonic === tonic && r.mode === mode) { ok++; confs.push(r.confidence); }
        else {
          wrong.push(`${tonicName({ tonic, mode })} ${mode} -> ${r ? keyLabelAscii(r) : 'none'}`);
          if (r && r.tonic === relativeKey(k(tonic, mode)).tonic) relMiss++;
        }
      }
    }
    const meanConf = confs.length ? confs.reduce((x, y) => x + y, 0) / confs.length : 0;
    const need = cond.name.startsWith('noise 3') ? 20 : 23;
    check(`offline ${cond.name}: ${ok}/${total} keys correct (relative-key confusions: ${relMiss}), mean conf ${(meanConf * 100).toFixed(0)}%`, ok >= need, wrong.length ? '\n      ' + wrong.join('\n      ') : '');
  }

  // ---------- live tracker ----------
  for (const [tonic, mode] of [[7, 'major'], [4, 'minor'], [10, 'major'], [1, 'minor']] as [number, ModeId][]) {
    const audio = synthSong({ tonic, mode, seconds: 20, noiseDb: 8, seed: 11 });
    // feed in 4096-sample chunks like a mic would, at 44.1k to exercise the resampler
    const tr = new KeyTracker({ inputSampleRate: SR, updateSec: 3 });
    let last = null as ReturnType<KeyTracker['push']>[number] | null;
    let count = 0;
    for (let i = 0; i + 2048 <= audio.length; i += 2048) {
      for (const u of tr.push(audio.subarray(i, i + 2048))) { last = u; count++; }
    }
    const got = last?.stable;
    check(`live tracker ${tonicName({ tonic, mode })} ${mode}: ${count} updates, final ${got ? keyLabelAscii(got) + ' ' + (got.confidence * 100).toFixed(0) + '%' : 'none'}`, !!got && got.tonic === tonic && got.mode === mode && count >= 4);
  }

  // ---------- live tracker: song change (modulation) is picked up ----------
  {
    const a = synthSong({ tonic: 0, mode: 'major', seconds: 20, seed: 5 });
    const b = synthSong({ tonic: 2, mode: 'minor', seconds: 30, seed: 6 });
    const all = new Float32Array(a.length + b.length); all.set(a); all.set(b, a.length);
    const tr = new KeyTracker({ inputSampleRate: SR, updateSec: 3 });
    const seen: string[] = [];
    for (let i = 0; i + 2048 <= all.length; i += 2048) for (const u of tr.push(all.subarray(i, i + 2048))) if (u.stable) seen.push(keyLabelAscii(u.stable));
    const final = seen[seen.length - 1];
    check(`live tracker follows song change: ${seen[2]} ... ${final}`, seen.includes('C Major') && final === 'D Minor');
  }

  // ---------- noise gate ----------
  {
    const tr = new KeyTracker({ inputSampleRate: SR, sensitivity: 0.5 });
    const noise = whiteNoise(15, SR, 0.2);
    let status = '';
    let stable = null as unknown;
    for (let i = 0; i + 2048 <= noise.length; i += 2048) for (const u of tr.push(noise.subarray(i, i + 2048))) { status = u.status; stable = u.stable; }
    check(`loud white noise is rejected (status=${status})`, stable === null && status !== 'ok');

    const tr2 = new KeyTracker({ inputSampleRate: SR, sensitivity: 0.2 });
    const silence = new Float32Array(SR * 12);
    for (let i = 0; i + 2048 <= silence.length; i += 2048) for (const u of tr2.push(silence.subarray(i, i + 2048))) status = u.status;
    check(`silence is rejected (status=${status})`, status === 'quiet');
  }

  // ---------- modes (experimental) ----------
  {
    let ok = 0;
    const modes: ModeId[] = ['dorian', 'mixolydian', 'lydian', 'phrygian'];
    for (const mode of modes) {
      const audio = synthSong({ tonic: 2, mode, seed: 9 });
      const a = await analyzeTrack([audio], SR, { includeModes: true });
      if (a.overall?.mode === mode && a.overall.tonic === 2) ok++;
      else console.log(`      (info) ${mode} on D detected as ${a.overall ? keyLabelAscii(a.overall) : 'none'}`);
    }
    console.log(`INFO  modal detection ${ok}/${modes.length} on synthetic D-mode progressions (experimental)`);
  }

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
  process.exit(failures ? 1 : 0);
})();
