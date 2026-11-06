/**
 * Microphone adapter: react-native-audio-api  ->  KeyTracker.
 *
 * This is the ONLY file that touches the native recorder, so if the library's
 * API changes (it is young and has changed between 0.8 and 0.9) or you want to
 * swap in another PCM-streaming library, this is the single place to edit. The
 * contract with the rest of the app is just: "give me mono Float32 chunks".
 *
 * Tips for the car-stereo / speaker use case:
 *  - iOS: we request the 'measurement' audio mode, which turns off the
 *    phone's automatic gain control / voice processing. Those distort the
 *    spectrum and hurt detection.
 *  - Android: the default MIC source is fine on most phones; some OEMs apply
 *    AGC anyway. If results are poor, test with the UNPROCESSED source
 *    (see README -> "Improving accuracy").
 */
import { PermissionsAndroid, Platform } from 'react-native';
import { AudioManager, AudioRecorder } from 'react-native-audio-api';
import { KeyTracker, rms } from '../engine';
import type { TrackerUpdate } from '../engine';

export interface MicOptions {
  sensitivity: number;
  updateSec: 2 | 3 | 4;
  includeModes: boolean;
}

export interface MicCallbacks {
  onUpdate: (u: TrackerUpdate) => void;
  /** RMS (0..1) of every incoming chunk (~10 Hz) - drives the visualiser. */
  onLevel: (level: number) => void;
  onError: (message: string) => void;
}

export interface MicSession {
  stop(): void;
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS === 'android') {
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
      title: 'Microphone access',
      message: 'KeyFinder needs the microphone to listen to the music and detect its key.',
      buttonPositive: 'Allow',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED;
  }
  const res: unknown = await AudioManager.requestRecordingPermissions();
  return res === 'Granted' || res === true;
}

export async function startMic(opts: MicOptions, cb: MicCallbacks): Promise<MicSession | null> {
  try {
    if (!(await ensureMicPermission())) {
      cb.onError('Microphone permission was denied. Enable it in system settings to use Listen with Mic.');
      return null;
    }
    try {
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'measurement',
        iosOptions: ['defaultToSpeaker', 'allowBluetooth'],
      } as never);
    } catch { /* option names differ between library versions; not fatal */ }

    const TARGET_RATE = 22050;
    const CHUNK = 2048;
    // The recorder's constructor / onAudioReady signature differs between
    // library versions; try the newer form first, fall back to the older.
    const recorder: any = new (AudioRecorder as any)({ sampleRate: TARGET_RATE, bufferLengthInSamples: CHUNK });

    let tracker: KeyTracker | null = null;
    const handler = (event: any) => {
      const buf = event.buffer;
      const data: Float32Array = buf.getChannelData(0);
      const rate: number = buf.sampleRate ?? event.sampleRate ?? TARGET_RATE;
      if (!tracker) {
        tracker = new KeyTracker({
          inputSampleRate: rate,
          sensitivity: opts.sensitivity,
          updateSec: opts.updateSec,
          includeModes: opts.includeModes,
        });
      }
      cb.onLevel(rms(data));
      for (const u of tracker.push(data)) cb.onUpdate(u);
    };

    try {
      recorder.onAudioReady({ sampleRate: TARGET_RATE, bufferLength: CHUNK, channelCount: 1 }, handler);
    } catch {
      recorder.onAudioReady(handler);
    }
    recorder.start();

    return {
      stop() {
        try { recorder.stop(); } catch { /* already stopped */ }
      },
    };
  } catch (e) {
    cb.onError(`Could not start the microphone: ${(e as Error).message}`);
    return null;
  }
}
