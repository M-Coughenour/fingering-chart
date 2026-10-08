// Loads an instrument model: a real model from public/models/<model>.glb when one exists,
// otherwise the procedural fallback. Both paths return a THREE.Object3D whose pressable
// parts are named after fingering key ids.
//
// Real models are described by public/models/<model>.parts.json:
// {
//   "transform": { "rotation": [x, y, z] (degrees), "height": 2 },
//   "keys": {
//     "valve1": { "node": "Valve_1_Button", "pressDir": [0, -1, 0], "travel": 0.05 },
//     "L1":     { "mesh": "Keys", "piece": 12 },              // connected piece of a mesh
//     "R1":     { "marker": [x, y, z], "normal": [x, y, z], "size": 0.03 }  // scans
//   }
// }
// Marker coordinates are in the transformed model's space (as picked with ?map).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as brass from './brass.js';
import * as woodwinds from './woodwinds.js';
import { pressable } from './parts.js';
import { splitMesh } from './splitParts.js';

const BUILDERS = { ...brass, ...woodwinds };
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();
const base = import.meta.env.BASE_URL;

/** Fetch a file from public/models, or null when it doesn't exist. */
async function fetchModelFile(name) {
  try {
    const res = await fetch(`${base}models/${name}`);
    // Dev servers answer unknown paths with index.html, so check the content type too.
    if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
    return res;
  } catch {
    return null;
  }
}

// Invisible until the Fingering highlighter swaps in its glow material.
const MARKER_HIDDEN = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

/** A ring + disc placed on the surface of a scan, facing along `normal`. */
export function addMarker(root, id, point, normal = [0, 0, 1], size = 0.03) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size, size * 0.22, 10, 32), MARKER_HIDDEN);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(size * 0.8, 28), MARKER_HIDDEN);
  g.add(ring, disc);
  g.position.fromArray(point);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...normal).normalize());
  g.translateZ(size * 0.15); // sit just above the surface
  pressable(g, id, [0, 0, -1], 0);
  g.userData.marker = true;
  root.add(g);
  return g;
}

/** Rotate, centre and scale the model to a standard height so the camera framing works. */
function normalize(scene, { rotation = [0, 0, 0], height = 2 } = {}) {
  const inner = new THREE.Group();
  inner.add(scene);
  inner.rotation.set(...rotation.map((d) => THREE.MathUtils.degToRad(d)));
  const box = new THREE.Box3().setFromObject(inner);
  const size = box.getSize(new THREE.Vector3());
  inner.scale.setScalar(height / Math.max(size.y, 1e-6));
  const center = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
  inner.position.sub(center);
  const root = new THREE.Group();
  root.add(inner);
  return root;
}

function applyParts(root, keys = {}) {
  const pieceCache = new Map();
  for (const [id, spec] of Object.entries(keys)) {
    let part = null;
    if (spec.marker) {
      addMarker(root, id, spec.marker, spec.normal, spec.size);
      continue;
    }
    if (spec.node) part = root.getObjectByName(spec.node);
    if (spec.piece !== undefined) {
      const mesh = spec.mesh ? root.getObjectByName(spec.mesh) : root.getObjectByProperty('isMesh', true);
      if (mesh?.isMesh) {
        if (!pieceCache.has(mesh)) {
          const pieces = splitMesh(mesh);
          mesh.parent.add(...pieces);
          mesh.removeFromParent();
          pieceCache.set(mesh, pieces);
        }
        part = pieceCache.get(mesh)[spec.piece];
      }
    }
    if (!part) {
      console.warn(`[models] key "${id}" not found`, spec);
      continue;
    }
    pressable(part, id, spec.pressDir ?? [0, -1, 0], spec.travel ?? 0.01);
    if (spec.positionStep) part.userData.positionStep = spec.positionStep;
  }
}

async function loadReal(model) {
  const glb = await fetchModelFile(`${model}.glb`);
  if (!glb) return null;
  const parts = await (await fetchModelFile(`${model}.parts.json`))?.json() ?? {};
  const gltf = await loader.parseAsync(await glb.arrayBuffer(), `${base}models/`);
  // Downloaded models are often single-sided shells; render their insides too.
  gltf.scene.traverse((o) => {
    if (o.isMesh) for (const m of [o.material].flat()) m.side = THREE.DoubleSide;
  });
  const root = normalize(gltf.scene, parts.transform);
  applyParts(root, parts.keys);
  root.userData.parts = parts;
  return root;
}

/** Returns { object, source: 'model' | 'procedural' }. */
export function loadModel(model) {
  if (!cache.has(model)) {
    cache.set(model, (async () => {
      const real = await loadReal(model).catch((err) => {
        console.warn(`[models] could not load ${model}.glb, using built-in model`, err);
        return null;
      });
      return real
        ? { object: real, source: 'model' }
        : { object: BUILDERS[model](), source: 'procedural' };
    })());
  }
  return cache.get(model);
}
