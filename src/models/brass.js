// Procedural brass models, built to roughly real proportions.
// Valve buttons are named valve1..valve4, the horn's and F-attachment trombone's thumb lever
// is 'trigger', and the trombone's moving slide is 'slide' (with userData.positionStep).
import * as THREE from 'three';
import { MAT, taperedTube, tube, cone, bell, crook, ring, ferruleOn, pressable, textSprite } from './parts.js';

/** Mouthpiece along +Y: shank at y=0, rim at y=len. */
function mouthpiece(len, rimR, material = MAT.silver()) {
  const pts = [
    [rimR * 0.3, 0], [rimR * 0.34, len * 0.5], [rimR * 0.42, len * 0.72], [rimR * 0.62, len * 0.86],
    [rimR * 0.9, len * 0.95], [rimR, len], [rimR * 0.8, len * 1.0], [rimR * 0.3, len * 0.9],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const mat = material.clone();
  mat.side = THREE.DoubleSide;
  return new THREE.Mesh(new THREE.LatheGeometry(pts, 40), mat);
}

/** Point an object built along +Y so it starts at `from` and runs toward `to`. */
function aim(obj, from, to) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  obj.position.copy(a);
  obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
  return obj;
}

/** Thin brace rod between two points. */
function brace(a, b, r = 0.004) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const m = cone(from.distanceTo(to), r, r, MAT.brass(), false);
  m.position.copy(from).lerp(to, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
  return m;
}

/** A piston valve: casing with caps, stem and pearl finger button. The button is pressable. */
function pistonValve(name, { r = 0.03, h = 0.2, travel = 0.04 } = {}) {
  const g = new THREE.Group();
  g.add(cone(h, r, r, MAT.brass(), false));
  for (const end of [1, -1]) {
    const y = end * (h / 2 + r * 0.2);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.12, r * 1.12, r * 0.45, 32), MAT.brass());
    cap.position.y = y;
    // Knurled grip rings on the caps.
    g.add(cap, ring(r * 1.12, r * 0.06, MAT.brass(), y + r * 0.16), ring(r * 1.12, r * 0.06, MAT.brass(), y - r * 0.16));
  }
  // Ferrules where the tubing joins the casing.
  g.add(ring(r * 1.03, r * 0.05, MAT.brass(), h * 0.18), ring(r * 1.03, r * 0.05, MAT.brass(), -h * 0.22));

  const button = new THREE.Group();
  const stemLen = r * 2.4;
  const stem = cone(stemLen, r * 0.17, r * 0.17, MAT.nickel(), false);
  stem.position.y = stemLen / 2;
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.85, r * 0.42, 32), MAT.brass());
  cup.position.y = stemLen + r * 0.2;
  const pearl = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, r * 0.12, 32), MAT.pearl());
  pearl.position.y = stemLen + r * 0.44;
  button.add(stem, cup, pearl);
  button.position.y = h / 2 + r * 0.42;
  pressable(button, name, [0, -1, 0], travel);
  g.add(button);
  return g;
}

/** Rotary valve (horn): drum, domed cap and a finger spatula that is pressable. */
function rotaryValve(name, leverLen = 0.16) {
  const g = new THREE.Group();
  const drum = cone(0.07, 0.042, 0.042, MAT.brass(), false);
  drum.rotation.x = Math.PI / 2;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.044, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6), MAT.brass());
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.035;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.004, 8, 32), MAT.brass());
  band.position.z = 0.02;
  g.add(drum, cap, band);
  const lever = new THREE.Group();
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.01, leverLen, 0.008), MAT.brass());
  arm.position.y = leverLen / 2;
  const spatula = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 24), MAT.brass());
  spatula.rotation.x = Math.PI / 2;
  spatula.position.set(0, leverLen, 0.006);
  const pearl = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 24), MAT.pearl());
  pearl.rotation.x = Math.PI / 2;
  pearl.position.set(0, leverLen, 0.012);
  lever.add(arm, spatula, pearl);
  lever.position.z = 0.055;
  pressable(lever, name, [0, 0, -1], 0.025);
  g.add(lever);
  return g;
}

// ---------------------------------------------------------------- Trumpet & mellophone

function trumpetLike({ scale = 1, bellR = 0.15, bellLen = 0.5, bore = 0.0146 }) {
  const g = new THREE.Group();
  const m = MAT.brass();
  [-0.068, 0, 0.068].forEach((x, i) => {
    const v = pistonValve(`valve${i + 1}`, { r: 0.03, h: 0.2 });
    v.position.set(x, 0, 0);
    g.add(v);
  });

  // Mouthpiece + leadpipe (far side of the valves), widening to the main tuning slide.
  const mp = mouthpiece(0.2, 0.04);
  aim(mp, [-0.5, -0.02, -0.05], [-0.7, -0.02, -0.05]);
  g.add(mp);
  const lead = taperedTube([[-0.5, -0.02, -0.05], [-0.2, -0.02, -0.05], [0.1, -0.02, -0.05], [0.32, -0.02, -0.05]], bore * 0.7, bore, m);
  g.add(lead, ferruleOn(lead, 0.0, bore * 1.25, 0.05, m), ferruleOn(lead, 0.97, bore * 1.25, 0.03, m));
  // Main tuning slide at the front, with water key.
  g.add(crook([0.32, -0.02, -0.05], [0.32, -0.12, -0.05], [1, 0, 0], 0.07, bore, m));
  const waterKey = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.006, 0.012), MAT.nickel());
  waterKey.position.set(0.36, -0.135, -0.05);
  g.add(waterKey);
  g.add(tube([[0.32, -0.12, -0.05], [0.2, -0.12, -0.04], [0.1, -0.09, -0.02], [0.068, -0.07, 0]], bore, m));

  // Valve slides: 1st toward the player (thumb saddle), 2nd short, 3rd toward the bell (finger ring).
  g.add(crook([-0.068, -0.045, 0.012], [-0.068, -0.085, 0.012], [-1, 0, 0], 0.15, bore * 0.9, m));
  const saddle = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.003, 8, 20, Math.PI), m);
  saddle.position.set(-0.2, -0.065, 0.026);
  saddle.rotation.z = Math.PI / 2;
  g.add(saddle);
  g.add(crook([-0.012, -0.11, 0.022], [0.012, -0.11, 0.022], [0, -1, 0], 0.045, bore * 0.9, m));
  g.add(crook([0.068, -0.045, 0.012], [0.068, -0.085, 0.012], [1, 0, 0], 0.17, bore * 0.9, m));
  const fingerRing = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.003, 8, 24), m);
  fingerRing.position.set(0.2, -0.1, 0.012);
  g.add(fingerRing);

  // Bell section: out of valve 1, back to the rear bow, then forward over the top to the bell.
  g.add(tube([[-0.068, 0.04, -0.02], [-0.2, 0.04, -0.03], [-0.36, 0.04, -0.04]], bore * 1.05, m));
  g.add(crook([-0.36, 0.04, -0.04], [-0.36, 0.115, -0.05], [-1, 0, 0], 0.05, bore * 1.05, m, bore * 1.1));
  const bellPipe = taperedTube([[-0.36, 0.115, -0.05], [-0.1, 0.115, -0.05], [0.15, 0.115, -0.05]], bore * 1.1, bore * 1.5, m);
  g.add(bellPipe, ferruleOn(bellPipe, 0.05, bore * 1.4, 0.03, m));
  const b = bell(bellLen, bore * 1.5, bellR, m, 4);
  b.rotation.z = -Math.PI / 2;
  b.position.set(0.15, 0.115, -0.05);
  g.add(b);
  // Braces tying the bell pipe to the leadpipe and the casings.
  g.add(brace([0.24, 0.1, -0.05], [0.24, -0.005, -0.05]), brace([-0.3, 0.1, -0.05], [-0.3, 0.0, -0.05]));
  g.add(brace([0.03, 0.1, -0.05], [0.03, 0.08, -0.02]));
  // Finger hook on the leadpipe.
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 20, Math.PI), m);
  hook.position.set(-0.12, 0.0, -0.05);
  g.add(hook);
  g.scale.setScalar(scale * 1.6);
  const outer = new THREE.Group();
  outer.add(g);
  return outer;
}

export const trumpet = () => trumpetLike({});
export const mellophone = () => trumpetLike({ scale: 1.12, bellR: 0.2, bellLen: 0.48, bore: 0.017 });

// ---------------------------------------------------------------- French horn

export function frenchHorn() {
  const g = new THREE.Group();
  const m = MAT.brass();
  // Main wrap: a slowly widening spiral (about 2½ turns) seen side on.
  const pts = [];
  const turns = 2.4;
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = Math.PI * 0.6 + t * turns * Math.PI * 2;
    const r = 0.2 + t * 0.09;
    pts.push([Math.cos(a) * r, Math.sin(a) * r, (t - 0.5) * 0.08]);
  }
  g.add(taperedTube(pts, 0.012, 0.032, m, { segments: 240 }));
  // Bell flaring out to the player's right, below.
  const b = bell(0.55, 0.032, 0.28, m, 4.5);
  b.position.set(...pts.at(-1));
  b.rotation.z = -Math.PI * 0.62;
  g.add(b);
  // Leadpipe & mouthpiece up to the left.
  const lead = taperedTube([[-0.08, 0.06, 0.07], [-0.3, 0.24, 0.07], [-0.5, 0.36, 0.07]], 0.014, 0.008, m);
  g.add(lead, ferruleOn(lead, 0.95, 0.012, 0.03, m));
  const mp = mouthpiece(0.16, 0.03);
  aim(mp, [-0.5, 0.36, 0.07], [-0.66, 0.46, 0.07]);
  g.add(mp);
  // Tuning slides poking out of the wrap.
  for (const [x, y, d] of [[0.06, 0.24, [0, 1, 0]], [0.16, 0.16, [1, 1, 0]], [0.02, -0.26, [0, -1, 0]], [-0.22, -0.1, [-1, 0, 0]]]) {
    const n = Math.hypot(...d);
    g.add(crook([x - 0.012, y, 0.05], [x + 0.012, y, 0.05], d.map((v) => v / n), 0.07, 0.009, m));
  }
  // Rotary valves in the centre with left-hand levers, plus the thumb trigger (change valve).
  [0.08, -0.01, -0.1].forEach((y, i) => {
    const v = rotaryValve(`valve${i + 1}`);
    v.position.set(-0.03, y, 0.05);
    g.add(v);
  });
  const trig = rotaryValve('trigger', 0.12);
  trig.position.set(-0.13, 0.0, 0.05);
  trig.rotation.z = Math.PI / 2;
  g.add(trig);
  // Leather hand guard on the wrap.
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.024, 10, 30, Math.PI / 5), MAT.pad());
  guard.rotation.z = -Math.PI / 2.2;
  g.add(guard);
  return g;
}

// ---------------------------------------------------------------- Upright brass

/** Baritone / euphonium / tuba: conical body down to the bow and up to the bell; pistons in front. */
function upright({ height, bellR, bodyR, valves, scale = 1, sideFourth = false }) {
  const g = new THREE.Group();
  const m = MAT.brass();
  const bottom = -height / 2 + 0.12;
  const bellStart = height * 0.12;
  // Main conical bore: from the valve block down, round the bottom bow, up to the bell.
  const body = taperedTube([
    [-0.2, -0.05, 0.02], [-0.22, bottom + 0.1, 0.0], [-0.17, bottom - 0.06, 0], [0.0, bottom - 0.1, 0],
    [0.12, bottom - 0.02, 0], [0.15, bottom + 0.15, 0], [0.15, bellStart, 0],
  ], bodyR * 0.45, bodyR * 1.5, m, { segments: 96 });
  g.add(body, ferruleOn(body, 0.62, bodyR * 1.35, 0.05, m));
  // Bow guard at the bottom.
  const guard = new THREE.Mesh(new THREE.TorusGeometry(bodyR * 1.15, bodyR * 0.12, 8, 30, Math.PI), m);
  guard.position.set(-0.01, bottom - 0.1, 0);
  guard.rotation.z = Math.PI;
  g.add(guard);
  // Upright bells open gradually (wide conical bore), unlike a trumpet's late flare.
  const b = bell(height * 0.5, bodyR * 1.5, bellR, m, 2.4);
  b.position.set(0.15, bellStart, 0);
  g.add(b);
  // Main tuning slide sticking out the back.
  g.add(crook([-0.25, 0.12, -0.02], [-0.25, 0.05, -0.02], [-1, 0, 0], 0.12, bodyR * 0.45, m));
  // Pistons in front, with their slides looping behind.
  const count = sideFourth ? 3 : valves;
  const back = [0, -0.37, -0.93];
  for (let i = 0; i < count; i++) {
    const x = -0.36 + i * 0.1;
    const v = pistonValve(`valve${i + 1}`, { r: 0.038, h: 0.28, travel: 0.05 });
    v.position.set(x, 0.0, 0.12);
    g.add(v, crook([x - 0.012, -0.08, 0.08], [x + 0.012, -0.08, 0.08], back, 0.09 + i * 0.03, bodyR * 0.35, m));
  }
  g.add(tube([[-0.36, 0.06, 0.08], [-0.28, 0.07, 0.05], [-0.2, 0.0, 0.02]], bodyR * 0.4, m));
  if (sideFourth) {
    const v4 = pistonValve('valve4', { r: 0.038, h: 0.28, travel: 0.05 });
    v4.position.set(0.15 + bodyR * 2.1, -0.18, 0.06);
    g.add(v4, brace([0.15 + bodyR * 2.1, -0.18, 0.02], [0.15, -0.18, 0]));
  }
  // Leadpipe & mouthpiece toward the player at the top.
  const lead = taperedTube([[-0.38, 0.12, 0.05], [-0.46, 0.3, 0.1], [-0.5, 0.42, 0.22]], bodyR * 0.4, 0.012, m);
  g.add(lead, ferruleOn(lead, 0.97, 0.016, 0.03, m));
  const mp = mouthpiece(0.16, 0.042);
  aim(mp, [-0.5, 0.42, 0.22], [-0.53, 0.48, 0.38]);
  g.add(mp);
  g.add(brace([-0.2, 0.05, 0.02], [0.13, 0.05, 0]), brace([-0.12, -0.3, 0], [0.14, -0.3, 0]));
  g.scale.setScalar(scale);
  const outer = new THREE.Group();
  outer.add(g);
  return outer;
}

export const baritone = () => upright({ height: 1.15, bellR: 0.2, bodyR: 0.05, valves: 3 });
export const euphonium = () => upright({ height: 1.2, bellR: 0.26, bodyR: 0.065, valves: 4, sideFourth: true });
export const tuba = () => upright({ height: 1.55, bellR: 0.42, bodyR: 0.12, valves: 4, scale: 1.1 });

// ---------------------------------------------------------------- Sousaphone

export function sousaphone() {
  const g = new THREE.Group();
  const m = MAT.brass();
  // The big wrap: a tilted spiral that sits around the player's body.
  const pts = [];
  // It starts at the front by the valves and winds round once before rising to the neck.
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    const a = Math.PI * 0.5 + t * Math.PI * 2.1;
    pts.push([Math.cos(a) * 0.55, -0.25 + t * 0.5 + Math.sin(a) * 0.1, Math.sin(a) * 0.48]);
  }
  // Gooseneck over the shoulder to the forward-facing bell.
  const [ex, ey, ez] = pts.at(-1);
  pts.push([ex - 0.05, ey + 0.3, ez - 0.05], [ex - 0.25, ey + 0.48, ez - 0.1], [ex - 0.5, ey + 0.5, ez - 0.05]);
  g.add(taperedTube(pts, 0.045, 0.11, m, { segments: 200 }));
  const b = bell(0.7, 0.1, 0.6, m, 3);
  b.rotation.x = Math.PI / 2;
  b.position.set(...pts.at(-1));
  g.add(b);
  // Upright valves at the front.
  for (let i = 0; i < 3; i++) {
    const v = pistonValve(`valve${i + 1}`, { r: 0.04, h: 0.3, travel: 0.05 });
    v.position.set(-0.18 + i * 0.11, -0.3, 0.62);
    g.add(v, crook([-0.19 + i * 0.11, -0.47, 0.6], [-0.17 + i * 0.11, -0.47, 0.6], [0, -0.6, -0.8], 0.12 + i * 0.03, 0.016, m));
  }
  // Valve block into the start of the wrap, braced to it.
  g.add(tube([[0.04, -0.4, 0.6], [0.04, -0.3, 0.56], [pts[0][0], pts[0][1], pts[0][2]]], 0.03, m));
  g.add(brace([-0.07, -0.2, 0.6], [-0.07, -0.16, 0.47], 0.006));
  g.add(tube([[-0.24, -0.1, 0.6], [-0.35, 0.12, 0.7], [-0.4, 0.3, 0.86]], 0.014, m));
  const mp = mouthpiece(0.16, 0.045);
  aim(mp, [-0.4, 0.3, 0.86], [-0.42, 0.38, 1.0]);
  g.add(mp);
  return g;
}

// ---------------------------------------------------------------- Trombone

export const SLIDE_STEP = 0.11; // distance between slide positions in model units

export const trombone = () => tromboneBase({});
export const tromboneF = () => tromboneBase({ trigger: true });

/** Tenor trombone; `trigger` adds the F attachment (rotary valve, thumb lever and extra loop). */
function tromboneBase({ trigger = false }) {
  const g = new THREE.Group();
  const m = MAT.brass();
  const r = 0.0135;
  // Inner slide tubes (fixed, nickel).
  const innerLen = 1.0;
  for (const z of [0, 0.12]) {
    const inner = cone(innerLen, r * 0.85, r * 0.85, MAT.nickel(), false);
    inner.rotation.z = Math.PI / 2;
    inner.position.set(-innerLen / 2 + 0.05, 0, z);
    g.add(inner);
  }
  // Slide cross brace (left-hand grip) and slide lock.
  g.add(brace([0.03, 0, 0], [0.03, 0, 0.12], 0.007));
  const lock = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 8, 20), m);
  lock.position.set(0.05, 0, 0.12);
  lock.rotation.y = Math.PI / 2;
  g.add(lock);
  // Bell section: over the shoulder (tuning slide behind), forward to the bell.
  g.add(tube([[0.05, 0, 0.12], [0.3, 0, 0.12], [0.5, 0.06, 0.12]], r, m));
  g.add(crook([0.5, 0.06, 0.12], [0.5, 0.27, 0.12], [1, 0, 0], 0.16, r, m, r * 1.1));
  const bellPipe = taperedTube([[0.5, 0.27, 0.12], [0.1, 0.27, 0.12], [-0.25, 0.27, 0.12]], r * 1.1, r * 1.6, m);
  g.add(bellPipe, ferruleOn(bellPipe, 0.02, r * 1.5, 0.03, m));
  const b = bell(0.6, r * 1.6, 0.22, m, 4.2);
  b.rotation.z = Math.PI / 2;
  b.position.set(-0.25, 0.27, 0.12);
  g.add(b);
  g.add(brace([0.15, 0.25, 0.12], [0.15, 0.015, 0.12], 0.006));
  if (trigger) {
    // F attachment: rotary valve inline after the slide receiver, its extra loop coiled
    // inside the bell section, and the thumb lever reaching forward to the left-hand grip.
    const valve = rotaryValve('trigger', 0.12);
    valve.position.set(0.22, 0, 0.12);
    valve.rotation.z = Math.PI / 2;
    g.add(valve);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.085, r, 12, 48), m);
    loop.position.set(0.36, 0.135, 0.17);
    g.add(loop, tube([[0.22, 0, 0.16], [0.3, 0.03, 0.17], [0.36, 0.05, 0.17]], r, m));
  } else {
    g.add(brace([0.35, 0.25, 0.12], [0.35, 0.015, 0.12], 0.005));
    // Counterweight near the tuning slide.
    const weight = cone(0.07, 0.014, 0.014, m, false);
    weight.rotation.z = Math.PI / 2;
    weight.position.set(0.42, 0.27, 0.12);
    g.add(weight);
  }
  // Mouthpiece on the near inner tube.
  const mp = mouthpiece(0.18, 0.032);
  aim(mp, [0.08, 0, 0], [0.26, 0, 0]);
  g.add(mp);

  // Moving outer slide.
  const slide = new THREE.Group();
  for (const z of [0, 0.12]) {
    const outer = cone(0.95, r * 1.15, r * 1.15, m, false);
    outer.rotation.z = Math.PI / 2;
    outer.position.set(-0.5, 0, z);
    const f = cone(0.03, r * 1.35, r * 1.35, m, false);
    f.rotation.z = Math.PI / 2;
    f.position.set(-0.04, 0, z);
    slide.add(outer, f);
  }
  const tip = crook([-0.97, 0, 0], [-0.97, 0, 0.12], [-1, 0, 0], 0.07, r * 1.15, m);
  tip.userData.slideTip = true; // glows to show where the slide is
  slide.add(tip, brace([-0.12, 0, 0], [-0.12, 0, 0.12], 0.007));
  const bumper = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 10), MAT.dark());
  bumper.position.set(-1.045, 0, 0.06);
  slide.add(bumper);
  pressable(slide, 'slide', [-1, 0, 0], 0);
  slide.userData.positionStep = SLIDE_STEP;
  g.add(slide);

  // Position markers along the inner slide for reference.
  for (let p = 1; p <= 7; p++) {
    const label = textSprite(String(p), '#888', 0.07);
    label.position.set(-1.05 - (p - 1) * SLIDE_STEP, -0.09, 0.06);
    g.add(label);
  }
  return g;
}
