/**
 * In-App Playback adapter: decode a file -> analyse the WHOLE track offline ->
 * play it while reporting position + the key around the playhead.
 *
 * Why this is more accurate than the microphone: the app sees the exact digital
 * samples (no room, speaker, car noise or AGC) and the entire song at once, so
 * the decision uses minutes of evidence instead of a ~14 s sliding window.
 * Everything here works offline once the file is on the device.
 */
import { AudioContext } from 'react-native-audio-api';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { analyzeTrack, rms } from '../engine';
import type { KeyResult, TrackAnalysis } from '../engine';

export interface PickedAudio {
  uri: string;
  name: string;
}

export async function pickAudioFile(): Promise<PickedAudio | null> {
  const res = await DocumentPicker.getDocumentAsync({
    type: ['audio/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (res.canceled || !res.assets?.length) return null;
  const a = res.assets[0];
  return { uri: a.uri, name: a.name };
}

/** "Stream" = download to the cache, then treat like a local file (so it can be analysed whole). */
export async function downloadAudio(url: string, onProgress?: (p: number) => void): Promise<PickedAudio> {
  const clean = url.trim();
  const name = decodeURIComponent(clean.split('?')[0].split('/').pop() || 'stream');
  const ext = /\.(mp3|wav|m4a|aac|ogg|flac)$/i.exec(name)?.[0] ?? '.mp3';
  const dest = `${FileSystem.cacheDirectory}stream_${Date.now()}${ext}`;
  const dl = FileSystem.createDownloadResumable(clean, dest, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) onProgress?.(p.totalBytesWritten / p.totalBytesExpectedToWrite);
  });
  const out = await dl.downloadAsync();
  if (!out || out.status >= 400) throw new Error(`Download failed (${out?.status ?? 'no response'})`);
  return { uri: out.uri, name };
}

export interface LoadedTrack {
  name: string;
  durationSec: number;
  analysis: TrackAnalysis;
  /** Loudness per 100 ms, for the visualiser. */
  envelope: Float32Array;
  /** Decoded AudioBuffer (library type). */
  buffer: any;
}

export interface LoadOptions {
  sensitivity: number;
  includeModes: boolean;
  onStage: (stage: 'decoding' | 'analyzing', progress?: number) => void;
}

export async function loadTrack(file: PickedAudio, o: LoadOptions): Promise<LoadedTrack> {
  o.onStage('decoding');
  let buffer: any;
  const decoder = new AudioContext();

  try {
    const response = await fetch(file.uri);

    if (!response.ok) {
      throw new Error(`Failed to read audio file: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();

    buffer = await decoder.decodeAudioData(bytes);
  } finally {
    await decoder.close();
  }
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c));
  const sr: number = buffer.sampleRate;

  o.onStage('analyzing', 0);
  const analysis = await analyzeTrack(channels, sr, {
    sensitivity: o.sensitivity,
    includeModes: o.includeModes,
    onProgress: (p) => o.onStage('analyzing', p),
  });

  const hop = Math.floor(sr * 0.1);
  const env = new Float32Array(Math.ceil(channels[0].length / hop));
  for (let i = 0; i < env.length; i++) env[i] = rms(channels[0], i * hop, Math.min(channels[0].length, (i + 1) * hop));

  return { name: file.name, durationSec: buffer.duration, analysis, envelope: env, buffer };
}

export interface PlayerTick {
  position: number;
  level: number;
  playing: boolean;
}

export class TrackPlayer {
  private ctx: any = null;
  private source: any = null;
  private startedAtCtx = 0;
  private offset = 0;
  private playing = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastKeyAt = -Infinity;

  constructor(
    private readonly track: LoadedTrack,
    private readonly updateSec: number,
    private readonly cb: {
      onTick: (t: PlayerTick) => void;
      /** Key around the playhead, every `updateSec` of playback. */
      onLocalKey: (k: KeyResult | null, position: number) => void;
      onEnded: () => void;
    },
  ) { }

  get position(): number {
    if (!this.playing) return this.offset;
    return Math.min(this.track.durationSec, this.offset + (this.ctx.currentTime - this.startedAtCtx));
  }

  play(): void {
    if (this.playing) return;
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.offset >= this.track.durationSec - 0.1) this.offset = 0;
    const src = this.ctx.createBufferSource();
    src.buffer = this.track.buffer;
    src.connect(this.ctx.destination);
    const ended = () => {
      if (this.source === src && this.playing) {
        this.playing = false;
        this.offset = this.track.durationSec;
        this.stopTimer();
        this.emit();
        this.cb.onEnded();
      }
    };
    src.onEnded = ended; // property name differs between library versions
    src.onended = ended;
    this.startedAtCtx = this.ctx.currentTime;
    src.start(0, this.offset);
    this.source = src;
    this.playing = true;
    this.startTimer();
  }

  pause(): void {
    if (!this.playing) return;
    this.offset = this.position;
    this.halt();
    this.emit();
  }

  seek(sec: number): void {
    const was = this.playing;
    if (was) { this.offset = this.position; this.halt(); }
    this.offset = Math.max(0, Math.min(this.track.durationSec - 0.2, sec));
    this.lastKeyAt = -Infinity;
    if (was) this.play(); else this.emit();
  }

  dispose(): void {
    this.halt();
    try { this.ctx?.close(); } catch { /* ignore */ }
    this.ctx = null;
  }

  private halt(): void {
    this.playing = false;
    this.stopTimer();
    const s = this.source;
    this.source = null;
    try { s?.stop(); } catch { /* already stopped */ }
  }

  private startTimer(): void {
    this.stopTimer();
    this.timer = setInterval(() => this.emit(), 200);
  }
  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(): void {
    const pos = this.position;
    const idx = Math.min(this.track.envelope.length - 1, Math.floor(pos * 10));
    this.cb.onTick({ position: pos, level: this.playing ? this.track.envelope[idx] ?? 0 : 0, playing: this.playing });
    if (pos - this.lastKeyAt >= this.updateSec || pos < this.lastKeyAt) {
      this.lastKeyAt = pos;
      this.cb.onLocalKey(this.track.analysis.keyAt(pos, 8), pos);
    }
  }
}
