import React, { useState } from 'react';
import { Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { keyLabel } from '../engine';
import { useHistory, type HistoryEntry } from '../state/history';
import { Button } from '../ui/components';
import { KeyInfoPanel } from '../ui/KeyInfoPanel';
import { useTheme } from '../ui/theme';

const when = (ts: number) =>
  new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function HistoryScreen() {
  const t = useTheme();
  const { entries, remove, rename, clear } = useHistory();
  const [open, setOpen] = useState<HistoryEntry | null>(null);
  const [name, setName] = useState('');

  const confirmClear = () =>
    Alert.alert('Clear history?', 'This removes all saved detections.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: clear },
    ]);

  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: t.text }]}>History</Text>
        {entries.length > 0 && <Button label="Clear" kind="ghost" onPress={confirmClear} style={styles.clearBtn} />}
      </View>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 10 }}
        ListEmptyComponent={
          <Text style={{ color: t.textDim, textAlign: 'center', marginTop: 60 }}>
            No detections yet. Stop a mic session or analyse a song and it will be saved here.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => { setOpen(item); setName(item.title); }}
            style={[styles.row, { backgroundColor: t.surface, borderColor: t.border }]}
            accessibilityRole="button"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.key, { color: t.text }]}>{keyLabel(item)}</Text>
              <Text style={{ color: t.textDim, marginTop: 2 }} numberOfLines={1}>{item.title}</Text>
              <Text style={{ color: t.textDim, fontSize: 12, marginTop: 2 }}>
                {item.source === 'mic' ? '🎙' : '♪'} {when(item.timestamp)}
              </Text>
            </View>
            <Text style={[styles.pct, { color: item.confidence >= 0.7 ? t.good : item.confidence >= 0.4 ? t.warn : t.danger }]}>
              {Math.round(item.confidence * 100)}%
            </Text>
          </Pressable>
        )}
      />

      <Modal visible={!!open} animationType="slide" onRequestClose={() => setOpen(null)}>
        {open && (
          <View style={{ flex: 1, backgroundColor: t.bg }}>
            <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 48, gap: 14 }}>
              <Text style={[styles.title, { color: t.text }]}>{keyLabel(open)}</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                onEndEditing={() => name.trim() && rename(open.id, name.trim())}
                placeholder="Song name"
                placeholderTextColor={t.textDim}
                style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              />
              <Text style={{ color: t.textDim }}>{when(open.timestamp)} · {Math.round(open.confidence * 100)}% confidence</Text>
              <KeyInfoPanel k={open} />
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Button label="Delete" kind="danger" onPress={() => { remove(open.id); setOpen(null); }} style={{ flex: 1 }} />
                <Button
                  label="Done"
                  onPress={() => { if (name.trim() && name.trim() !== open.title) rename(open.id, name.trim()); setOpen(null); }}
                  style={{ flex: 1 }}
                />
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800' },
  clearBtn: { paddingVertical: 8, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, borderWidth: 1, padding: 14 },
  key: { fontSize: 20, fontWeight: '800' },
  pct: { fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
});
