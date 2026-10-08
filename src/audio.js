// Sampled instrument playback (General MIDI soundfonts via smplr).
// Browsers — iOS Safari especially — only allow audio after a user gesture, so the
// AudioContext is created lazily on the first play.
import { Soundfont } from 'smplr';

let context;
const instruments = new Map();

// Which soundfont kit to use per sample. Loop points (needed for a note to sustain while
// Play is on) only exist for some instruments in each kit, so pick the kit that has them.
// MusyngKite sounds a little better, so it wins when both have loops.
const KIT = {
  flute: 'MusyngKite', oboe: 'MusyngKite', bassoon: 'MusyngKite', trumpet: 'MusyngKite',
  tenor_sax: 'MusyngKite', baritone_sax: 'MusyngKite',
  clarinet: 'FluidR3_GM', alto_sax: 'FluidR3_GM', trombone: 'FluidR3_GM', tuba: 'FluidR3_GM',
};
// No loop data in either kit: sustained notes are re-struck before the sample runs out.
const NO_LOOPS = new Set(['french_horn']);
const RESTRIKE_SECONDS = 2.5;

function ctx() {
  context ??= new AudioContext();
  if (context.state !== 'running') context.resume();
  return context;
}

/** Load (or reuse) a soundfont instrument. Resolves when samples are ready. */
export function loadSample(name, onProgress) {
  if (!instruments.has(name)) {
    const inst = Soundfont(ctx(), {
      instrument: name,
      kit: KIT[name] ?? 'MusyngKite',
      loadLoopData: !NO_LOOPS.has(name),
      onLoadProgress: onProgress,
    });
    const ready = inst.ready.then(() => inst);
    // Forget failed loads (e.g. offline) so the next play retries.
    ready.catch(() => instruments.delete(name));
    instruments.set(name, ready);
  }
  return instruments.get(name);
}

/**
 * Start a note at concert pitch. Returns a function that stops it.
 * Pass `duration` (seconds) for a one-shot note; without it the note sustains until stopped.
 */
export async function playNote(sample, midi, { duration, velocity = 90 } = {}) {
  const inst = await loadSample(sample);
  if (duration !== undefined || !NO_LOOPS.has(sample)) {
    return inst.start({ note: midi, velocity, duration });
  }
  // No loop points: overlap a fresh note just before the previous one fades.
  let stopCurrent = inst.start({ note: midi, velocity });
  const timer = setInterval(() => {
    const previous = stopCurrent;
    stopCurrent = inst.start({ note: midi, velocity: velocity - 10 });
    setTimeout(() => previous(), 250);
  }, RESTRIKE_SECONDS * 1000);
  return () => {
    clearInterval(timer);
    stopCurrent();
  };
}

export function stopAll() {
  for (const p of instruments.values()) p.then((inst) => inst.stop());
}
