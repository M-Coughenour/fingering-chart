// Microphone tuner: listens through the shared AudioContext and reports the pitch being
// played. Pitch detection uses pitchy (McLeod pitch method).
import { PitchDetector } from 'pitchy';
import { ctx } from './audio.js';
import { hzToMidi } from './notes.js';

const FFT_SIZE = 8192; // long enough window for tuba/bari notes down to ~30 Hz
const MIN_CLARITY = 0.9; // below this it's breath noise or a messy attack
const SMOOTHING = 5; // median of the last few readings keeps the needle steady
const INTERVAL_MS = 50; // 20 readings a second

let session = null;

/**
 * Start listening. `onReading` gets `{ hz, midi, cents }` (concert pitch) each time a clear
 * note is heard, or `null` when it's quiet. Rejects if the microphone isn't available.
 */
export async function startTuner(onReading) {
  stopTuner();
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('The microphone needs a secure (https) page.');
  }
  const audio = ctx();
  const stream = await navigator.mediaDevices.getUserMedia({
    // Voice processing bends pitch and fades sustained notes, so switch it off.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const source = audio.createMediaStreamSource(stream);
  const analyser = audio.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  const detector = PitchDetector.forFloat32Array(buffer.length);
  detector.minVolumeDecibels = -45;
  const recent = [];
  const s = { stream, source, timer: 0 };
  session = s;

  const tick = () => {
    analyser.getFloatTimeDomainData(buffer);
    const [hz, clarity] = detector.findPitch(buffer, audio.sampleRate);
    if (clarity >= MIN_CLARITY && hz > 25 && hz < 4200) {
      recent.push(hz);
      if (recent.length > SMOOTHING) recent.shift();
      const median = [...recent].sort((a, b) => a - b)[recent.length >> 1];
      onReading({ hz: median, ...hzToMidi(median) });
    } else {
      recent.length = 0;
      onReading(null);
    }
  };
  s.timer = setInterval(tick, INTERVAL_MS);
}

/** Stop listening and release the microphone (turns off the browser's recording indicator). */
export function stopTuner() {
  if (!session) return;
  clearInterval(session.timer);
  session.source.disconnect();
  for (const track of session.stream.getTracks()) track.stop();
  session = null;
}
