// Major scales for "Play scale". Keys are concert pitch so a whole band plays the same
// scale; the notes are converted to each instrument's written pitch to match its chart.

/** The 12 major keys in band order (around the circle of fourths from C). */
export const MAJOR_KEYS = [
  { name: 'C', pc: 0 }, { name: 'F', pc: 5 }, { name: 'B♭', pc: 10 }, { name: 'E♭', pc: 3 },
  { name: 'A♭', pc: 8 }, { name: 'D♭', pc: 1 }, { name: 'G♭', pc: 6 }, { name: 'B', pc: 11 },
  { name: 'E', pc: 4 }, { name: 'A', pc: 9 }, { name: 'D', pc: 2 }, { name: 'G', pc: 7 },
];

const MAJOR_STEPS = [2, 2, 1, 2, 2, 2, 1];
// Letter of each written tonic (C=0..B=6). Black-key tonics read as flat keys (D♭, E♭, G♭...).
const TONIC_LETTER = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];

/**
 * Semitone offsets and scale degrees (0–6) for `octaves` octaves of a major scale, tonic
 * included. `arpeggio` keeps only degrees 1, 3 and 5 (plus the top tonic).
 */
function offsets(octaves, arpeggio) {
  const out = [{ semis: 0, degree: 0 }];
  for (let o = 0; o < octaves; o++) {
    for (const [i, s] of MAJOR_STEPS.entries()) out.push({ semis: out.at(-1).semis + s, degree: (i + 1) % 7 });
  }
  return arpeggio ? out.filter((n) => [0, 2, 4].includes(n.degree)) : out;
}

/**
 * Chart indices for a major scale going up and back down.
 * @param chart sorted chart entries (written pitch)
 * @param transpose semitones from written to concert pitch
 * @param keyPc concert pitch class of the key (0 = C)
 * @param octaves requested octaves (1–4); fewer are used when the range can't fit them
 * @param arpeggio play only the 1st, 3rd and 5th
 * @returns {{ indices: number[], letters: number[], octaves: number, tonic: number | null }}
 *   tonic = written MIDI; letters = staff letter of each note (C=0..B=6), spelled in the key
 */
export function scaleSequence(chart, transpose, keyPc, octaves, { arpeggio = false } = {}) {
  const byMidi = new Map(chart.map((e, i) => [e.midi, i]));
  // Written tonics: the written notes that sound as the concert key.
  const tonics = chart.map((e) => e.midi).filter((m) => (((m + transpose) % 12) + 12) % 12 === keyPc);
  for (let n = octaves; n >= 1; n--) {
    const steps = offsets(n, arpeggio);
    // Lowest tonic where every note of the scale exists (skips gaps such as pedal tones).
    const tonic = tonics.find((t) => steps.every((s) => byMidi.has(t + s.semis)));
    if (tonic === undefined) continue;
    const letter = TONIC_LETTER[((tonic % 12) + 12) % 12];
    const up = steps.map((s) => byMidi.get(tonic + s.semis));
    const upLetters = steps.map((s) => (letter + s.degree) % 7);
    const down = (list) => [...list, ...list.slice(0, -1).reverse()];
    return { indices: down(up), letters: down(upLetters), octaves: n, tonic };
  }
  return { indices: [], letters: [], octaves: 0, tonic: null };
}
