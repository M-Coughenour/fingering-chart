// Valve fingerings for valved brass. Every 3-valve instrument in Bb (or F, for horn-family
// written in treble clef) uses the same pattern relative to its open harmonic series, so one
// table — written as a Bb trumpet chart — drives trumpet, mellophone, euphonium, baritone,
// tuba and sousaphone by shifting it.
import { noteToMidi } from '../../notes.js';

// Written trumpet pitch -> valves pressed ('0' = open).
const TRUMPET = {
  'F#3': '123', G3: '13', 'G#3': '23', A3: '12', 'A#3': '1', B3: '2',
  C4: '0', 'C#4': '123', D4: '13', 'D#4': '23', E4: '12', F4: '1', 'F#4': '2',
  G4: '0', 'G#4': '23', A4: '12', 'A#4': '1', B4: '2',
  C5: '0', 'C#5': '12', D5: '1', 'D#5': '2', E5: '0', F5: '1', 'F#5': '2',
  G5: '0', 'G#5': '23', A5: '12', 'A#5': '1', B5: '2', C6: '0',
  'C#6': '12', D6: '1', 'D#6': '2', E6: '0', F6: '1', 'F#6': '2', G6: '0',
};

// Common alternates worth showing.
const TRUMPET_ALTS = { A4: ['3'], 'D#5': ['23'], E5: ['12'], F5: ['13'], A5: ['3'] };

const valveKeys = (code) => (code === '0' ? [] : [...code].map((v) => `valve${v}`));

// 4th-valve combinations for notes below the 3-valve range, by semitones below the
// open second partial (the 4th valve lowers a perfect fourth = 5 semitones).
const FOURTH_LOW = { 7: '14', 8: '124', 9: '234', 10: '134', 11: '1234' };

/**
 * Build a chart by mapping each note in [low, high] onto the trumpet table.
 * @param shift semitones to add to the instrument's note to get the equivalent written trumpet note
 * @param fourthValve when true, any 1+3 combination gets a 4th-valve alternate (4 replaces 1+3),
 *   and the range extends below the 3-valve limit using the 4th valve
 * @param pedal include the open pedal tone (fundamental) an octave below the open 2nd partial
 */
export function valveChart({ low, high, shift, fourthValve = false, pedal = false }) {
  const byMidi = new Map(Object.entries(TRUMPET).map(([n]) => [noteToMidi(n), n]));
  const chart = [];
  const openSecond = noteToMidi('C4') - shift; // the instrument's open low note (e.g. euphonium B♭2)
  if (pedal) chart.push({ midi: openSecond - 12, keys: [], alts: [] });
  if (fourthValve) {
    for (const [below, code] of Object.entries(FOURTH_LOW)) {
      chart.push({ midi: openSecond - Number(below), keys: valveKeys(code), alts: [] });
    }
  }
  for (let midi = noteToMidi(low); midi <= noteToMidi(high); midi++) {
    const trumpetName = byMidi.get(midi + shift);
    if (!trumpetName) continue;
    const main = TRUMPET[trumpetName];
    const alts = (TRUMPET_ALTS[trumpetName] ?? []).map((c) => ({ keys: valveKeys(c) }));
    if (fourthValve && main.includes('1') && main.includes('3')) {
      alts.unshift({ keys: valveKeys(main.replace('1', '').replace('3', '') + '4') });
    }
    chart.push({ midi, keys: valveKeys(main), alts });
  }
  return chart;
}

/** Double horn in F/Bb, written pitch. 'T' = thumb trigger (switches to the Bb side). */
const DOUBLE_HORN = {
  // Low register on the F side (2nd partial C3 open, 3rd partial G3 open).
  'F#2': '123', G2: '13', 'G#2': '23', A2: '12', 'A#2': '1', B2: '2',
  C3: '0', 'C#3': '123', D3: '13', 'D#3': '23', E3: '12', F3: '1',
  'F#3': '2', G3: '0', 'G#3': '23', A3: '12', 'A#3': '1', B3: '2',
  C4: '0', 'C#4': '123', D4: '13', 'D#4': '23', E4: '12', F4: '1', 'F#4': '2',
  G4: 'T1', 'G#4': 'T2', A4: 'T0', 'A#4': 'T1', B4: 'T2',
  C5: 'T0', 'C#5': 'T23', D5: 'T12', 'D#5': 'T1', E5: 'T2', F5: 'T0', 'F#5': 'T2',
  G5: 'T0', 'G#5': 'T2', A5: 'T0', 'A#5': 'T1', B5: 'T2', C6: 'T0',
  'C#6': 'T12', D6: 'T1', 'D#6': 'T2', E6: 'T0', F6: 'T0',
};
// F-side fingerings for the Bb-side notes (and vice versa) as alternates.
const HORN_ALTS = {
  G4: ['0'], 'G#4': ['23'], A4: ['12'], 'A#4': ['1'], B4: ['2'], C5: ['0'],
  'C#5': ['12'], D5: ['1'], 'D#5': ['2'], E5: ['0'], F5: ['1'], 'F#5': ['2'], G5: ['0'],
};

const hornKeys = (code) => [
  ...(code.startsWith('T') ? ['trigger'] : []),
  ...valveKeys(code.replace('T', '') || '0'),
];

export function hornChart() {
  return Object.entries(DOUBLE_HORN).map(([name, code]) => ({
    midi: noteToMidi(name),
    keys: hornKeys(code),
    alts: (HORN_ALTS[name] ?? []).map((c) => ({ keys: hornKeys(c) })),
  }));
}

/** Tenor trombone slide positions, concert pitch. Alternates are other usable positions. */
const TROMBONE = {
  // Pedal tones (fundamentals) — B1 to E♭2 can't be played on a straight tenor trombone.
  E1: [7], F1: [6], 'F#1': [5], G1: [4], 'G#1': [3], A1: [2], 'A#1': [1],
  E2: [7], F2: [6], 'F#2': [5], G2: [4], 'G#2': [3], A2: [2], 'A#2': [1], B2: [7],
  C3: [6], 'C#3': [5], D3: [4], 'D#3': [3], E3: [2], F3: [1, 6], 'F#3': [5],
  G3: [4], 'G#3': [3], A3: [2], 'A#3': [1, 5], B3: [4], C4: [3, 6], 'C#4': [2, 5],
  D4: [1, 4], 'D#4': [3], E4: [2, 5], F4: [1, 4], 'F#4': [3, 5], G4: [2, 4],
  'G#4': [3, 1], A4: [2], 'A#4': [1], B4: [2, 4], C5: [1, 3], 'C#5': [2], D5: [1],
  'D#5': [3], E5: [2], F5: [1], 'F#5': [3], G5: [2, 4], 'G#5': [3, 1], A5: [2], 'A#5': [1],
};

export function tromboneChart() {
  return Object.entries(TROMBONE).map(([name, [slide, ...alt]]) => ({
    midi: noteToMidi(name),
    keys: [],
    slide,
    alts: alt.map((s) => ({ keys: [], slide: s })),
  }));
}

/**
 * Tenor trombone with F attachment. Each fingering is a slide position, prefixed 'T' when the
 * thumb trigger is held (the trigger lowers the instrument a fourth, so T1 = slide 6).
 */
const TRIGGER = {
  // Low notes only reachable with the trigger (B1 is still missing on a single F attachment).
  C2: ['T6'], 'C#2': ['T5'], D2: ['T4'], 'D#2': ['T3'],
  E2: [7, 'T2'], F2: [6, 'T1'], B2: ['T2', 7], C3: ['T1', 6], F3: [1, 6, 'T1'], C4: [3, 6, 'T1'],
};

const triggerOption = (pos) => (typeof pos === 'string'
  ? { keys: ['trigger'], slide: Number(pos.slice(1)) }
  : { keys: [], slide: pos });

export function tromboneTriggerChart() {
  return Object.entries({ ...TROMBONE, ...TRIGGER }).map(([name, positions]) => {
    const [main, ...alts] = positions.map(triggerOption);
    return { midi: noteToMidi(name), ...main, alts };
  });
}
