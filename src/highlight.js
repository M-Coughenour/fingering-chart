// Shows a fingering on a model: pressed parts glow and sink in; the trombone slide moves.
import * as THREE from 'three';
import { SLIDE_STEP } from './models/brass.js';

const PRESSED = new THREE.MeshStandardMaterial({
  color: 0x29b6f6, emissive: 0x0288d1, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.35,
  side: THREE.DoubleSide,
});
const HALF = new THREE.MeshStandardMaterial({
  color: 0xffb74d, emissive: 0xf57c00, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.35,
  side: THREE.DoubleSide,
});

export class Fingering {
  constructor(root) {
    this.parts = new Map();
    root.traverse((o) => {
      if (!o.userData.pressable) return;
      this.parts.set(o.name, o);
      o.userData.rest ??= o.position.clone();
      o.userData.target ??= o.position.clone();
    });
  }

  /** @param keys key ids (optionally with ':half'); @param slide trombone position 1–7 */
  show(keys = [], slide) {
    const pressed = new Map(keys.map((k) => {
      const [id, mode] = k.split(':');
      return [id, mode === 'half' ? HALF : PRESSED];
    }));
    for (const [name, part] of this.parts) {
      const { rest, pressDir = [0, -1, 0], travel = 0.02 } = part.userData;
      const dir = new THREE.Vector3(...pressDir);
      if (name === 'slide') {
        const step = part.userData.positionStep ?? SLIDE_STEP;
        part.userData.target = rest.clone().addScaledVector(dir, ((slide ?? 1) - 1) * step);
        part.traverse((m) => {
          if (!m.userData.slideTip) return;
          m.userData.original ??= m.material;
          m.material = slide ? PRESSED : m.userData.original;
        });
        continue;
      }
      const mat = pressed.get(name);
      part.userData.target = mat ? rest.clone().addScaledVector(dir, travel) : rest.clone();
      // Small keys are easy to miss, so pressed parts also grow a little.
      part.userData.targetScale = mat ? 1.3 : 1;
      part.traverse((m) => {
        if (!m.isMesh) return;
        m.userData.original ??= m.material;
        m.material = mat ?? m.userData.original;
      });
    }
  }

  /** Called every frame: ease parts toward their targets and pulse the glow. */
  update(dt, time) {
    const k = 1 - Math.exp(-dt * 14);
    for (const part of this.parts.values()) {
      part.position.lerp(part.userData.target, k);
      const s = part.scale.x + ((part.userData.targetScale ?? 1) - part.scale.x) * k;
      part.scale.setScalar(s);
    }
    const pulse = 0.55 + 0.35 * Math.sin(time * 4);
    PRESSED.emissiveIntensity = pulse;
    HALF.emissiveIntensity = pulse;
  }

  missing(keys) {
    return keys.map((k) => k.split(':')[0]).filter((id) => !this.parts.has(id));
  }
}
