// Shared geometry helpers and materials for the procedural instrument models.
import * as THREE from 'three';

// ---------------------------------------------------------------- materials
// Shared instances (the highlighter swaps materials per mesh, so sharing is safe).

/** Procedural wood grain: fine streaks along the length of the tube. */
function woodTexture(base, streak, figure = 0) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 260; i++) {
    const x = Math.random() * c.width;
    ctx.strokeStyle = streak;
    ctx.globalAlpha = 0.08 + Math.random() * 0.25;
    ctx.lineWidth = 0.5 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + (Math.random() - 0.5) * 6, c.height);
    ctx.stroke();
  }
  // Flame figure (bassoon maple): faint wavy shimmer across the grain.
  for (let i = 0; i < 40 * figure; i++) {
    const y = Math.random() * c.height;
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = Math.random() < 0.5 ? '#000' : '#fff';
    ctx.fillRect(0, y, c.width, 1 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 2);
  return tex;
}

// Tubes and bells are open shells, so every material is double-sided: the inside of the bore
// renders instead of leaving see-through voids.
const memo = (make) => {
  let m;
  return () => {
    if (!m) {
      m = make();
      m.side = THREE.DoubleSide;
    }
    return m;
  };
};

export const MAT = {
  // Clear-lacquered yellow brass.
  brass: memo(() => new THREE.MeshPhysicalMaterial({
    color: 0xe3b65e, metalness: 1, roughness: 0.16, clearcoat: 0.7, clearcoatRoughness: 0.08,
  })),
  // Silver plate (flute, trumpet trim, mouthpieces).
  silver: memo(() => new THREE.MeshPhysicalMaterial({
    color: 0xeef0f3, metalness: 1, roughness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.05,
  })),
  // Nickel-silver keywork.
  nickel: memo(() => new THREE.MeshPhysicalMaterial({ color: 0xd6d9de, metalness: 1, roughness: 0.2 })),
  // Grenadilla (clarinet, oboe): almost black with a faint brown grain.
  blackwood: memo(() => new THREE.MeshPhysicalMaterial({
    map: woodTexture('#2a221f', '#000000'), metalness: 0, roughness: 0.32,
    clearcoat: 0.5, clearcoatRoughness: 0.2,
  })),
  // Flamed maple with red-brown varnish (bassoon).
  maple: memo(() => new THREE.MeshPhysicalMaterial({
    map: woodTexture('#7e3517', '#3a1206', 1), metalness: 0, roughness: 0.3,
    clearcoat: 0.8, clearcoatRoughness: 0.1,
  })),
  // Hard rubber mouthpieces.
  ebonite: memo(() => new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.25, clearcoat: 0.6 })),
  // Mother-of-pearl touches.
  pearl: memo(() => new THREE.MeshPhysicalMaterial({
    color: 0xf7f1e6, roughness: 0.18, iridescence: 0.8, iridescenceIOR: 1.6, clearcoat: 1,
  })),
  pad: memo(() => new THREE.MeshStandardMaterial({ color: 0x9a7b55, roughness: 0.75 })),
  cork: memo(() => new THREE.MeshStandardMaterial({ color: 0xb08d63, roughness: 0.9 })),
  hole: memo(() => new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 })),
  reed: memo(() => new THREE.MeshStandardMaterial({ color: 0xd9c08a, roughness: 0.6 })),
  thread: memo(() => new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.8 })),
  dark: memo(() => new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.4, roughness: 0.5 })),
};

// ---------------------------------------------------------------- tubing

const v3 = (p) => (p.isVector3 ? p : new THREE.Vector3(...p));

/**
 * Tube along a smooth path through `points` whose radius goes from r0 to r1
 * (brass tubing is conical, so most tubes taper).
 */
export function taperedTube(points, r0, r1, material, { segments = 64, radial = 20 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map(v3), false, 'centripetal');
  const frames = curve.computeFrenetFrames(segments, false);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const p = curve.getPointAt(u);
    const r = r0 + (r1 - r0) * u;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const n = frames.normals[i].clone().multiplyScalar(Math.cos(a))
        .addScaledVector(frames.binormals[i], Math.sin(a));
      pos.push(p.x + n.x * r, p.y + n.y * r, p.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(j / radial, u);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, material);
  mesh.userData.curve = curve;
  return mesh;
}

/** Constant-radius tube. */
export const tube = (points, radius, material, segments = 64) =>
  taperedTube(points, radius, radius, material, { segments });

/** Straight cylinder along Y, radius r0 at the bottom and r1 at the top. */
export function cone(length, r0, r1, material, open = true) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, length, 40, 1, open), material);
}

/** A ring (ferrule, tenon ring, bell bead) around the Y axis. */
export function ring(radius, thickness, material, y = 0) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, thickness, 10, 48), material);
  m.rotation.x = Math.PI / 2;
  m.position.y = y;
  return m;
}

/** Ferrule sleeve at fraction `t` of a tube made by taperedTube. */
export function ferruleOn(tubeMesh, t, radius, length, material) {
  const curve = tubeMesh.userData.curve;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), material);
  sleeve.position.copy(curve.getPointAt(t));
  sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), curve.getTangentAt(t));
  return sleeve;
}

/**
 * Flared bell along +Y using a Bessel-horn profile (narrow, then opening quickly at the end),
 * with a rolled rim bead. `flare` > 1 opens later and harder.
 */
export function bell(length, r0, r1, material, flare = 4) {
  const pts = [];
  const steps = 60;
  const k = 0.985;
  const m = Math.max(0.35, flare / 6);
  const f = (t) => (Math.pow(1 / (1 - k * t), m) - 1) / (Math.pow(1 / (1 - k), m) - 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(new THREE.Vector2(r0 + (r1 - r0) * f(t), t * length));
  }
  const geo = new THREE.LatheGeometry(pts, 64);
  const mat = material.clone();
  mat.side = THREE.DoubleSide;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, mat));
  g.add(ring(r1, Math.max(0.003, r1 * 0.035), material, length));
  return g;
}

/** U-shaped crook from a to b (both [x,y,z]), bulging toward `dir` by `depth`. */
export function crook(a, b, dir, depth, radius, material, radius2 = radius) {
  const steps = 14;
  const pts = [];
  // Semicircle-ish bend: straight legs, rounded end.
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * Math.PI;
    const along = Math.sin(ang);
    const blend = (1 - Math.cos(ang)) / 2;
    pts.push(a.map((v, j) => v + (b[j] - v) * blend + dir[j] * depth * along));
  }
  return taperedTube(pts, radius, radius2, material, { segments: 48 });
}

/** Small post (pillar) that holds a key rod, standing out of a body along local +Y. */
export function post(height, material) {
  const g = new THREE.Group();
  const p = cone(height, 0.004, 0.003, material, false);
  p.position.y = height / 2;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 12, 8), material);
  ball.position.y = height;
  g.add(p, ball);
  return g;
}

/** Text label as a sprite (used for trombone slide positions). */
export function textSprite(text, color = '#333', size = 0.12) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 68);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }),
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}

/**
 * Mark an object as a pressable part. `pressDir` is the local direction it moves when pressed.
 * The highlight code finds parts by `name`, which is the fingering key id.
 */
export function pressable(obj, name, pressDir = [0, -1, 0], travel = 0.02) {
  obj.name = name;
  obj.userData.pressable = true;
  obj.userData.pressDir = pressDir;
  obj.userData.travel = travel;
  return obj;
}
