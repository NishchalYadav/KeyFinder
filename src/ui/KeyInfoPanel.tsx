import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { commonProgressions, diatonicChords, keyLabel, parallelKey, pretty, relativeKey, scaleNotes, tonicName } from '../engine';
import type { KeyId } from '../engine';
import { Card } from './components';
import { useTheme } from './theme';

/** "Key Info" panel: relative key, scale notes, diatonic chords, common progressions. */
export function KeyInfoPanel({ k }: { k: KeyId }) {
  const t = useTheme();
  const rel = relativeKey(k);
  const par = parallelKey(k);
  const notes = scaleNotes(k);
  const chords = diatonicChords(k);
  const progs = commonProgressions(k);
  const relName = k.mode === 'major' ? 'Relative minor' : k.mode === 'minor' ? 'Relative major' : 'Same notes as';

  return (
    <Card>
      <Text style={[styles.h, { color: t.textDim }]}>KEY INFO · {keyLabel(k).toUpperCase()}</Text>

      <View style={styles.row}>
        <View style={styles.half}>
          <Text style={[styles.k, { color: t.textDim }]}>{relName}</Text>
          <Text style={[styles.v, { color: t.text }]}>{keyLabel(rel)}</Text>
        </View>
        {par && (
          <View style={styles.half}>
            <Text style={[styles.k, { color: t.textDim }]}>Parallel {par.mode}</Text>
            <Text style={[styles.v, { color: t.text }]}>{keyLabel(par)}</Text>
          </View>
        )}
      </View>

      <Text style={[styles.k, { color: t.textDim, marginTop: 14 }]}>Scale notes</Text>
      <View style={styles.chips}>
        {notes.map((n, i) => (
          <View key={i} style={[styles.chip, { backgroundColor: i === 0 ? t.accent : t.surfaceHi }]}>
            <Text style={{ color: i === 0 ? t.accentText : t.text, fontWeight: '700' }}>{pretty(n)}</Text>
          </View>
        ))}
      </View>

      <Text style={[styles.k, { color: t.textDim, marginTop: 14 }]}>Chords in {pretty(tonicName(k))} {k.mode}</Text>
      <View style={[styles.table, { borderColor: t.border }]}>
        {chords.map((c) => (
          <View key={c.degree} style={[styles.tr, { borderColor: t.border }]}>
            <Text style={[styles.td, styles.roman, { color: t.textDim }]}>{c.roman}</Text>
            <Text style={[styles.td, { color: t.text, fontWeight: '700' }]}>{c.name}</Text>
            <Text style={[styles.td, { color: t.textDim }]}>{c.seventh}</Text>
            <Text style={[styles.td, styles.notes, { color: t.textDim }]}>{c.notes.join(' ')}</Text>
          </View>
        ))}
      </View>

      {progs.length > 0 && (
        <>
          <Text style={[styles.k, { color: t.textDim, marginTop: 14 }]}>Common progressions</Text>
          {progs.map((p) => (
            <View key={p.label} style={styles.prog}>
              <Text style={[styles.progLabel, { color: t.textDim }]}>{p.label}</Text>
              <Text style={{ color: t.text, fontWeight: '600', flexShrink: 1 }}>{p.chords.join('  →  ')}</Text>
            </View>
          ))}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 11, letterSpacing: 1.2, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 12 },
  half: { flex: 1 },
  k: { fontSize: 12, marginBottom: 4 },
  v: { fontSize: 18, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, minWidth: 44, alignItems: 'center' },
  table: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  tr: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  td: { flex: 1, fontSize: 14 },
  roman: { flex: 0.6 },
  notes: { flex: 1.4, textAlign: 'right' },
  prog: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  progLabel: { fontSize: 13, width: 96 },
});
