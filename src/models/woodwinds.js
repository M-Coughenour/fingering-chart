// Procedural woodwind models. Each body is built along +Y, then keys are placed on it by
// height (y) and angle around the tube (0° faces the camera, positive = to the player's left).
// Part names match the key ids in src/data/fingerings/woodwinds.js.
import * as THREE from 'three';
import { MAT, taperedTube, tube, cone, bell, crook, ring, post, pressable } from './parts.js';

const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const outward = (angle) => new THREE.Vector3(Math.sin(angle * DEG), 0, Math.cos(angle * DEG));

// ---------------------------------------------------------------- keys

/**
 * Make one key part, built in a local frame where +Y points out of the body and +Z runs
 * along it. Kinds:
 *  hole  – open tone hole with a ring key around it (clarinet, bassoon)
 *  plate – covered key: cup over the hole (oboe, bass clarinet)
 *  pearl – pad cup with a mother-of-pearl touch (saxophone)
 *  flute – French-style open-hole cup with a perforated centre
 *  lever – long spatula touch (pinky, side, octave keys)
 *  small – small round touch on a stem (palm, thumb, trill keys)
 */
function makeKey(kind, size, mats) {
  const g = new THREE.Group();
  const arm = (len, y = size * 0.25) => {
    // Short arm running sideways from the key toward its rod.
    const a = new THREE.Mesh(new THREE.BoxGeometry(len, size * 0.14, size * 0.3), mats.metal);
    a.position.set(-len / 2 - size * 0.6, y, 0);
    return a;
  };
  if (kind === 'hole') {
    const hole = new THREE.Mesh(new THREE.CircleGeometry(size * 0.62, 28), MAT.hole());
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = -size * 0.08;
    const keyRing = new THREE.Mesh(new THREE.TorusGeometry(size * 0.85, size * 0.12, 10, 32), mats.metal);
    keyRing.rotation.x = Math.PI / 2;
    keyRing.position.y = size * 0.18;
    g.add(hole, keyRing, arm(size * 0.8, size * 0.18));
  } else if (kind === 'plate' || kind === 'flute') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.05, size * 0.95, size * 0.32, 32), mats.metal);
    cup.position.y = size * 0.2;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.98, size * 0.98, size * 0.08, 32), MAT.pad());
    pad.position.y = size * 0.02;
    g.add(cup, pad, arm(size * 0.7));
    if (kind === 'flute') {
      const perforation = new THREE.Mesh(new THREE.CircleGeometry(size * 0.32, 24), MAT.hole());
      perforation.rotation.x = -Math.PI / 2;
      perforation.position.y = size * 0.365;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(size * 0.36, size * 0.06, 8, 24), mats.metal);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = size * 0.37;
      g.add(perforation, rim);
    }
  } else if (kind === 'pearl') {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.5, size * 1.4, size * 0.4, 36), mats.metal);
    cup.position.y = size * 0.25;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(size * 1.45, size * 0.08, 8, 36), mats.metal);
    lip.rotation.x = Math.PI / 2;
    lip.position.y = size * 0.07;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(size * 1.38, size * 1.38, size * 0.12, 36), MAT.pad());
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(size * 0.72, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.4), mats.pearl);
    pearl.position.y = size * 0.42;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.8, size * 0.8, size * 0.1, 28), mats.metal);
    seat.position.y = size * 0.45;
    g.add(cup, lip, pad, seat, pearl, arm(size * 0.9));
  } else if (kind === 'lever') {
    // Rounded spatula, long axis along local Z (the body axis).
    const spatula = new THREE.Mesh(new THREE.CapsuleGeometry(size * 0.55, size * 1.8, 6, 16), mats.metal);
    spatula.rotation.x = Math.PI / 2;
    spatula.scale.set(1, 1, 0.4);
    spatula.position.y = size * 0.25;
    const stem = cone(size * 0.4, size * 0.12, size * 0.12, mats.metal, false);
    g.add(spatula, stem);
  } else {
    const touch = new THREE.Mesh(new THREE.CylinderGeometry(size, size * 0.9, size * 0.35, 24), mats.metal);
    touch.position.y = size * 0.45;
    const stem = cone(size * 0.5, size * 0.18, size * 0.18, mats.metal, false);
    stem.position.y = size * 0.15;
    g.add(touch, stem);
  }
  return g;
}

/** Orient `obj` on a body: local +Y out of the body at `angle`, local +Z along the body. */
function orientOn(obj, angle, r, y, lift = 0) {
  const out = outward(angle);
  obj.position.copy(out.clone().multiplyScalar(r + lift)).setY(y);
  const side = new THREE.Vector3().crossVectors(out, UP);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, out, UP));
  return obj;
}

function placeKey(parent, spec, r, mats) {
  const { id, y, angle = 0, kind = 'hole', size = 0.03, lift = 0.004 } = spec;
  const key = orientOn(makeKey(kind, size, mats), angle, r, y, lift);
  if (id) pressable(key, id, [0, -1, 0], Math.min(0.01, size * 0.35));
  parent.add(key);
  return key;
}

function keysOn(parent, specs, radiusAt, mats) {
  for (const s of specs) placeKey(parent, s, radiusAt(s.y), mats);
}

/** Key rod running along the body at `angle` from y0 to y1, held by posts at both ends. */
function rod(parent, angle, y0, y1, radiusAt, mat, offset = 0.012) {
  const out = outward(angle);
  const a = out.clone().multiplyScalar(radiusAt(y0) + offset).setY(y0);
  const b = out.clone().multiplyScalar(radiusAt(y1) + offset).setY(y1);
  const r = cone(a.distanceTo(b), 0.0032, 0.0032, mat, false);
  r.position.copy(a).lerp(b, 0.5);
  r.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  parent.add(r);
  for (const y of [y0, y1, (y0 + y1) / 2]) {
    const p = post(offset, mat);
    p.position.copy(out.clone().multiplyScalar(radiusAt(y))).setY(y);
    p.quaternion.setFromUnitVectors(UP, out);
    parent.add(p);
  }
}

/** Decorative closed key cups (no fingering role) to fill out the keywork. */
function extraCups(parent, list, radiusAt, mats, kind = 'plate') {
  for (const [y, angle, size] of list) placeKey(parent, { y, angle, size, kind }, radiusAt(y), mats);
}

const woodMats = () => ({ metal: MAT.nickel(), touch: MAT.nickel(), pearl: MAT.pearl() });

// ---------------------------------------------------------------- reed mouthpieces

/** Single-reed mouthpiece along +Y with reed (on the back, -Z) and two-screw ligature. */
function singleReedMouthpiece(r, len) {
  const g = new THREE.Group();
  const pts = [[r, 0], [r * 1.02, len * 0.35], [r * 0.95, len * 0.6], [r * 0.75, len * 0.85], [r * 0.45, len], [0, len]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), MAT.ebonite());
  body.scale.z = 0.85;
  const reed = new THREE.Mesh(new THREE.BoxGeometry(r * 1.2, len * 0.75, r * 0.12), MAT.reed());
  reed.position.set(0, len * 0.55, -r * 0.88);
  reed.rotation.x = -0.12;
  g.add(body, reed);
  for (const y of [len * 0.3, len * 0.48]) {
    g.add(ring(r * 1.06, r * 0.07, MAT.nickel(), y));
    const screw = cone(r * 0.3, r * 0.08, r * 0.08, MAT.nickel(), false);
    screw.rotation.z = Math.PI / 2;
    screw.position.set(r * 1.1, y, -r * 0.55);
    g.add(screw);
  }
  return g;
}

// ---------------------------------------------------------------- Clarinet family

const CLARINET_KEYS = [
  { id: 'register', y: 0.7, angle: 150, kind: 'lever', size: 0.018 },
  { id: 'thumb', y: 0.6, angle: 160, size: 0.02 },
  { id: 'aKey', y: 0.75, angle: 0, kind: 'lever', size: 0.017 },
  { id: 'gsKey', y: 0.66, angle: -40, kind: 'lever', size: 0.015 },
  { id: 'L1', y: 0.56, size: 0.021 },
  { id: 'sliver', y: 0.5, angle: 38, kind: 'lever', size: 0.012 },
  { id: 'L2', y: 0.44, size: 0.021 },
  { id: 'L3', y: 0.32, size: 0.021 },
  { id: 'LP_E', y: 0.24, angle: -48, kind: 'small', size: 0.014 },
  { id: 'LP_F', y: 0.19, angle: -48, kind: 'small', size: 0.014 },
  { id: 'LP_Fs', y: 0.14, angle: -48, kind: 'small', size: 0.014 },
  { id: 'LP_Gs', y: 0.09, angle: -48, kind: 'small', size: 0.014 },
  { id: 'LP_Cs', y: 0.04, angle: -48, kind: 'small', size: 0.014 },
  { id: 'side3', y: -0.02, angle: 70, kind: 'lever', size: 0.012 },
  { id: 'side4', y: -0.1, angle: 70, kind: 'lever', size: 0.012 },
  { id: 'R1', y: -0.08, size: 0.021 },
  { id: 'R2', y: -0.2, size: 0.021 },
  { id: 'RS_B', y: -0.21, angle: 36, kind: 'lever', size: 0.011 },
  { id: 'R3', y: -0.32, size: 0.021 },
  { id: 'RP_E', y: -0.42, angle: 42, kind: 'small', size: 0.014 },
  { id: 'RP_F', y: -0.47, angle: 42, kind: 'small', size: 0.014 },
  { id: 'RP_Fs', y: -0.52, angle: 42, kind: 'small', size: 0.014 },
  { id: 'RP_Gs', y: -0.57, angle: 42, kind: 'small', size: 0.014 },
];

/** Clarinet keywork shared by soprano and bass: rods, trill keys and closed cups. */
function clarinetKeywork(g, radiusAt, mats, keys) {
  keysOn(g, keys, radiusAt, mats);
  rod(g, -28, 0.05, 0.72, radiusAt, mats.metal);
  rod(g, 28, -0.62, -0.02, radiusAt, mats.metal);
  rod(g, -62, -0.55, 0.26, radiusAt, mats.metal);
  rod(g, 62, -0.15, 0.55, radiusAt, mats.metal);
  extraCups(g, [[0.62, 55, 0.014], [0.68, 30, 0.013], [-0.62, -40, 0.02], [-0.68, -20, 0.022], [-0.74, 20, 0.022]], radiusAt, mats);
  // Thumb rest on the back of the lower joint.
  const rest = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.03), mats.metal);
  orientOn(rest, 180, radiusAt(-0.1), -0.1, 0.012);
  g.add(rest);
}

export function clarinet() {
  const g = new THREE.Group();
  const r = 0.044;
  const mats = woodMats();
  const radiusAt = () => r;
  // Upper and lower joints with nickel tenon rings.
  g.add(cone(1.6, r, r, MAT.blackwood(), false));
  for (const y of [0.8, 0.02, -0.02, -0.8]) g.add(ring(r * 1.02, r * 0.07, MAT.nickel(), y));
  // Barrel (slightly bulged) and mouthpiece.
  const barrelPts = [[r * 1.05, 0], [r * 1.18, 0.07], [r * 1.05, 0.15]].map(([x, y]) => new THREE.Vector2(x, y));
  const barrel = new THREE.Mesh(new THREE.LatheGeometry(barrelPts, 40), MAT.blackwood());
  barrel.position.y = 0.8;
  g.add(barrel, ring(r * 1.08, r * 0.08, MAT.nickel(), 0.8), ring(r * 1.06, r * 0.08, MAT.nickel(), 0.95));
  const mp = singleReedMouthpiece(r * 0.85, 0.2);
  mp.position.y = 0.95;
  g.add(mp);
  // Bell with a nickel ring at the joint.
  const b = bell(0.34, r, 0.15, MAT.blackwood(), 2.6);
  b.rotation.x = Math.PI;
  b.position.y = -0.8;
  g.add(b, ring(r * 1.1, r * 0.09, MAT.nickel(), -0.82));
  clarinetKeywork(g, radiusAt, mats, CLARINET_KEYS);
  return g;
}

export function bassClarinet() {
  const r = 0.072;
  const g = new THREE.Group();
  const mats = woodMats();
  const radiusAt = () => r;
  g.add(cone(1.7, r, r, MAT.blackwood(), false));
  for (const y of [0.85, 0.02, -0.85]) g.add(ring(r * 1.02, r * 0.06, MAT.nickel(), y));
  // Metal neck curving back (-Z) to the player, mouthpiece on the end.
  g.add(tube([[0, 0.85, 0], [0, 1.02, 0], [0, 1.16, -0.08], [0, 1.22, -0.24]], r * 0.42, MAT.silver()));
  const mp = singleReedMouthpiece(r * 0.48, 0.18);
  mp.position.set(0, 1.22, -0.24);
  mp.rotation.x = -Math.PI / 2.4;
  g.add(mp);
  // Upturned metal bell, with the curve at the bottom.
  g.add(crook([0, -0.85, 0], [0, -0.85, 0.3], [0, -1, 0], 0.2, r, MAT.silver(), r * 1.15));
  const b = bell(0.4, r * 1.15, 0.24, MAT.silver(), 2.6);
  b.position.set(0, -0.85, 0.3);
  g.add(b);
  const keys = [
    ...CLARINET_KEYS.map((k) => ({ ...k, size: k.size * 1.4, kind: k.kind ?? 'plate' })),
    { id: 'lowEb', y: -0.66, angle: -40, kind: 'lever', size: 0.02 },
  ];
  clarinetKeywork(g, radiusAt, mats, keys);
  // Floor peg.
  const peg = cone(0.3, 0.008, 0.008, MAT.nickel(), false);
  peg.position.set(0, -1.05, 0.15);
  g.add(peg);
  return g;
}

// ---------------------------------------------------------------- Oboe

export function oboe() {
  const g = new THREE.Group();
  const mats = woodMats();
  const top = 0.75;
  const bottom = -0.75;
  const rTop = 0.026;
  const rBottom = 0.04;
  const radiusAt = (y) => rTop + ((top - y) / (top - bottom)) * (rBottom - rTop);
  g.add(cone(top - bottom, rBottom, rTop, MAT.blackwood(), false));
  for (const y of [top, 0.06, 0.02, bottom]) g.add(ring(radiusAt(y) * 1.03, 0.003, MAT.nickel(), y));
  // Bell with the oboe's inward-curving lip.
  const bellPts = [[rBottom, 0], [rBottom * 1.25, 0.08], [rBottom * 1.9, 0.18], [rBottom * 2.1, 0.23], [rBottom * 1.8, 0.25]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  const bellMesh = new THREE.Mesh(new THREE.LatheGeometry(bellPts, 40), MAT.blackwood());
  bellMesh.rotation.x = Math.PI;
  bellMesh.position.y = bottom;
  g.add(bellMesh, ring(rBottom * 1.05, 0.003, MAT.nickel(), bottom - 0.01));
  // Double reed: cork, thread wrapping and the two cane blades.
  const cork = cone(0.035, rTop * 0.5, rTop * 0.4, MAT.cork());
  cork.position.y = top + 0.018;
  const thread = cone(0.04, rTop * 0.42, rTop * 0.3, MAT.thread());
  thread.position.y = top + 0.055;
  const blades = new THREE.Mesh(new THREE.BoxGeometry(rTop * 0.75, 0.06, rTop * 0.16), MAT.reed());
  blades.position.y = top + 0.105;
  g.add(cork, thread, blades);

  keysOn(g, [
    { id: 'oct1', y: 0.64, angle: 150, kind: 'lever', size: 0.016 },
    { id: 'oct2', y: 0.62, angle: 45, kind: 'lever', size: 0.013 },
    { id: 'L1', y: 0.54, kind: 'plate', size: 0.017 },
    { id: 'L2', y: 0.43, kind: 'plate', size: 0.017 },
    { id: 'L3', y: 0.32, kind: 'plate', size: 0.017 },
    { id: 'LP_Gs', y: 0.24, angle: -48, kind: 'small', size: 0.013 },
    { id: 'LP_B', y: 0.19, angle: -48, kind: 'small', size: 0.013 },
    { id: 'LP_Bb', y: 0.14, angle: -48, kind: 'small', size: 0.013 },
    { id: 'LP_Eb', y: 0.09, angle: -48, kind: 'small', size: 0.013 },
    { id: 'R1', y: -0.08, kind: 'plate', size: 0.018 },
    { id: 'R2', y: -0.19, kind: 'plate', size: 0.018 },
    { id: 'R_F', y: -0.25, angle: 40, kind: 'lever', size: 0.011 },
    { id: 'R3', y: -0.3, kind: 'plate', size: 0.018 },
    { id: 'RP_C', y: -0.42, angle: 42, kind: 'small', size: 0.013 },
    { id: 'RP_Cs', y: -0.47, angle: 42, kind: 'small', size: 0.013 },
    { id: 'RP_Eb', y: -0.52, angle: 42, kind: 'small', size: 0.013 },
  ], radiusAt, mats);
  // Oboe keywork is dense: long rods down both sides and plenty of closed keys.
  rod(g, -30, -0.6, 0.7, radiusAt, mats.metal);
  rod(g, 30, -0.65, 0.6, radiusAt, mats.metal);
  rod(g, -65, -0.4, 0.3, radiusAt, mats.metal);
  rod(g, 65, -0.55, 0.1, radiusAt, mats.metal);
  extraCups(g, [[0.68, 20, 0.011], [0.48, -35, 0.011], [0.37, 35, 0.011], [0.02, -25, 0.014], [-0.36, -30, 0.015],
    [-0.58, 25, 0.017], [-0.64, -20, 0.018], [-0.7, 10, 0.018]], radiusAt, mats);
  return g;
}

// ---------------------------------------------------------------- Flute

export function flute() {
  const r = 0.026;
  const g = new THREE.Group();
  const mats = { metal: MAT.silver(), touch: MAT.silver(), pearl: MAT.pearl() };
  const radiusAt = () => r;
  g.add(cone(1.95, r, r, MAT.silver(), false));
  // Joint rings: head joint / body / foot joint.
  for (const y of [0.55, 0.5, -0.62, -0.67]) g.add(ring(r * 1.08, r * 0.08, MAT.silver(), y));
  // Crown on the end of the head joint.
  const crown = cone(0.04, r * 1.1, r * 1.1, MAT.silver(), false);
  crown.position.y = 0.995;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(r * 0.9, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.silver());
  finial.position.y = 1.015;
  g.add(crown, finial);
  // Lip plate: a curved plate wrapped round the tube, with the embouchure hole.
  const lip = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.2, r * 1.2, 0.07, 32, 1, true, -0.7, 1.4), MAT.silver().clone());
  lip.material.side = THREE.DoubleSide;
  lip.position.y = 0.86;
  const emb = new THREE.Mesh(new THREE.CircleGeometry(0.011, 24), MAT.hole());
  emb.scale.y = 1.35;
  emb.position.set(0, 0.86, r * 1.21);
  const riser = new THREE.Mesh(new THREE.TorusGeometry(0.0125, 0.003, 8, 24), MAT.silver());
  riser.scale.y = 1.3;
  riser.position.copy(emb.position);
  g.add(lip, emb, riser);

  keysOn(g, [
    { id: 'thumbBb', y: 0.42, angle: 155, kind: 'small', size: 0.013 },
    { id: 'thumbB', y: 0.36, angle: 155, kind: 'lever', size: 0.015 },
    { id: 'L1', y: 0.36, kind: 'flute', size: 0.022 },
    { id: 'L2', y: 0.24, kind: 'flute', size: 0.022 },
    { id: 'L3', y: 0.12, kind: 'flute', size: 0.022 },
    { id: 'LP_Gs', y: 0.03, angle: -50, kind: 'lever', size: 0.013 },
    { id: 'R1', y: -0.2, kind: 'flute', size: 0.022 },
    { id: 'R2', y: -0.32, kind: 'flute', size: 0.022 },
    { id: 'R3', y: -0.44, kind: 'flute', size: 0.022 },
    { id: 'trillD', y: -0.26, angle: 32, kind: 'lever', size: 0.011 },
    { id: 'trillDs', y: -0.38, angle: 32, kind: 'lever', size: 0.011 },
    { id: 'RP_Eb', y: -0.55, angle: 45, kind: 'lever', size: 0.013 },
    { id: 'RP_Cs', y: -0.82, angle: 35, kind: 'lever', size: 0.013 },
    { id: 'RP_C', y: -0.9, angle: 35, kind: 'lever', size: 0.013 },
  ], radiusAt, mats);
  // Boehm mechanism: long rods on the far side with posts; closed keys between the open ones.
  rod(g, 62, -0.52, 0.46, radiusAt, mats.metal, 0.016);
  rod(g, 50, -0.95, -0.66, radiusAt, mats.metal, 0.014);
  extraCups(g, [[0.46, 20, 0.018], [0.3, 18, 0.018], [0.03, 20, 0.02], [-0.08, 25, 0.02], [-0.56, 15, 0.022],
    [-0.75, 20, 0.022], [-0.86, 10, 0.022], [-0.94, 18, 0.022]], radiusAt, mats);
  // Lay it sideways with the head joint on the player's left.
  g.rotation.z = Math.PI / 2;
  return wrap(g);
}

// ---------------------------------------------------------------- Bassoon

export function bassoon() {
  const g = new THREE.Group();
  const mats = woodMats();
  const rA = 0.045; // wing joint + boot (front tube, finger holes)
  const rB = 0.06; // long joint + bell (back tube)
  const A = new THREE.Group();
  const B = new THREE.Group();
  B.position.set(0.13, 0, -0.03);
  g.add(A, B);

  const wing = cone(1.5, rA, rA * 0.85, MAT.maple(), false);
  wing.position.y = -0.05;
  A.add(wing, ring(rA * 1.06, 0.006, MAT.nickel(), 0.7), ring(rA * 1.06, 0.006, MAT.nickel(), -0.25));
  const long = cone(2.1, rB, rB * 1.05, MAT.maple(), false);
  long.position.y = 0.25;
  B.add(long, ring(rB * 1.05, 0.006, MAT.nickel(), 0.65), ring(rB * 1.05, 0.006, MAT.nickel(), -0.25));
  // Bell joint with its pale ring at the top.
  const bellRing = cone(0.06, rB * 1.15, rB * 1.15, MAT.pearl(), false);
  bellRing.position.y = 1.32;
  B.add(bellRing, ring(rB * 1.12, 0.007, MAT.nickel(), 1.29));
  // Boot joint: metal U-tube cap at the bottom.
  // Boot joint: an oval wooden block holding both bores, with a metal cap underneath.
  const boot = cone(0.2, 0.085, 0.085, MAT.maple(), false);
  boot.scale.set(1.5, 1, 0.9);
  boot.position.set(0.065, -0.78, -0.015);
  const bootCap = cone(0.025, 0.088, 0.088, MAT.nickel());
  bootCap.scale.set(1.5, 1, 0.9);
  bootCap.position.set(0.065, -0.88, -0.015);
  g.add(ring(0.087, 0.004, MAT.nickel(), -0.68));
  g.children.at(-1).scale.set(1.5, 0.9, 1);
  g.children.at(-1).position.x = 0.065;
  g.add(boot, bootCap);
  // Bocal curving from the wing joint to the reed, with the whisper key pad.
  g.add(taperedTube([[0, 0.7, 0], [0, 0.85, 0], [-0.02, 0.98, -0.06], [-0.06, 1.03, -0.26]], 0.012, 0.005, MAT.silver()));
  const reed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.006), MAT.reed());
  reed.position.set(-0.065, 1.04, -0.3);
  reed.rotation.x = -Math.PI / 2.3;
  g.add(reed);
  // Hand rest (crutch) on the boot.
  const crutch = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.06, 6, 12), MAT.ebonite());
  crutch.position.set(-0.07, -0.45, -0.02);
  crutch.rotation.z = Math.PI / 2;
  g.add(crutch);

  keysOn(A, [
    { id: 'whisper', y: 0.5, angle: 95, kind: 'lever', size: 0.016 },
    { id: 'L1', y: 0.38, size: 0.018 },
    { id: 'L2', y: 0.26, size: 0.018 },
    { id: 'L3', y: 0.14, size: 0.018 },
    { id: 'LP_Eb', y: 0.04, angle: -50, kind: 'lever', size: 0.013 },
    { id: 'LP_Cs', y: -0.04, angle: -50, kind: 'lever', size: 0.013 },
    { id: 'RT_Bb', y: -0.22, angle: -95, kind: 'small', size: 0.014 },
    { id: 'RT_E', y: -0.3, angle: -95, kind: 'small', size: 0.016 },
    { id: 'RT_Fs', y: -0.38, angle: -95, kind: 'small', size: 0.014 },
    { id: 'R1', y: -0.3, size: 0.018 },
    { id: 'R2', y: -0.42, size: 0.018 },
    { id: 'R3', y: -0.54, size: 0.018 },
    { id: 'RP_F', y: -0.65, angle: 45, kind: 'lever', size: 0.013 },
    { id: 'RP_Gs', y: -0.72, angle: 45, kind: 'lever', size: 0.013 },
  ], () => rA, mats);
  keysOn(B, [
    { id: 'LT_Bb', y: 0.72, angle: 60, kind: 'lever', size: 0.015 },
    { id: 'LT_B', y: 0.64, angle: 60, kind: 'lever', size: 0.015 },
    { id: 'LT_C', y: 0.56, angle: 60, kind: 'lever', size: 0.015 },
    { id: 'LT_D', y: 0.48, angle: 60, kind: 'lever', size: 0.015 },
    { id: 'LT_Cs', y: 0.4, angle: 60, kind: 'small', size: 0.013 },
    { id: 'LT_A', y: 0.32, angle: 60, kind: 'small', size: 0.012 },
  ], () => rB, mats);
  // Long rods carrying the thumb keys up to the low pads on the long joint and bell.
  rod(B, 40, 0.35, 1.2, () => rB, mats.metal, 0.014);
  rod(B, 70, 0.4, 1.1, () => rB, mats.metal, 0.012);
  rod(A, -40, -0.7, 0.1, () => rA, mats.metal);
  rod(A, 50, -0.75, -0.2, () => rA, mats.metal);
  extraCups(B, [[1.15, 30, 0.022], [1.0, 35, 0.022], [0.85, 40, 0.02]], () => rB, mats);
  extraCups(A, [[-0.12, -30, 0.016], [-0.62, 30, 0.018]], () => rA, mats);
  return g;
}

// ---------------------------------------------------------------- Saxophones

const NECK_SWING = 45 * DEG;

function sax({ lowA = false, neckLoop = false }) {
  const g = new THREE.Group();
  const mats = { metal: MAT.brass(), touch: MAT.brass(), pearl: MAT.pearl() };
  const top = 0.7;
  const bottom = -0.7;
  const rTop = 0.042;
  const rBottom = 0.1;
  const radiusAt = (y) => rTop + ((top - y) / (top - bottom)) * (rBottom - rTop);

  g.add(cone(top - bottom, rBottom, rTop, MAT.brass(), false));
  g.add(ring(rTop * 1.12, 0.007, MAT.brass(), top - 0.01));
  // Bow at the bottom (with guard) and the upturned bell.
  const bellX = 0.3;
  g.add(crook([0, bottom, 0], [bellX, bottom + 0.05, 0], [0, -1, 0], 0.22, rBottom, MAT.brass(), rBottom * 1.08));
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.006, 8, 30, Math.PI), MAT.brass());
  guard.position.set(bellX / 2, bottom - 0.02, 0);
  guard.rotation.z = Math.PI;
  g.add(guard);
  const b = bell(0.62, rBottom * 1.08, 0.24, MAT.brass(), 3);
  b.position.set(bellX, bottom + 0.05, 0);
  g.add(b);
  // Low B / B♭ key cups on the bell, and a brace between bell and body.
  for (const [y, a] of [[0.12, 200], [0.24, 210]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.02, 32), MAT.brass());
    const dir = outward(a);
    const rr = 0.11 + y * 0.12;
    cup.position.set(bellX + dir.x * rr, bottom + 0.05 + y, dir.z * rr);
    cup.quaternion.setFromUnitVectors(UP, dir);
    g.add(cup);
  }
  const brace = cone(0.12, 0.008, 0.008, MAT.brass(), false);
  brace.rotation.z = Math.PI / 2;
  brace.position.set(bellX / 2 + 0.03, -0.25, 0);
  g.add(brace);
  // Thumb rest and strap ring on the back.
  const rest = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.025), MAT.brass());
  orientOn(rest, 180, radiusAt(-0.1), -0.1, 0.012);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 20), MAT.brass());
  orientOn(strap, 180, radiusAt(0.32), 0.32, 0.015);
  g.add(rest, strap);

  // Neck with octave key ring, cork and mouthpiece.
  // The neck is drawn bending away from the bell side (-X), then swung 45° around the body
  // toward the player (-Z), so it points diagonally back and to the left.
  const neckPts = (neckLoop ? bariNeck(top)
    : [[0, top, 0], [0, top + 0.08, 0], [-0.08, top + 0.2, 0], [-0.21, top + 0.25, 0], [-0.34, top + 0.23, 0]])
    .map((p) => new THREE.Vector3(...p).applyAxisAngle(UP, -NECK_SWING));
  const neck = taperedTube(neckPts, rTop * 0.95, rTop * 0.45, MAT.brass(), { segments: neckLoop ? 160 : 64 });
  g.add(neck);
  const neckCurve = neck.userData.curve;
  const octRing = new THREE.Mesh(new THREE.TorusGeometry(rTop * 0.75, 0.004, 8, 24), MAT.brass());
  octRing.position.copy(neckCurve.getPointAt(0.25));
  octRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), neckCurve.getTangentAt(0.25));
  g.add(octRing);
  const end = neckCurve.getPointAt(1);
  const dir = neckCurve.getTangentAt(1);
  const mp = singleReedMouthpiece(rTop * 0.55, 0.13);
  mp.position.copy(end);
  // Aim along the neck and roll so the reed (local -Z) faces down.
  const zAxis = UP.clone().addScaledVector(dir, -UP.dot(dir)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(dir, zAxis);
  mp.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, dir, zAxis));
  g.add(mp);

  const keys = [
    { id: 'octave', y: 0.5, angle: 150, kind: 'small', size: 0.017 },
    { id: 'palmF', y: 0.66, angle: -70, kind: 'lever', size: 0.016 },
    { id: 'palmEb', y: 0.6, angle: -78, kind: 'lever', size: 0.016 },
    { id: 'palmD', y: 0.54, angle: -86, kind: 'lever', size: 0.016 },
    { id: 'frontF', y: 0.56, angle: 0, kind: 'small', size: 0.012 },
    { id: 'L1', y: 0.47, kind: 'pearl', size: 0.017 },
    { id: 'bis', y: 0.41, kind: 'small', size: 0.008 },
    { id: 'L2', y: 0.35, kind: 'pearl', size: 0.018 },
    { id: 'L3', y: 0.23, kind: 'pearl', size: 0.019 },
    { id: 'LP_Gs', y: 0.12, angle: -45, kind: 'lever', size: 0.016 },
    { id: 'LP_Cs', y: 0.05, angle: -45, kind: 'lever', size: 0.016 },
    { id: 'LP_B', y: -0.02, angle: -45, kind: 'lever', size: 0.016 },
    { id: 'LP_Bb', y: -0.09, angle: -45, kind: 'lever', size: 0.016 },
    { id: 'highFs', y: 0.17, angle: 70, kind: 'lever', size: 0.013 },
    { id: 'sideE', y: 0.08, angle: 70, kind: 'lever', size: 0.014 },
    { id: 'sideC', y: 0.0, angle: 70, kind: 'lever', size: 0.014 },
    { id: 'sideBb', y: -0.08, angle: 70, kind: 'lever', size: 0.014 },
    { id: 'R1', y: -0.14, kind: 'pearl', size: 0.021 },
    { id: 'R2', y: -0.26, kind: 'pearl', size: 0.022 },
    { id: 'R3', y: -0.38, kind: 'pearl', size: 0.023 },
    { id: 'RP_Eb', y: -0.48, angle: 40, kind: 'lever', size: 0.016 },
    { id: 'RP_C', y: -0.56, angle: 40, kind: 'lever', size: 0.016 },
  ];
  if (lowA) keys.push({ id: 'lowA', y: 0.4, angle: 150, kind: 'small', size: 0.016 });
  keysOn(g, keys, radiusAt, mats);
  // Rods and the big closed pad cups along the far side of the body.
  rod(g, -35, -0.6, 0.62, radiusAt, MAT.brass(), 0.016);
  rod(g, 35, -0.62, 0.3, radiusAt, MAT.brass(), 0.016);
  rod(g, -70, 0.1, 0.6, radiusAt, MAT.brass(), 0.014);
  extraCups(g, [[0.6, -40, 0.02], [0.4, 45, 0.022], [0.16, 40, 0.026], [-0.03, -35, 0.03], [-0.2, 40, 0.032],
    [-0.32, -35, 0.034], [-0.5, 25, 0.04], [-0.6, -30, 0.042]], radiusAt, mats, 'plate');
  return g;
}

/**
 * Bari sax "pigtail": the tube rises off the body, makes one full loop in the bell's plane
 * (curling over away from the bell (-X), down, back underneath and up again), then the neck
 * runs on toward -X. The loop drifts forward (+Z) so the tube clears itself where it crosses.
 */
function bariNeck(top) {
  const R = 0.085;
  const cy = top + 0.12;
  const cx = -R;
  const turns = 1.25; // one loop plus the quarter turn that points the neck along -X
  const pts = [[0, top, 0]];
  for (let i = 0; i <= 30; i++) {
    const t = i / 30;
    const a = t * turns * Math.PI * 2;
    pts.push([cx + R * Math.cos(a), cy + R * Math.sin(a), t * 0.1]);
  }
  pts.push([cx - 0.14, cy + R - 0.01, 0.1], [cx - 0.3, cy + R - 0.04, 0.1]);
  return pts;
}

export const altoSax = () => sax({});
export const tenorSax = () => scaled(sax({}), 1.2);
export const bariSax = () => scaled(sax({ lowA: true, neckLoop: true }), 1.4);

function scaled(obj, s) {
  obj.scale.setScalar(s);
  return wrap(obj);
}

/** Wrap in a parent so transforms on the inner group survive camera fitting / resets. */
function wrap(obj) {
  const outer = new THREE.Group();
  outer.add(obj);
  return outer;
}
