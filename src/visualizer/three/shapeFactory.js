import * as THREE from 'three';
import { SHAPE_PRESETS } from '../shapePresets.js';

const UNIT = 0.01;

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
    case 'ellipsoid':
      return new THREE.SphereGeometry(Math.max(sx, sy, sz), 32, 24);
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
    case 'torus':
      return new THREE.TorusGeometry(Math.max(sx, sz), Math.max(ry, 0.15), 20, 36);
    default:
      return new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2);
  }
}

/** @param {THREE.Color} color */
export function cinematicMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color,
    metalness: 0.58,
    roughness: 0.28,
    emissive: color.clone().multiplyScalar(0.12),
    envMapIntensity: 0.85,
  });
}

export { UNIT };
