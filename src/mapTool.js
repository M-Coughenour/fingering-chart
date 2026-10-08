// Dev tool for real models: open the app with ?map, pick a key, click the model where that
// key is, and copy the resulting JSON into public/models/<model>.parts.json.
import * as THREE from 'three';
import { addMarker } from './models/index.js';

const SHOWN = new THREE.MeshBasicMaterial({ color: 0xff4081, transparent: true, opacity: 0.6, depthWrite: false });

export function createMapTool({ view, getContext, onChange }) {
  const panel = document.createElement('div');
  panel.className = 'map-tool';
  panel.innerHTML = `
    <strong>Key mapping</strong>
    <label>Key <select data-key></select></label>
    <label>Marker size <input data-size type="number" step="0.005" value="0.03"></label>
    <label>Lock camera (clicks won't rotate) <input data-lock type="checkbox"></label>
    <div class="map-row">
      <button data-remove>Remove key</button>
      <button data-copy>Copy JSON</button>
    </div>
    <textarea data-out rows="8" readonly></textarea>
    <small>Click the model where the selected key is. Pink = mapped.</small>`;
  document.body.append(panel);
  const keySel = panel.querySelector('[data-key]');
  const sizeIn = panel.querySelector('[data-size]');
  const out = panel.querySelector('[data-out]');
  panel.querySelector('[data-lock]').addEventListener('change', (e) => {
    view.controls.enabled = !e.target.checked;
  });

  let parts = { transform: {}, keys: {} };

  function sync() {
    const { inst, object } = getContext();
    out.value = JSON.stringify(parts, null, 2);
    // Show every mapped marker in pink so gaps are easy to spot.
    object.traverse((o) => {
      if (o.userData.marker) o.traverse((m) => { if (m.isMesh) m.material = m.userData.original = SHOWN; });
    });
    for (const opt of keySel.options) {
      opt.textContent = `${parts.keys[opt.value] ? '✓ ' : ''}${inst.keys[opt.value] ?? 'Slide'} (${opt.value})`;
    }
  }

  function load() {
    const { inst, object } = getContext();
    parts = structuredClone(object.userData.parts ?? { transform: {}, keys: {} });
    parts.keys ??= {};
    const ids = [...Object.keys(inst.keys), ...(inst.id === 'trombone' ? ['slide'] : [])];
    keySel.replaceChildren(...ids.map((id) => new Option(id, id)));
    const firstMissing = ids.find((id) => !parts.keys[id]);
    if (firstMissing) keySel.value = firstMissing;
    sync();
  }

  function removeMarker(id) {
    const { object } = getContext();
    object.getObjectByName(id)?.removeFromParent();
  }

  let down = null;
  view.canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  view.canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const hit = view.surfaceAt(e.clientX, e.clientY);
    if (!hit) return;
    const { object } = getContext();
    const id = keySel.value;
    const point = object.worldToLocal(hit.point.clone());
    const round = (v) => +v.toFixed(4);
    removeMarker(id);
    const size = Number(sizeIn.value) || 0.03;
    parts.keys[id] = { marker: point.toArray().map(round), normal: hit.normal.toArray().map(round), size };
    addMarker(object, id, parts.keys[id].marker, parts.keys[id].normal, size);
    object.userData.parts = parts;
    // Move on to the next unmapped key.
    const next = [...keySel.options].find((o) => !parts.keys[o.value]);
    if (next) keySel.value = next.value;
    onChange();
    sync();
  });

  panel.querySelector('[data-remove]').addEventListener('click', () => {
    delete parts.keys[keySel.value];
    removeMarker(keySel.value);
    onChange();
    sync();
  });
  panel.querySelector('[data-copy]').addEventListener('click', () => {
    navigator.clipboard?.writeText(out.value);
    out.select();
  });

  return { load, sync };
}
