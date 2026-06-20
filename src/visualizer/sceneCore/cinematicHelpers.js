import * as THREE from 'three';
import { DEFAULT_BG } from '../backgroundStore.js';
import { resolvePalette } from '../popArtPalette.js';

export const UNIT = 0.0085;

export function screenToWorld(x, y, z, width, height) {
  return {
    x: (x / width - 0.5) * width * UNIT * 0.95,
    y: -(y / height - 0.5) * height * UNIT * 0.95,
    z: z * UNIT * 2.2,
  };
}

/** @param {{ r: number, g: number, b: number }[]} palette @param {number} idx @param {boolean} [snap=false] */
export function paletteColorThree(palette, idx, snap = false) {
  const colors = resolvePalette(palette);
  const n = colors.length;
  const i = ((Math.floor(idx) % n) + n) % n;
  if (snap) {
    const c = colors[i];
    return new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  }
  const j = (i + 1) % n;
  const blend = idx - Math.floor(idx);
  const a = colors[i];
  const b = colors[j];
  return new THREE.Color(
    (a.r + (b.r - a.r) * blend) / 255,
    (a.g + (b.g - a.g) * blend) / 255,
    (a.b + (b.b - a.b) * blend) / 255,
  );
}

export function applyEntityTransform(mesh, entity, width, height) {
  const w = screenToWorld(
    entity.x + (entity.wobbleX ?? 0),
    entity.y + (entity.wobbleY ?? 0),
    entity.z + (entity.wobbleZ ?? 0),
    width,
    height,
  );
  mesh.position.set(w.x, w.y, w.z);
  mesh.rotation.set(entity.rotX + (entity.tiltX ?? 0), entity.rotY, entity.rotZ + (entity.tiltZ ?? 0));
  const sc = entity.scale * (entity.surpriseScale ?? 1);
  mesh.scale.set(sc * (entity.squashX ?? 1), sc * (entity.squashY ?? 1), sc * (entity.squashZ ?? 1));
}

export function hexToThree(hex) {
  return new THREE.Color(hex || DEFAULT_BG);
}
