import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENTS, getInstrument } from '../src/data/instruments.js';
import { noteToMidi } from '../src/notes.js';

const keysOf = (inst, midi) => {
  const e = inst.chart.find((x) => x.midi === noteToMidi(midi));
  assert.ok(e, `${inst.id} has no ${midi}`);
  return e;
};

test('all 17 instruments are present', () => {
  assert.equal(INSTRUMENTS.length, 17);
});

for (const inst of INSTRUMENTS) {
  test(`${inst.id}: every key in the chart is a known key, notes are unique and sorted`, () => {
    const ids = inst.chart.flatMap((e) => [...e.keys, ...e.alts.flatMap((a) => a.keys)]);
    for (const id of ids) assert.ok(id.split(':')[0] in inst.keys, `unknown key ${id}`);
    const midis = inst.chart.map((e) => e.midi);
    assert.deepEqual(midis, [...new Set(midis)].sort((a, b) => a - b));
    assert.ok(inst.chart.length >= 20);
  });
}

test('brass spot checks', () => {
  assert.deepEqual(keysOf(getInstrument('trumpet'), 'C4').keys, []);
  assert.deepEqual(keysOf(getInstrument('trumpet'), 'F#3').keys, ['valve1', 'valve2', 'valve3']);
  // Euphonium concert Bb2 is open, F2 is 1+3 with a 4th-valve alternate.
  assert.deepEqual(keysOf(getInstrument('euphonium'), 'A#2').keys, []);
  assert.deepEqual(keysOf(getInstrument('euphonium'), 'F2').alts[0].keys, ['valve4']);
  // BBb tuba: Bb1 open, Eb2 is valve 1... (Eb2 = trumpet F4 = 1)
  assert.deepEqual(keysOf(getInstrument('tuba'), 'A#1').keys, []);
  assert.deepEqual(keysOf(getInstrument('tuba'), 'D#2').keys, ['valve1']);
  assert.equal(keysOf(getInstrument('trombone'), 'A#2').slide, 1);
  assert.equal(keysOf(getInstrument('trombone'), 'E2').slide, 7);
  assert.deepEqual(keysOf(getInstrument('french-horn'), 'C5').keys, ['trigger']);
  // F-attachment trombone: C3 is trigger + 1st, with 6th position as the alternate.
  const c3 = keysOf(getInstrument('trombone-f'), 'C3');
  assert.deepEqual([c3.keys, c3.slide], [['trigger'], 1]);
  assert.deepEqual(c3.alts[0], { keys: [], slide: 6 });
  assert.deepEqual(keysOf(getInstrument('trombone-f'), 'C2').keys, ['trigger']);
  assert.ok(!getInstrument('trombone').chart.some((e) => e.midi === noteToMidi('C2')));
});

test('woodwind spot checks', () => {
  assert.deepEqual(keysOf(getInstrument('clarinet'), 'G4').keys, []);
  assert.deepEqual(keysOf(getInstrument('clarinet'), 'B4').keys,
    ['register', 'thumb', 'L1', 'L2', 'L3', 'LP_E', 'R1', 'R2', 'R3']);
  assert.deepEqual(keysOf(getInstrument('alto-sax'), 'D5').keys,
    ['octave', 'L1', 'L2', 'L3', 'R1', 'R2', 'R3']);
  assert.deepEqual(keysOf(getInstrument('flute'), 'C#5').keys, ['RP_Eb']);
  assert.ok(keysOf(getInstrument('oboe'), 'D5').keys.includes('L1:half'));
  assert.ok(keysOf(getInstrument('bari-sax'), 'A3').keys.includes('lowA'));
});

test('charts cover each instrument\'s full range', () => {
  const span = (id) => {
    const c = getInstrument(id).chart;
    return [c[0].midi, c.at(-1).midi];
  };
  const expect = {
    flute: ['C4', 'C7'], oboe: ['A#3', 'F6'], bassoon: ['A#1', 'A#4'], clarinet: ['E3', 'C7'],
    'bass-clarinet': ['D#3', 'G6'], 'alto-sax': ['A#3', 'F#6'], 'bari-sax': ['A3', 'F#6'],
    trumpet: ['F#3', 'F6'], 'french-horn': ['F#2', 'F6'], trombone: ['E1', 'A#5'], 'trombone-f': ['E1', 'A#5'],
    euphonium: ['A#1', 'C5'], tuba: ['A#0', 'F4'],
  };
  for (const [id, [lo, hi]] of Object.entries(expect)) {
    assert.deepEqual(span(id), [noteToMidi(lo), noteToMidi(hi)], id);
  }
});

test('new high-register spot checks', () => {
  assert.deepEqual(keysOf(getInstrument('flute'), 'D6').keys, ['thumbB', 'L2', 'L3', 'RP_Eb']);
  assert.deepEqual(keysOf(getInstrument('clarinet'), 'E6').keys, ['register', 'thumb', 'L2', 'L3', 'RP_Gs']);
  assert.deepEqual(keysOf(getInstrument('euphonium'), 'B1').keys, ['valve1', 'valve2', 'valve3', 'valve4']);
  assert.deepEqual(keysOf(getInstrument('tuba'), 'A#0').keys, []);
  assert.equal(keysOf(getInstrument('trombone'), 'A#5').slide, 1);
  assert.deepEqual(keysOf(getInstrument('french-horn'), 'C3').keys, []);
});
