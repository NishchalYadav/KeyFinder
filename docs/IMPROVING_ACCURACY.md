# Improving accuracy

Do these in order. Step 1 matters most: without real measurements you are tuning blind.

## 1. Measure on real, labelled music

The synthetic tests cannot tell you how the engine does on real recordings. Build a small benchmark:

- Use a labelled key dataset (GiantSteps Key, Beatport/EDM key sets, or MIREX-style Western pop sets), or label 100+ songs from your own library.
- Write a script next to `tests/` that decodes each file, calls `analyzeTrack`, and reports: exact-match rate, plus the usual MIREX buckets (correct, perfect fifth, relative, parallel). Most real errors are fifth and relative-key errors.
- For mic mode, record a few songs from a speaker and a car stereo and run the same files through `KeyTracker`. The gap between file and mic accuracy tells you how much to invest in noise robustness.

Then change one thing at a time and re-run.

## 2. Cheap algorithm wins (no ML)

| Idea | Where | Why |
|---|---|---|
| Harmonic/percussive separation (median filtering the spectrogram) before peak picking | `chroma.ts` | Drums smear energy across pitch classes |
| Weight bass notes more (the lowest strong peak per frame) | `SpectralAnalyzer.analyze` | The bass line states the tonic in most pop/rock |
| Down-weight upper partials: subtract a 3rd/5th-harmonic estimate from each peak | `framesToChroma` | Partial 3 of C is G, partial 5 is E; this biases toward the fifth |
| Use a CQT or a 36-bin chroma (3 bins per semitone) | `chroma.ts` | Better pitch resolution than a linear FFT in the bass |
| Retune profiles on data: fit your own major/minor profiles from a labelled set and add them to `PROFILE_SETS` | `profiles.ts` | Pop profiles differ from lab-rated ones. Ensembling profile sets is free |
| Tune `SOFTMAX_TEMPERATURE`, `MODAL_PENALTY`, gate thresholds on the benchmark | `keyDetector.ts`, `params.ts` | Confidence only means something once calibrated: plot accuracy vs. confidence bucket |
| Longer window / half-life for mic mode when the song is stable | `tracker.ts` | More evidence, slower to react |
| Mic on Android: try the `UNPROCESSED` audio source | `micSession.ts` | Some phones apply AGC/noise suppression that distorts the spectrum |

## 3. Add a learned model (TFLite / ONNX)

The engine already has a hook: `KeyModel` in `src/engine/keyDetector.ts`. It receives the 12-bin chroma and returns probabilities keyed `"<tonic>:<mode>"` (for example `"9:minor"`), which are blended with the K-S probabilities (`modelWeight`, default 0.5).

Options, from smallest change to biggest:

1. **Chroma → key classifier** (a few thousand parameters). Train a small MLP or logistic regression on chroma windows from a labelled set, with random transposition augmentation (rotate the chroma and the label together) so it is transposition-equivariant. Cheap enough to run every update.
2. **Spectrogram CNN** (the approach behind most modern systems, e.g. the models used for GiantSteps). Input a CQT patch of ~8–15 s, output 24 key logits. Needs a CQT in JS or a native module; this is the highest-accuracy path but the largest piece of work.

Integration with `onnxruntime-react-native` (or `react-native-fast-tflite`):

1. Ship the `.onnx` in `assets/` and load it once at startup.
2. Wrap it: `{ predict(chroma) { /* run session; softmax; return {"0:major": p, ...} */ } }`.
3. Pass it in: `new KeyTracker({ ..., model })` in `src/audio/micSession.ts`, and `analyzeTrack(ch, sr, { ..., model })` in `src/audio/playerSession.ts`.
4. Re-run the benchmark with `modelWeight` at 0, 0.3, 0.5, 0.7, 1 and keep what wins.

Both require a dev build (not Expo Go) and, for ONNX/TFLite, adding the native package and re-running `npx expo prebuild`.

## 4. Modes

Modes share their notes with a major key, so chroma alone barely separates them. To do better you need either a learned model with modal labels, or evidence about which note acts as "home" (bass notes and phrase endings), which the current heuristic only approximates.
