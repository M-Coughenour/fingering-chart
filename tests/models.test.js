import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { INSTRUMENTS } from '../src/data/instruments.js';

const dir = new URL('../public/models/', import.meta.url);
const files = readdirSync(dir);
const credits = JSON.parse(readFileSync(new URL('credits.json', dir)));

for (const file of files.filter((f) => f.endsWith('.parts.json'))) {
  const model = file.replace('.parts.json', '');
  const parts = JSON.parse(readFileSync(new URL(file, dir)));

  test(`${model}: has a GLB and a credit`, () => {
    assert.ok(files.includes(`${model}.glb`), `missing ${model}.glb`);
    assert.ok(credits[model]?.license, `missing credit for ${model}`);
  });

  for (const inst of INSTRUMENTS.filter((i) => i.model === model)) {
    test(`${model}: mapping covers every key ${inst.id} uses`, () => {
      const known = new Set([...Object.keys(inst.keys), 'slide']);
      for (const id of Object.keys(parts.keys)) assert.ok(known.has(id), `unknown key ${id}`);
      const used = inst.chart.flatMap((e) => [...e.keys, ...e.alts.flatMap((a) => a.keys)]);
      for (const id of new Set(used.map((k) => k.split(':')[0]))) {
        assert.ok(parts.keys[id], `${id} is used in the chart but not mapped on the model`);
      }
    });
  }
}

// The Blender exports are build inputs; skip when they haven't been built on this machine.
const { findIslands, modelFiles } = await import('../scripts/check-models.mjs').catch(() => ({}));
let sources = [];
try { sources = modelFiles(); } catch { /* models-src/blender not built */ }
for (const file of sources) {
  test(`${file.split('/').pop()}: no floating pieces`, { timeout: 120000 }, async () => {
    const [, ...strays] = await findIslands(file);
    assert.deepEqual(strays, [], 'pieces that don\'t touch the rest of the instrument');
  });
}
