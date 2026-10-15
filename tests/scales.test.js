import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getInstrument } from '../src/data/instruments.js';
import { scaleSequence, MAJOR_KEYS } from '../src/data/scales.js';
import { noteToMidi } from '../src/notes.js';

const pc = (name) => MAJOR_KEYS.find((k) => k.name === name).pc;
const notes = (inst, seq) => seq.indices.map((i) => inst.chart[i].midi);

test('concert B♭, one octave, on trumpet is written C4 to C5 and back', () => {
  const tpt = getInstrument('trumpet');
  const seq = scaleSequence(tpt.chart, tpt.transpose, pc('B♭'), 1);
  const C4 = noteToMidi('C4');
  assert.deepEqual(notes(tpt, seq), [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0].map((s) => C4 + s));
  assert.equal(seq.octaves, 1);
});

test('concert E♭ on alto sax is written C major', () => {
  const sax = getInstrument('alto-sax');
  const seq = scaleSequence(sax.chart, sax.transpose, pc('E♭'), 1);
  assert.equal(seq.tonic % 12, 0);
});

test('octaves are clamped to what the range allows', () => {
  const flute = getInstrument('flute');
  const seq = scaleSequence(flute.chart, flute.transpose, pc('C'), 4);
  assert.equal(seq.octaves, 3); // C4–C7
  assert.equal(seq.indices.length, 3 * 7 * 2 + 1);
});

test('the straight trombone does not start a scale on a pedal tone', () => {
  const tbn = getInstrument('trombone');
  const seq = scaleSequence(tbn.chart, tbn.transpose, pc('B♭'), 1);
  assert.equal(seq.tonic, noteToMidi('A#2'));
});

test('every key works on every instrument', async () => {
  const { INSTRUMENTS } = await import('../src/data/instruments.js');
  for (const inst of INSTRUMENTS) {
    for (const key of MAJOR_KEYS) {
      assert.ok(scaleSequence(inst.chart, inst.transpose, key.pc, 1).octaves >= 1, `${inst.id} ${key.name}`);
    }
  }
});

test('arpeggio: concert B♭ on trumpet is written C E G C G E C', () => {
  const tpt = getInstrument('trumpet');
  const seq = scaleSequence(tpt.chart, tpt.transpose, pc('B♭'), 1, { arpeggio: true });
  const C4 = noteToMidi('C4');
  assert.deepEqual(notes(tpt, seq), [0, 4, 7, 12, 7, 4, 0].map((s) => C4 + s));
});

test('two-octave arpeggio has 1-3-5 in each octave', () => {
  const flute = getInstrument('flute');
  const seq = scaleSequence(flute.chart, flute.transpose, pc('C'), 2, { arpeggio: true });
  const C4 = noteToMidi('C4');
  assert.equal(seq.octaves, 2);
  assert.deepEqual(notes(flute, seq).slice(0, 7), [0, 4, 7, 12, 16, 19, 24].map((s) => C4 + s));
  assert.equal(seq.indices.length, 13);
});

test('arpeggio octaves are clamped to the range', () => {
  const flute = getInstrument('flute');
  const seq = scaleSequence(flute.chart, flute.transpose, pc('C'), 4, { arpeggio: true });
  assert.equal(seq.octaves, 3);
});

test('scale notes are spelled in the key', () => {
  const flute = getInstrument('flute');
  const letters = (key) => scaleSequence(flute.chart, flute.transpose, pc(key), 1).letters.slice(0, 8);
  // D major: D E F♯ G A B C♯ D — one note per letter.
  assert.deepEqual(letters('D'), [1, 2, 3, 4, 5, 6, 0, 1]);
  // G♭ major uses C♭, not B.
  assert.deepEqual(letters('G♭'), [4, 5, 6, 0, 1, 2, 3, 4]);
});
