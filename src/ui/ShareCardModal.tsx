import React, { useRef, useState } from 'react';
import { Alert, Modal, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { keyLabel, relativeKey, scaleNotes, pretty } from '../engine';
import type { KeyId } from '../engine';
import { Button } from './components';
import { DARK } from './theme';

/**
 * Shows a preview of the share card; "Share image" snapshots exactly what is
 * visible (react-native-view-shot) and hands the PNG to the system share sheet.
 * The card always uses the dark palette so it looks the same on every device.
 */
export function ShareCardModal({
  visible,
  onClose,
  k,
  confidence,
  title,
}: {
  visible: boolean;
  onClose: () => void;
  k: KeyId;
  confidence: number;
  title?: string;
}) {
  const ref = useRef<View>(null);
  const [busy, setBusy] = useState(false);
  const rel = relativeKey(k);

  const share = async () => {
    try {
      setBusy(true);
      const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Sharing is not available on this device');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share key' });
    } catch (e) {
      Alert.alert('Could not create the image', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View ref={ref} collapsable={false} style={styles.card}>
          <Text style={styles.brand}>KEYFINDER</Text>
          {title ? <Text style={styles.song} numberOfLines={2}>{title}</Text> : null}
          <Text style={styles.key} adjustsFontSizeToFit numberOfLines={1}>{keyLabel(k)}</Text>
          <Text style={styles.meta}>{Math.round(confidence * 100)}% confidence</Text>
          <View style={styles.rule} />
          <Text style={styles.meta}>Relative: {keyLabel(rel)}</Text>
          <Text style={styles.notes}>{scaleNotes(k).map(pretty).join('  ')}</Text>
        </View>
        <View style={styles.actions}>
          <Button label={busy ? 'Preparing…' : 'Share image'} icon="↗" onPress={share} disabled={busy} />
          <Button label="Close" kind="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 },
  card: { width: 320, height: 320, borderRadius: 28, padding: 26, backgroundColor: DARK.bg, borderWidth: 1, borderColor: DARK.border, justifyContent: 'center' },
  brand: { color: DARK.accent, fontWeight: '800', letterSpacing: 3, fontSize: 12, marginBottom: 10 },
  song: { color: DARK.textDim, fontSize: 14, marginBottom: 6 },
  key: { color: DARK.text, fontSize: 56, fontWeight: '800' },
  meta: { color: DARK.good, fontSize: 14, fontWeight: '600', marginTop: 4 },
  rule: { height: 1, backgroundColor: DARK.border, marginVertical: 14 },
  notes: { color: DARK.textDim, fontSize: 15, marginTop: 6, letterSpacing: 1 },
  actions: { width: 320, gap: 10 },
});
