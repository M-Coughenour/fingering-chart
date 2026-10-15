// Find floating pieces in the Blender-built models: parts that don't touch the rest of the
// instrument.
//
//   npm run check-models                 # every models-src/blender/*.glb
//   npm run check-models -- trumpet tuba
//
// Each mesh is split into its connected pieces; two pieces touch when a vertex of one lies
// within TOL of the other's surface, or an edge of one passes through the other's surface
// (a stem through a cap). Everything must join up into one island. Exits 1 and
// lists the strays (node / material, centre and size in metres, glTF axes) otherwise.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const DIR = fileURLToPath(new URL('../models-src/blender/', import.meta.url));
const TOL = 0.0015;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (a, d, t) => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];

/** Squared distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function distSqToTri(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const q = sub(p, along(a, ab, d1 / (d1 - d3))); return dot(q, q); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const q = sub(p, along(a, ac, d2 / (d2 - d6))); return dot(q, q); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const q = sub(p, along(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
    return dot(q, q);
  }
  const den = 1 / (va + vb + vc);
  const q = sub(p, along(along(a, ab, vb * den), ac, vc * den));
  return dot(q, q);
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Does segment pq cross triangle abc? (Möller–Trumbore, limited to the segment.) */
function segmentHitsTri(p, q, a, b, c) {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a);
  const h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-14) return false;
  const s = sub(p, a), u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const qv = cross(s, e1), v = dot(d, qv) / det;
  if (v < 0 || u + v > 1) return false;
  const t = dot(e2, qv) / det;
  return t >= 0 && t <= 1;
}

function unionFind(n) {
  const parent = [...Array(n).keys()];
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  return { find, union: (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; } };
}

const bounds = (pts) => ({
  lo: [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))),
  hi: [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))),
});
const overlaps = (A, B, t = TOL) => [0, 1, 2].every((k) => A.lo[k] - t <= B.hi[k] && B.lo[k] - t <= A.hi[k]);

/** Connected pieces of every mesh in the file, in world space. */
async function pieces(io, file) {
  const doc = await io.read(file);
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const P = [];
      for (let i = 0; i < pos.getCount(); i++) {
        const [x, y, z] = pos.getElement(i, []);
        P.push([0, 1, 2].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]));
      }
      // Vertices at the same spot (split for normals / UVs) belong together.
      const uf = unionFind(P.length);
      const seen = new Map();
      P.forEach((p, i) => {
        const key = p.map((c) => Math.round(c * 1e5)).join();
        if (seen.has(key)) uf.union(i, seen.get(key)); else seen.set(key, i);
      });
      const tris = [];
      for (let t = 0; t < idx.getCount(); t += 3) {
        const tri = [idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2)];
        uf.union(tri[0], tri[1]);
        uf.union(tri[0], tri[2]);
        tris.push(tri);
      }
      const groups = new Map();
      for (const tri of tris) {
        const root = uf.find(tri[0]);
        if (!groups.has(root)) groups.set(root, { tris: [], verts: new Set() });
        const g = groups.get(root);
        g.tris.push(tri.map((i) => P[i]));
        tri.forEach((i) => g.verts.add(i));
      }
      for (const g of groups.values()) {
        const verts = [...g.verts].map((i) => P[i]);
        out.push({ node: node.getName(), material: prim.getMaterial()?.getName() ?? '', verts, tris: g.tris, ...bounds(verts) });
      }
    }
  }
  return out;
}

/** Does a (sampled) vertex of A lie on B's surface, or an edge of A pass through it? */
function touches(A, B) {
  const step = Math.max(1, Math.floor(A.verts.length / 400));
  for (let v = 0; v < A.verts.length; v += step) {
    const p = A.verts[v];
    if (!overlaps({ lo: p, hi: p }, B)) continue;
    for (const [a, b, c] of B.tris) if (distSqToTri(p, a, b, c) < TOL * TOL) return true;
  }
  const near = B.tris.filter((t) => overlaps(bounds(t), A));
  if (!near.length) return false;
  for (const tri of A.tris) {
    for (let i = 0; i < 3; i++) {
      const p = tri[i], q = tri[(i + 1) % 3];
      const box = bounds([p, q]);
      if (!overlaps(box, B, 0)) continue;
      for (const t of near) if (overlaps(box, bounds(t), 0) && segmentHitsTri(p, q, ...t)) return true;
    }
  }
  return false;
}

/** Islands of touching pieces, biggest first. */
export async function findIslands(file, io = new NodeIO().registerExtensions(ALL_EXTENSIONS)) {
  const ps = await pieces(io, file);
  const uf = unionFind(ps.length);
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (uf.find(i) === uf.find(j) || !overlaps(ps[i], ps[j])) continue;
      if (touches(ps[i], ps[j]) || touches(ps[j], ps[i])) uf.union(i, j);
    }
  }
  const groups = new Map();
  ps.forEach((p, i) => {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(p);
  });
  const size = (g) => g.reduce((n, p) => n + p.tris.length, 0);
  return [...groups.values()].sort((a, b) => size(b) - size(a)).map((g) => {
    const { lo, hi } = bounds(g.flatMap((p) => [p.lo, p.hi]));
    return {
      parts: [...new Set(g.map((p) => `${p.node}/${p.material}`))],
      center: lo.map((l, k) => +((l + hi[k]) / 2).toFixed(3)),
      size: lo.map((l, k) => +(hi[k] - l).toFixed(3)),
    };
  });
}

export const modelFiles = () => readdirSync(DIR).filter((f) => f.endsWith('.glb')).map((f) => DIR + f);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = process.argv.slice(2);
  const files = names.length ? names.map((n) => `${DIR}${n}.glb`) : modelFiles();
  let bad = 0;
  for (const file of files) {
    const [, ...strays] = await findIslands(file);
    const name = file.slice(DIR.length);
    console.log(`${strays.length ? '✖' : '✔'} ${name}${strays.length ? `: ${strays.length} floating` : ''}`);
    for (const s of strays) console.log(`    ${s.parts.slice(0, 4).join(', ')}  centre ${s.center}  size ${s.size}`);
    bad += strays.length;
  }
  process.exit(bad ? 1 : 0);
}
