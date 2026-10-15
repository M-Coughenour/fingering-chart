import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hzToMidi, noteToMidi } from '../src/notes.js';

test('hzToMidi finds the nearest note and the cents offset', () => {
  assert.deepEqual(hzToMidi(440), { midi: noteToMidi('A4'), cents: 0 });
  assert.equal(hzToMidi(466.16).midi, noteToMidi('A#4'));
  assert.ok(Math.abs(hzToMidi(445).cents - 19.56) < 0.1);
  assert.ok(Math.abs(hzToMidi(435).cents + 19.79) < 0.1);
  assert.equal(hzToMidi(29.14).midi, noteToMidi('A#0')); // tuba pedal B♭
});

test('staffStep places notes on the staff with flat spellings', async () => {
  const { staffStep } = await import('../src/staff.js');
  assert.deepEqual(staffStep(noteToMidi('C4')), { step: 28, acc: 0 });
  assert.deepEqual(staffStep(noteToMidi('E4')), { step: 30, acc: 0 }); // treble bottom line
  assert.deepEqual(staffStep(noteToMidi('A#4')), { step: 34, acc: -1 }); // written B♭4
  assert.deepEqual(staffStep(noteToMidi('G2')), { step: 18, acc: 0 }); // bass bottom line
});

test('staffStep follows a given letter: sharps, and C♭ above B', async () => {
  const { staffStep } = await import('../src/staff.js');
  assert.deepEqual(staffStep(noteToMidi('F#4'), 3), { step: 31, acc: 1 }); // F♯4
  assert.deepEqual(staffStep(noteToMidi('B3'), 0), { step: 28, acc: -1 }); // C♭4, not B3
  assert.deepEqual(staffStep(noteToMidi('C5'), 6), { step: 34, acc: 1 }); // B♯4
});
