// Split an indexed mesh into its connected pieces (separate key cups, valve buttons, ...),
// so pieces that were exported as one mesh can still be highlighted individually.
import * as THREE from 'three';

export function splitMesh(mesh) {
  const geo = mesh.geometry.index ? mesh.geometry : mesh.geometry.toNonIndexed();
  const index = geo.index ? geo.index.array : [...Array(geo.attributes.position.count).keys()];
  const pos = geo.attributes.position;

  // Vertices at the same position count as connected (UV seams split vertices).
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  const union = (a, b) => { parent[find(a)] = find(b); };
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(5)},${pos.getY(i).toFixed(5)},${pos.getZ(i).toFixed(5)}`;
    if (seen.has(key)) union(i, seen.get(key)); else seen.set(key, i);
  }
  for (let t = 0; t < index.length; t += 3) {
    union(index[t], index[t + 1]);
    union(index[t], index[t + 2]);
  }

  // Group triangles by component, largest first so piece 0 is the body.
  const groups = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const root = find(index[t]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(index[t], index[t + 1], index[t + 2]);
  }
  return [...groups.values()]
    .sort((a, b) => b.length - a.length)
    .map((tris) => {
      const piece = geo.clone();
      piece.setIndex(tris);
      const m = new THREE.Mesh(piece, mesh.material);
      m.position.copy(mesh.position);
      m.quaternion.copy(mesh.quaternion);
      m.scale.copy(mesh.scale);
      return m;
    });
}
