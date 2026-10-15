// Instrument catalogue. `transpose` = semitones from written to concert pitch
// (charts are written pitch; audio always plays concert pitch).
// `sample` is a General MIDI soundfont name played through smplr.
import { valveChart, hornChart, tromboneChart, tromboneTriggerChart } from './fingerings/valves.js';
import * as ww from './fingerings/woodwinds.js';

const VALVE_KEYS = {
  valve1: '1st valve', valve2: '2nd valve', valve3: '3rd valve', valve4: '4th valve',
};

export const INSTRUMENTS = [
  // ------------------------------------------------------------- Woodwinds
  { id: 'flute', name: 'Flute', family: 'woodwind', transpose: 0, sample: 'flute',
    model: 'flute', ...ww.flute },
  { id: 'oboe', name: 'Oboe', family: 'woodwind', transpose: 0, sample: 'oboe',
    model: 'oboe', ...ww.oboe },
  { id: 'bassoon', name: 'Bassoon', family: 'woodwind', transpose: 0, sample: 'bassoon',
    model: 'bassoon', clef: 'bass', ...ww.bassoon },
  { id: 'clarinet', name: 'Clarinet (B♭)', family: 'woodwind', transpose: -2, sample: 'clarinet',
    model: 'clarinet', ...ww.clarinet },
  { id: 'bass-clarinet', name: 'Bass Clarinet (B♭)', family: 'woodwind', transpose: -14,
    sample: 'clarinet', model: 'bassClarinet', ...ww.bassClarinet },
  { id: 'alto-sax', name: 'Alto Sax (E♭)', family: 'woodwind', transpose: -9, sample: 'alto_sax',
    model: 'altoSax', ...ww.altoSax },
  { id: 'tenor-sax', name: 'Tenor Sax (B♭)', family: 'woodwind', transpose: -14,
    sample: 'tenor_sax', model: 'tenorSax', ...ww.tenorSax },
  { id: 'bari-sax', name: 'Bari Sax (E♭)', family: 'woodwind', transpose: -21,
    sample: 'baritone_sax', model: 'bariSax', ...ww.bariSax },

  // ------------------------------------------------------------- Brass
  { id: 'trumpet', name: 'Trumpet (B♭)', family: 'brass', transpose: -2, sample: 'trumpet',
    model: 'trumpet', keys: VALVE_KEYS,
    chart: valveChart({ low: 'F#3', high: 'F6', shift: 0 }) },
  { id: 'mellophone', name: 'Mellophone (F)', family: 'brass', transpose: -7,
    sample: 'french_horn', model: 'mellophone', keys: VALVE_KEYS,
    chart: valveChart({ low: 'F#3', high: 'D6', shift: 0 }) },
  { id: 'french-horn', name: 'French Horn (F/B♭ double)', family: 'brass', transpose: -7,
    sample: 'french_horn', model: 'frenchHorn',
    keys: { ...VALVE_KEYS, trigger: 'Thumb trigger (B♭ side)' }, chart: hornChart() },
  { id: 'trombone', name: 'Trombone (no trigger)', family: 'brass', transpose: 0, sample: 'trombone',
    model: 'trombone', clef: 'bass', keys: {}, chart: tromboneChart() },
  { id: 'trombone-f', name: 'Trombone (F trigger)', family: 'brass', transpose: 0, sample: 'trombone',
    model: 'tromboneF', clef: 'bass', keys: { trigger: 'F attachment trigger (left thumb)' },
    chart: tromboneTriggerChart() },
  { id: 'baritone', name: 'Marching Baritone', family: 'brass', transpose: 0, sample: 'trombone',
    model: 'baritone', clef: 'bass', keys: VALVE_KEYS,
    chart: valveChart({ low: 'E2', high: 'C5', shift: 14, pedal: true }) },
  { id: 'euphonium', name: 'Euphonium', family: 'brass', transpose: 0, sample: 'trombone',
    model: 'euphonium', clef: 'bass', keys: VALVE_KEYS, variant: '4 valves',
    chart: valveChart({ low: 'E2', high: 'C5', shift: 14, fourthValve: true, pedal: true }) },
  // Same instrument without the 4th valve; picked with the toggle, not the menu.
  { id: 'euphonium-3', variantOf: 'euphonium', variant: '3 valves', name: 'Euphonium',
    family: 'brass', transpose: 0, sample: 'trombone', model: 'euphonium3', clef: 'bass', keys: VALVE_KEYS,
    chart: valveChart({ low: 'E2', high: 'C5', shift: 14, pedal: true }) },
  { id: 'tuba', name: 'Tuba (BB♭)', family: 'brass', transpose: 0, sample: 'tuba',
    model: 'tuba', clef: 'bass', keys: VALVE_KEYS, variant: '4 valves',
    chart: valveChart({ low: 'E1', high: 'F4', shift: 26, fourthValve: true, pedal: true }) },
  { id: 'tuba-3', variantOf: 'tuba', variant: '3 valves', name: 'Tuba (BB♭)', family: 'brass',
    transpose: 0, sample: 'tuba', model: 'tuba3', clef: 'bass', keys: VALVE_KEYS,
    chart: valveChart({ low: 'E1', high: 'F4', shift: 26, pedal: true }) },
  { id: 'sousaphone', name: 'Sousaphone (BB♭)', family: 'brass', transpose: 0, sample: 'tuba',
    model: 'sousaphone', clef: 'bass', keys: VALVE_KEYS,
    chart: valveChart({ low: 'E1', high: 'F4', shift: 26, pedal: true }) },
];

for (const inst of INSTRUMENTS) inst.chart.sort((a, b) => a.midi - b.midi);

export const getInstrument = (id) => INSTRUMENTS.find((i) => i.id === id) ?? INSTRUMENTS[0];

/** The menu entry an instrument belongs to, and all its versions (e.g. 3 / 4 valves). */
export const baseOf = (inst) => inst.variantOf ?? inst.id;
export const variantsOf = (inst) => INSTRUMENTS
  .filter((i) => baseOf(i) === baseOf(inst) && i.variant)
  .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true }));
