import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import type { KeyResult, TrackerStatus } from '../engine';
import { keyLabel, keyLabelAscii } from '../engine';
import { startMic, type MicSession } from '../audio/micSession';
import { TrackPlayer, downloadAudio, loadTrack, pickAudioFile, type LoadedTrack, type PickedAudio } from '../audio/playerSession';
import { useHistory } from '../state/history';
import { useSettings } from '../state/settings';
import { Button, Card, ConfidenceBar, Visualizer, fmtTime } from '../ui/components';
import { KeyInfoPanel } from '../ui/KeyInfoPanel';
import { ShareCardModal } from '../ui/ShareCardModal';
import { useTheme } from '../ui/theme';

type Mode = 'idle' | 'mic' | 'loading' | 'player';
const BARS = 44;

const STATUS_TEXT: Record<TrackerStatus, string> = {
  warming: 'Collecting audio…',
  quiet: 'Too quiet — turn the music up or move closer',
  noisy: 'Mostly noise — waiting for clear musical tones',
  ok: '',
};

export function HomeScreen() {
  const t = useTheme();
  const { settings } = useSettings();
  const history = useHistory();

  const [mode, setMode] = useState<Mode>('idle');
  const [shown, setShown] = useState<KeyResult | null>(null); // key in the big display
  const [status, setStatus] = useState<TrackerStatus | null>(null);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0));
  const [error, setError] = useState<string | null>(null);

  // in-app playback
  const [stage, setStage] = useState<string>('');
  const [track, setTrack] = useState<LoadedTrack | null>(null);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [localKey, setLocalKey] = useState<{ k: KeyResult; at: number } | null>(null);
  const [barW, setBarW] = useState(1);

  const [urlOpen, setUrlOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [cardOpen, setCardOpen] = useState(false);

  const micRef = useRef<MicSession | null>(null);
  const playerRef = useRef<TrackPlayer | null>(null);
  const shownRef = useRef<KeyResult | null>(null);
  shownRef.current = shown;

  const pushLevel = useCallback((lv: number) => setLevels((p) => [...p.slice(1), lv]), []);

  // ---------- Microphone mode ----------
  const stopMic = useCallback((save: boolean) => {
    micRef.current?.stop();
    micRef.current = null;
    const k = shownRef.current;
    if (save && k) {
      history.add({ tonic: k.tonic, mode: k.mode, confidence: k.confidence, title: 'Microphone detection', source: 'mic' });
    }
    setLevels(Array(BARS).fill(0));
    setMode('idle');
  }, [history]);

  const startListening = useCallback(async () => {
    setError(null);
    disposePlayer();
    setTrack(null);
    setShown(null);
    setStatus('warming');
    setMode('mic');
    const session = await startMic(
      { sensitivity: settings.sensitivity, updateSec: settings.updateSec, includeModes: settings.includeModes },
      {
        onLevel: pushLevel,
        onUpdate: (u) => {
          setStatus(u.status);
          if (u.stable) setShown(u.stable);
        },
        onError: (m) => setError(m),
      },
    );
    if (!session) { setMode('idle'); setStatus(null); return; }
    micRef.current = session;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sensitivity, settings.updateSec, settings.includeModes, pushLevel]);

  // ---------- In-app mode ----------
  function disposePlayer() {
    playerRef.current?.dispose();
    playerRef.current = null;
    setPlaying(false);
    setPos(0);
    setLocalKey(null);
  }

  const openFile = useCallback(async (file: PickedAudio) => {
    micRef.current && stopMic(false);
    disposePlayer();
    setError(null);
    setShown(null);
    setTrack(null);
    setMode('loading');
    try {
      const loaded = await loadTrack(file, {
        sensitivity: settings.sensitivity,
        includeModes: settings.includeModes,
        onStage: (s, p) => setStage(s === 'decoding' ? 'Decoding audio…' : `Analysing… ${Math.round((p ?? 0) * 100)}%`),
      });
      const overall = loaded.analysis.overall;
      setTrack(loaded);
      setShown(overall);
      if (!overall) setError('No clear musical key found in this file (silent or non-tonal audio?).');
      else history.add({ tonic: overall.tonic, mode: overall.mode, confidence: overall.confidence, title: file.name.replace(/\.[^.]+$/, ''), source: 'file' });

      const player = new TrackPlayer(loaded, settings.updateSec, {
        onTick: (tk) => { setPos(tk.position); setPlaying(tk.playing); pushLevel(tk.level); },
        onLocalKey: (k, at) => setLocalKey(k ? { k, at } : null),
        onEnded: () => { setPlaying(false); setLevels(Array(BARS).fill(0)); },
      });
      playerRef.current = player;
      setMode('player');
      player.play();
    } catch (e) {
      setError(`Could not open this file: ${(e as Error).message}`);
      setMode('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.sensitivity, settings.includeModes, settings.updateSec, history, pushLevel]);

  const chooseSource = () => {
    Alert.alert('Play In-App', 'Analyse a song directly from its audio data for the best accuracy.', [
      { text: 'Choose audio file', onPress: async () => { const f = await pickAudioFile(); if (f) openFile(f); } },
      { text: 'Stream from URL', onPress: () => setUrlOpen(true) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const submitUrl = async () => {
    setUrlOpen(false);
    if (!/^https?:\/\//i.test(url.trim())) { setError('Enter a direct http(s) link to an audio file.'); return; }
    setMode('loading');
    setStage('Downloading…');
    try {
      const f = await downloadAudio(url, (p) => setStage(`Downloading… ${Math.round(p * 100)}%`));
      await openFile(f);
    } catch (e) {
      setError((e as Error).message);
      setMode('idle');
    }
  };

  useEffect(() => () => { micRef.current?.stop(); playerRef.current?.dispose(); }, []);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    playing ? p.pause() : p.play();
  };

  // ---------- Render ----------
  const live = mode === 'mic';
  const k = shown;
  const label = k ? keyLabel(k) : '—';
  const headline =
    mode === 'mic' ? (status === 'ok' || shown ? `LISTENING · UPDATES EVERY ${settings.updateSec}s` : 'LISTENING')
    : mode === 'player' ? 'TRACK KEY'
    : mode === 'loading' ? 'WORKING' : 'READY';

  const quickShare = () => {
    if (!k) return;
    Share.share({ message: `This song is in ${keyLabelAscii(k)} (${Math.round(k.confidence * 100)}% confident) — detected with KeyFinder` });
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll} style={{ backgroundColor: t.bg }}>
      <Text style={[styles.title, { color: t.text }]}>KeyFinder</Text>

      <Card style={{ marginTop: 12 }}>
        <View style={styles.headRow}>
          <Text style={[styles.headline, { color: t.textDim }]}>{headline}</Text>
          {live && <View style={[styles.dot, { backgroundColor: t.danger }]} />}
        </View>

        {mode === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator color={t.accent} size="large" />
            <Text style={{ color: t.textDim, marginTop: 12 }}>{stage}</Text>
          </View>
        ) : (
          <>
            <Text
              style={[styles.key, { color: k ? t.text : t.textDim }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              accessibilityLiveRegion="polite"
              accessibilityLabel={k ? `Detected key ${keyLabelAscii(k)}` : 'No key detected yet'}
            >
              {label}
            </Text>

            <Text style={[styles.sub, { color: t.textDim }]} numberOfLines={2}>
              {error
                ?? (k && k.confidence < 0.6 && k.runnerUp
                  ? `or ${keyLabel(k.runnerUp)}`
                  : mode === 'mic' && status && status !== 'ok' ? STATUS_TEXT[status]
                  : mode === 'player' && track ? track.name
                  : mode === 'idle' ? 'Listen to music or open a song' : ' ')}
            </Text>

            <View style={{ marginTop: 14, opacity: k ? 1 : 0.35 }}>
              <ConfidenceBar value={k?.confidence ?? 0} />
            </View>
          </>
        )}

        <View style={{ marginTop: 18 }}>
          <Visualizer levels={levels} active={live || playing} />
        </View>

        {mode === 'player' && track && (
          <View style={{ marginTop: 10 }}>
            <Pressable
              onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
              onPress={(e) => playerRef.current?.seek((e.nativeEvent.locationX / barW) * track.durationSec)}
              style={[styles.seek, { backgroundColor: t.surfaceHi }]}
              accessibilityLabel="Seek"
            >
              <View style={[styles.seekFill, { backgroundColor: t.accent, width: `${(pos / track.durationSec) * 100}%` }]} />
            </Pressable>
            <View style={styles.timeRow}>
              <Text style={[styles.time, { color: t.textDim }]}>{fmtTime(pos)}</Text>
              <Text style={[styles.time, { color: t.textDim }]}>{fmtTime(track.durationSec)}</Text>
            </View>
            <View style={styles.playRow}>
              <Button label={playing ? 'Pause' : 'Play'} icon={playing ? '❚❚' : '▶'} kind="secondary" onPress={togglePlay} style={{ flex: 1 }} />
            </View>
            {localKey && (
              <Text style={[styles.local, { color: t.textDim }]}>
                Around {fmtTime(localKey.at)}: <Text style={{ color: t.text, fontWeight: '700' }}>{keyLabel(localKey.k)}</Text>
                {' '}({Math.round(localKey.k.confidence * 100)}%)
                {k && (localKey.k.tonic !== k.tonic || localKey.k.mode !== k.mode) ? '  · section differs from track key' : ''}
              </Text>
            )}
          </View>
        )}
      </Card>

      <View style={styles.btnRow}>
        <Button
          label={live ? 'Stop' : 'Listen with Mic'}
          icon={live ? '■' : '🎙'}
          kind={live ? 'danger' : 'primary'}
          onPress={() => (live ? stopMic(true) : startListening())}
          disabled={mode === 'loading'}
          style={{ flex: 1 }}
        />
        <Button label="Play In-App" icon="♪" kind="secondary" onPress={chooseSource} disabled={mode === 'loading'} style={{ flex: 1 }} />
      </View>

      {k && mode !== 'loading' && (
        <>
          <View style={styles.btnRow}>
            <Button label="Share card" icon="▣" kind="ghost" onPress={() => setCardOpen(true)} style={{ flex: 1 }} />
            <Button label="What key is this?" icon="↗" kind="ghost" onPress={quickShare} style={{ flex: 1 }} />
          </View>
          <View style={{ marginTop: 14 }}>
            <KeyInfoPanel k={k} />
          </View>
        </>
      )}

      {k && (
        <ShareCardModal
          visible={cardOpen}
          onClose={() => setCardOpen(false)}
          k={k}
          confidence={k.confidence}
          title={mode === 'player' ? track?.name : undefined}
        />
      )}

      <Modal visible={urlOpen} transparent animationType="fade" onRequestClose={() => setUrlOpen(false)}>
        <View style={styles.modalBack}>
          <View style={[styles.modal, { backgroundColor: t.surface, borderColor: t.border }]}>
            <Text style={[styles.modalTitle, { color: t.text }]}>Stream from URL</Text>
            <Text style={{ color: t.textDim, marginBottom: 10 }}>
              Direct link to an MP3, M4A, WAV, OGG or FLAC. It is downloaded first, then analysed in full.
            </Text>
            <TextInput
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/song.mp3"
              placeholderTextColor={t.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surfaceHi }]}
            />
            <View style={styles.btnRow}>
              <Button label="Cancel" kind="ghost" onPress={() => setUrlOpen(false)} style={{ flex: 1 }} />
              <Button label="Analyse" onPress={submitUrl} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: 0.3 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headline: { fontSize: 11, letterSpacing: 1.4, fontWeight: '700' },
  dot: { width: 9, height: 9, borderRadius: 5 },
  key: { fontSize: 76, fontWeight: '800', textAlign: 'center', marginTop: 14, letterSpacing: -1 },
  sub: { textAlign: 'center', fontSize: 14, minHeight: 20, marginTop: 2 },
  loading: { alignItems: 'center', paddingVertical: 44 },
  btnRow: { flexDirection: 'row', gap: 12, marginTop: 14 },
  seek: { height: 10, borderRadius: 5, overflow: 'hidden' },
  seekFill: { height: 10 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  time: { fontSize: 12, fontVariant: ['tabular-nums'] },
  playRow: { flexDirection: 'row', marginTop: 8 },
  local: { marginTop: 10, fontSize: 13, textAlign: 'center' },
  modalBack: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 },
  modal: { borderRadius: 20, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
});
