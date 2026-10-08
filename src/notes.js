// Note-name <-> MIDI helpers. Octave numbering follows scientific pitch (C4 = MIDI 60).

const PITCH_CLASS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** 'Bb4', 'F#3', 'C5' -> MIDI number */
export function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Bad note name: ${name}`);
  const [, letter, accidental, octave] = m;
  const offset = accidental === '#' ? 1 : accidental === 'b' ? -1 : 0;
  return (Number(octave) + 1) * 12 + PITCH_CLASS[letter] + offset;
}

/** MIDI number -> display name, e.g. 70 -> 'B♭4' (flats) or 'A♯4' (sharps) */
export function midiToName(midi, useFlats = true) {
  const names = useFlats ? FLAT_NAMES : SHARP_NAMES;
  return names[((midi % 12) + 12) % 12] + (Math.floor(midi / 12) - 1);
}

/** Both spellings for an accidental, e.g. 'F♯4 / G♭4'; naturals return a single name. */
export function midiToBothNames(midi) {
  const sharp = midiToName(midi, false);
  const flat = midiToName(midi, true);
  return sharp === flat ? sharp : `${sharp} / ${flat}`;
}

export function isAccidental(midi) {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
}

/** Frequency (Hz, A4 = 440) -> nearest MIDI note and how far off it is in cents (-50..50). */
export function hzToMidi(hz, a4 = 440) {
  const exact = 69 + 12 * Math.log2(hz / a4);
  const midi = Math.round(exact);
  return { midi, cents: (exact - midi) * 100 };
}
