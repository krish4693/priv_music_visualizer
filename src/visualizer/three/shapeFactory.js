import * as THREE from 'three';
import { SHAPE_PRESETS } from '../shapePresets.js';

const UNIT = 0.01;

function buildEggGeometry(sx, sy, sz) {
  const points = [];
  const segments = 28;
  for (let i = 0; i <= segments; i++) {
    const phi = (i / segments) * Math.PI;
    const sinP = Math.sin(phi);
    const widthMul = 0.72 + 0.38 * Math.pow(sinP, 0.55);
    const r = Math.max(0.001, sx * sinP * widthMul);
    const y = sy * Math.cos(phi);
    points.push(new THREE.Vector2(r, y));
  }
  const geo = new THREE.LatheGeometry(points, 36);
  if (Math.abs(sz - sx) > 0.001) geo.scale(1, 1, sz / sx);
  return geo;
}

/** @param {string} typeId @param {number} [sizeMul] */
export function geometryForShapeType(typeId, sizeMul = 1) {
  const preset = SHAPE_PRESETS[typeId];
  if (!preset) return new THREE.BoxGeometry(1, 1, 1);

  const { kind, rx, ry, rz } = preset;
  const sx = rx * UNIT * sizeMul;
  const sy = ry * UNIT * sizeMul;
  const sz = rz * UNIT * sizeMul;

  switch (kind) {
    case 'box':
      return new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2, 2, 2, 2);
    case 'ellipsoid': {
      const geo = new THREE.SphereGeometry(1, 32, 24);
      geo.scale(sx, sy, sz);
      return geo;
    }
    case 'egg':
      return buildEggGeometry(sx, sy, sz);
    case 'pyramid':
      return new THREE.ConeGeometry(Math.max(sx, sz), sy * 2, 4);
    case 'octahedron':
      return new THREE.OctahedronGeometry(Math.max(sx, sy, sz));
    case 'cone':
      return new THREE.ConeGeometry(Math.max(sx, sz), sy * 2, 28);
    case 'cylinder':
      return new THREE.CylinderGeometry(Math.max(sx, sz), Math.max(sx, sz), sy * 2, 28);
    case 'prism':
      return new THREE.CylinderGeometry(Math.max(sx, sz), Math.max(sx, sz), sy * 2, 3);
    case 'tetrahedron':
      return new THREE.TetrahedronGeometry(Math.max(sx, sy, sz));
    case 'torus': {
      const major = Math.max(sx, sz);
      const tube = Math.min(Math.max(ry, major * 0.14), major * 0.44);
      return new THREE.TorusGeometry(major, tube, 28, 48);
    }
    default:
      return new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2);
  }
}

/** @param {THREE.Color} color @param {{ metalness?: number, roughness?: number, emissive?: number }} [opts] */
export function cinematicMaterial(color, opts = {}) {
  const metalness = (opts.metalness ?? 18) / 100;
  const roughness = (opts.roughness ?? 16) / 100;
  const emissiveAmt = (opts.emissive ?? 16) / 100;
  return new THREE.MeshStandardMaterial({
    color,
    metalness: metalness * 0.65,
    roughness,
    emissive: color.clone().multiplyScalar(emissiveAmt * 0.28),
    envMapIntensity: 0.35,
  });
}

/** @param {THREE.MeshStandardMaterial} mat @param {THREE.Color} color @param {{ metalness?: number, roughness?: number, emissive?: number }} opts */
export function updateCinematicMaterial(mat, color, opts = {}) {
  mat.color.copy(color);
  mat.metalness = ((opts.metalness ?? 18) / 100) * 0.65;
  mat.roughness = (opts.roughness ?? 16) / 100;
  mat.emissive.copy(color).multiplyScalar(((opts.emissive ?? 16) / 100) * 0.28);
}

export { UNIT };
