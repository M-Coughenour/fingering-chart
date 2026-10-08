// Major scales for "Play scale". Keys are concert pitch so a whole band plays the same
// scale; the notes are converted to each instrument's written pitch to match its chart.

/** The 12 major keys in band order (around the circle of fourths from C). */
export const MAJOR_KEYS = [
  { name: 'C', pc: 0 }, { name: 'F', pc: 5 }, { name: 'B♭', pc: 10 }, { name: 'E♭', pc: 3 },
  { name: 'A♭', pc: 8 }, { name: 'D♭', pc: 1 }, { name: 'G♭', pc: 6 }, { name: 'B', pc: 11 },
  { name: 'E', pc: 4 }, { name: 'A', pc: 9 }, { name: 'D', pc: 2 }, { name: 'G', pc: 7 },
];

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];

/** Semitone offsets from the tonic for `octaves` octaves of a major scale, tonic included. */
function offsets(octaves) {
  const out = [0];
  for (let o = 0; o < octaves; o++) for (const s of MAJOR_STEPS) out.push(out.at(-1) + s);
  return out;
}

/**
 * Chart indices for a major scale going up and back down.
 * @param chart sorted chart entries (written pitch)
 * @param transpose semitones from written to concert pitch
 * @param keyPc concert pitch class of the key (0 = C)
 * @param octaves requested octaves (1–4); fewer are used when the range can't fit them
 * @returns {{ indices: number[], octaves: number, tonic: number | null }} tonic = written MIDI
 */
export function scaleSequence(chart, transpose, keyPc, octaves) {
  const byMidi = new Map(chart.map((e, i) => [e.midi, i]));
  // Written tonics: the written notes that sound as the concert key.
  const tonics = chart.map((e) => e.midi).filter((m) => (((m + transpose) % 12) + 12) % 12 === keyPc);
  for (let n = octaves; n >= 1; n--) {
    const steps = offsets(n);
    // Lowest tonic where every note of the scale exists (skips gaps such as pedal tones).
    const tonic = tonics.find((t) => steps.every((s) => byMidi.has(t + s)));
    if (tonic === undefined) continue;
    const up = steps.map((s) => byMidi.get(tonic + s));
    return { indices: [...up, ...up.slice(0, -1).reverse()], octaves: n, tonic };
  }
  return { indices: [], octaves: 0, tonic: null };
}
