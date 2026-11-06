import React from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useHistory } from '../state/history';
import { useSettings } from '../state/settings';
import { Button, Card, Segmented } from '../ui/components';
import { useTheme } from '../ui/theme';

export function SettingsScreen() {
  const t = useTheme();
  const { settings, update } = useSettings();
  const { entries, clear } = useHistory();

  const sensPreset = settings.sensitivity < 0.35 ? 0.2 : settings.sensitivity > 0.65 ? 0.8 : 0.5;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text style={[styles.title, { color: t.text }]}>Settings</Text>

      <Card>
        <Text style={[styles.h, { color: t.text }]}>Sensitivity</Text>
        <Text style={[styles.p, { color: t.textDim }]}>
          High picks up quiet music but is easier to fool with noise. Low ignores everything but loud, clearly musical sound — better in a noisy car.
        </Text>
        <Segmented
          options={[{ label: 'Low', value: 0.2 }, { label: 'Medium', value: 0.5 }, { label: 'High', value: 0.8 }]}
          value={sensPreset}
          onChange={(v) => update({ sensitivity: v })}
        />
      </Card>

      <Card>
        <Text style={[styles.h, { color: t.text }]}>Live update interval</Text>
        <Text style={[styles.p, { color: t.textDim }]}>How often the key is re-evaluated. Longer = steadier.</Text>
        <Segmented
          options={[{ label: '2 s', value: 2 }, { label: '3 s', value: 3 }, { label: '4 s', value: 4 }]}
          value={settings.updateSec}
          onChange={(v) => update({ updateSec: v as 2 | 3 | 4 })}
        />
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.h, { color: t.text }]}>Detect modes (experimental)</Text>
            <Text style={[styles.p, { color: t.textDim, marginBottom: 0 }]}>
              Also consider Dorian, Phrygian, Lydian and Mixolydian. Modes share their notes with a major key, so expect more mistakes.
            </Text>
          </View>
          <Switch value={settings.includeModes} onValueChange={(v) => update({ includeModes: v })} trackColor={{ true: t.accent }} />
        </View>
      </Card>

      <Card>
        <Text style={[styles.h, { color: t.text }]}>Appearance</Text>
        <Segmented
          options={[{ label: 'System', value: 'system' }, { label: 'Dark', value: 'dark' }, { label: 'Light', value: 'light' }]}
          value={settings.theme}
          onChange={(v) => update({ theme: v })}
        />
      </Card>

      <Card>
        <Text style={[styles.h, { color: t.text }]}>History</Text>
        <Text style={[styles.p, { color: t.textDim }]}>{entries.length} saved detection{entries.length === 1 ? '' : 's'}.</Text>
        <Button
          label="Clear history"
          kind="danger"
          disabled={entries.length === 0}
          onPress={() =>
            Alert.alert('Clear history?', 'This removes all saved detections.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear', style: 'destructive', onPress: clear },
            ])
          }
        />
      </Card>

      <Text style={{ color: t.textDim, fontSize: 12, textAlign: 'center', marginTop: 6 }}>
        Everything runs on your device. Audio is never uploaded.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, fontWeight: '800' },
  h: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  p: { fontSize: 13, marginBottom: 12, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center' },
});
