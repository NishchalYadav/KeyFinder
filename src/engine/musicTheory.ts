/**
 * Music-theory helpers for the Key Info panel: note spelling, scale notes,
 * relative/parallel keys, diatonic chords and Roman numerals.
 *
 * Spelling uses the "one letter per scale degree" rule (F# major is
 * F# G# A# B C# D# E#, not ... F), which is what a musician expects to read.
 */
import type { KeyId, ModeId } from './types';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

/** Conventional tonic spellings (so we show Eb major, not D# major; C# minor, not Db minor). */
const MAJOR_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export const MODE_INTERVALS: Record<ModeId, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};

export const MODE_LABEL: Record<ModeId, string> = {
  major: 'Major',
  minor: 'Minor',
  dorian: 'Dorian',
  phrygian: 'Phrygian',
  lydian: 'Lydian',
  mixolydian: 'Mixolydian',
};

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const isMinorish = (m: ModeId) => m === 'minor' || m === 'dorian' || m === 'phrygian';

/** ASCII name of the tonic, e.g. "Eb", "F#". */
export function tonicName(k: KeyId): string {
  return (isMinorish(k.mode) ? MINOR_TONICS : MAJOR_TONICS)[mod12(k.tonic)];
}

/** Pretty-print: "Eb" -> "E♭", "F#" -> "F♯". */
export function pretty(note: string): string {
  return note[0] + note.slice(1).replace(/##/g, '𝄪').replace(/#/g, '♯').replace(/bb/g, '𝄫').replace(/b/g, '♭');
}

export function keyLabel(k: KeyId): string {
  return `${pretty(tonicName(k))} ${MODE_LABEL[k.mode]}`;
}

/** Plain-text label for sharing/storing, e.g. "F# Major". */
export function keyLabelAscii(k: KeyId): string {
  return `${tonicName(k)} ${MODE_LABEL[k.mode]}`;
}

/** Spell `intervals` above `tonicNm` using one letter name per degree. */
function spell(tonicNm: string, tonicPc: number, intervals: number[]): string[] {
  const start = LETTERS.indexOf(tonicNm[0]);
  return intervals.map((iv, d) => {
    const letter = (start + d) % 7;
    const target = mod12(tonicPc + iv);
    const acc = mod12(target - LETTER_PC[letter] + 6) - 6; // -6..5 semitones of accidental
    const sym = acc === 0 ? '' : acc > 0 ? '#'.repeat(acc) : 'b'.repeat(-acc);
    return LETTERS[letter] + sym;
  });
}

export function scaleNotes(k: KeyId): string[] {
  return spell(tonicName(k), k.tonic, MODE_INTERVALS[k.mode]);
}

export function relativeKey(k: KeyId): KeyId {
  if (k.mode === 'minor') return { tonic: mod12(k.tonic + 3), mode: 'major' };
  if (k.mode === 'major') return { tonic: mod12(k.tonic + 9), mode: 'minor' };
  // For a mode, the "relative" is the major key that shares its notes.
  const off = { dorian: 2, phrygian: 4, lydian: 5, mixolydian: 7 }[k.mode];
  return { tonic: mod12(k.tonic - off), mode: 'major' };
}

export function parallelKey(k: KeyId): KeyId | null {
  if (k.mode === 'major') return { tonic: k.tonic, mode: 'minor' };
  if (k.mode === 'minor') return { tonic: k.tonic, mode: 'major' };
  return null;
}

export interface Chord {
  degree: number; // 0..6
  roman: string; // "I", "ii", "vii°"
  name: string; // "C", "Dm", "Bdim"
  seventh: string; // "Cmaj7", "Dm7", "G7", "Bm7♭5"
  notes: string[];
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Diatonic triads and sevenths built by stacking thirds on each scale degree. */
export function diatonicChords(k: KeyId): Chord[] {
  const iv = MODE_INTERVALS[k.mode];
  const notes = scaleNotes(k);
  return iv.map((_, d) => {
    const at = (n: number) => iv[(d + n) % 7] + (d + n >= 7 ? 12 : 0);
    const third = at(2) - at(0);
    const fifth = at(4) - at(0);
    const sev = at(6) - at(0);
    let q: 'maj' | 'min' | 'dim' | 'aug' = 'maj';
    if (third === 3 && fifth === 6) q = 'dim';
    else if (third === 3) q = 'min';
    else if (fifth === 8) q = 'aug';

    const root = pretty(notes[d]);
    const suffix = { maj: '', min: 'm', dim: 'dim', aug: 'aug' }[q];
    let roman = NUMERALS[d];
    if (q === 'min' || q === 'dim') roman = roman.toLowerCase();
    if (q === 'dim') roman += '°';
    if (q === 'aug') roman += '+';

    let seventh: string;
    if (q === 'maj') seventh = sev === 11 ? 'maj7' : '7';
    else if (q === 'min') seventh = sev === 10 ? 'm7' : 'm(maj7)';
    else if (q === 'dim') seventh = sev === 9 ? 'dim7' : 'm7♭5';
    else seventh = sev === 11 ? 'aug(maj7)' : 'aug7';

    return {
      degree: d,
      roman,
      name: root + suffix,
      seventh: root + seventh,
      notes: [notes[d], notes[(d + 2) % 7], notes[(d + 4) % 7]].map(pretty),
    };
  });
}

/** Familiar progressions rendered in the detected key (major / minor only). */
export function commonProgressions(k: KeyId): { label: string; chords: string[] }[] {
  if (k.mode !== 'major' && k.mode !== 'minor') return [];
  const c = diatonicChords(k);
  const pick = (label: string, degs: number[]) => ({
    label,
    chords: degs.map((d) => c[d].name),
  });
  return k.mode === 'major'
    ? [pick('I–V–vi–IV', [0, 4, 5, 3]), pick('ii–V–I', [1, 4, 0]), pick('I–vi–IV–V', [0, 5, 3, 4])]
    : [pick('i–VI–III–VII', [0, 5, 2, 6]), pick('i–iv–v', [0, 3, 4]), pick('i–VII–VI–VII', [0, 6, 5, 6])];
}
