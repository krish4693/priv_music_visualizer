import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SHAPE_PRESETS } from '../shapePresets.js';

const UNIT = 0.01;

/** Matches the Pop Art corner scale so both renderers round by the same amount. */
const CORNER_SCALE = 0.55;
/** Keeps the corner radius below half the smallest side, so faces never self-intersect. */
const MAX_CORNER_RATIO = 0.48;

/** @param {{ roundedEdges?: boolean, cornerRound?: number }} [surface] */
function cornerRadiusFor(surface, w, h, d) {
  if (!surface?.roundedEdges) return 0;
  const amount = Math.min(1, Math.max(0, (surface.cornerRound ?? 45) / 100)) * CORNER_SCALE;
  if (amount <= 0) return 0;
  const smallestSide = Math.min(w, h, d);
  return Math.min(smallestSide * amount, smallestSide * MAX_CORNER_RATIO);
}

/** Fillet segments per 90° corner. Also sets the angle between adjacent fillet faces (90 / n). */
const CORNER_SEGMENTS = 4;

function buildBoxGeometry(w, h, d, surface) {
  const radius = cornerRadiusFor(surface, w, h, d);
  if (radius > 0) return new RoundedBoxGeometry(w, h, d, CORNER_SEGMENTS, radius);
  return new THREE.BoxGeometry(w, h, d, 2, 2, 2);
}

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

/**
 * @param {string} typeId
 * @param {number} [sizeMul]
 * @param {{ roundedEdges?: boolean, cornerRound?: number }} [surface]
 */
export function geometryForShapeType(typeId, sizeMul = 1, surface = null) {
  const preset = SHAPE_PRESETS[typeId];
  if (!preset) return new THREE.BoxGeometry(1, 1, 1);

  const { kind, rx, ry, rz } = preset;
  const sx = rx * UNIT * sizeMul;
  const sy = ry * UNIT * sizeMul;
  const sz = rz * UNIT * sizeMul;

  switch (kind) {
    case 'box':
      return buildBoxGeometry(sx * 2, sy * 2, sz * 2, surface);
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
      // Matches Pop Art: rounding off facets the cone down to a 4-sided pyramid.
      return new THREE.ConeGeometry(Math.max(sx, sz), sy * 2, surface?.roundedEdges === false ? 4 : 28);
    case 'cylinder':
      // Matches Pop Art: rounding off squares the cylinder off into a box.
      if (surface?.roundedEdges === false) return new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2);
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

/** Angle below which coplanar-ish faces are not outlined — keeps curved shapes from turning into wireframes. */
const EDGE_THRESHOLD_DEG = 24;
const EDGE_COLOR = 0x0b0b12;

/**
 * Geometry to derive Kanten line segments from — usually the render geometry itself.
 *
 * A rounded box is the exception: its fillets step by 90/CORNER_SEGMENTS degrees, which is
 * under EDGE_THRESHOLD_DEG, so EdgesGeometry finds no edges at all on it. Substituting a sharp
 * box inset to the fillet crest puts the twelve lines back where the rounded edge actually bulges.
 *
 * @param {string} typeId
 * @param {number} [sizeMul]
 * @param {{ roundedEdges?: boolean, cornerRound?: number }} [surface]
 */
function outlineSourceGeometry(typeId, sizeMul = 1, surface = null) {
  const preset = SHAPE_PRESETS[typeId];
  if (preset?.kind === 'box') {
    const w = preset.rx * UNIT * sizeMul * 2;
    const h = preset.ry * UNIT * sizeMul * 2;
    const d = preset.rz * UNIT * sizeMul * 2;
    const radius = cornerRadiusFor(surface, w, h, d);
    if (radius > 0) {
      const inset = radius * (1 - Math.cos(Math.PI / 4)) * 2;
      return new THREE.BoxGeometry(w - inset, h - inset, d - inset);
    }
  }
  return null;
}

function edgesFor(geometry, typeId, sizeMul, surface) {
  const source = outlineSourceGeometry(typeId, sizeMul, surface);
  if (!source) return new THREE.EdgesGeometry(geometry, EDGE_THRESHOLD_DEG);
  const edges = new THREE.EdgesGeometry(source, EDGE_THRESHOLD_DEG);
  source.dispose();
  return edges;
}

/**
 * Builds the dark "Kanten" outline that rides along with a shape mesh.
 * @param {THREE.BufferGeometry} geometry
 * @param {string} typeId
 * @param {number} [sizeMul]
 * @param {{ roundedEdges?: boolean, cornerRound?: number }} [surface]
 */
export function createEdgeOutline(geometry, typeId, sizeMul = 1, surface = null) {
  const lines = new THREE.LineSegments(
    edgesFor(geometry, typeId, sizeMul, surface),
    new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.85 }),
  );
  lines.castShadow = false;
  lines.receiveShadow = false;
  return lines;
}

/**
 * Rebuilds an outline's segments after its parent geometry changed.
 * @param {THREE.LineSegments} outline
 * @param {THREE.BufferGeometry} geometry
 * @param {string} typeId
 * @param {number} [sizeMul]
 * @param {{ roundedEdges?: boolean, cornerRound?: number }} [surface]
 */
export function refreshEdgeOutline(outline, geometry, typeId, sizeMul = 1, surface = null) {
  outline.geometry.dispose();
  outline.geometry = edgesFor(geometry, typeId, sizeMul, surface);
}

/** @param {THREE.Color} color @param {{ metalness?: number, roughness?: number, emissive?: number, trueColors?: boolean }} [opts] */
export function cinematicMaterial(color, opts = {}) {
  if (opts.trueColors) {
    const metalness = ((opts.metalness ?? 18) / 100) * 0.22;
    const roughness = Math.max(0.62, (opts.roughness ?? 16) / 100);
    const emissiveIntensity = 0.58 + ((opts.emissive ?? 16) / 100) * 0.42;
    return new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.2),
      metalness,
      roughness,
      emissive: color.clone(),
      emissiveIntensity,
      envMapIntensity: 0.1,
    });
  }

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

/** @param {THREE.MeshStandardMaterial} mat @param {THREE.Color} color @param {{ metalness?: number, roughness?: number, emissive?: number, trueColors?: boolean }} opts */
export function updateCinematicMaterial(mat, color, opts = {}) {
  if (opts.trueColors) {
    mat.color.copy(color).multiplyScalar(0.2);
    mat.metalness = ((opts.metalness ?? 18) / 100) * 0.22;
    mat.roughness = Math.max(0.62, (opts.roughness ?? 16) / 100);
    mat.emissive.copy(color);
    mat.emissiveIntensity = 0.58 + ((opts.emissive ?? 16) / 100) * 0.42;
    mat.envMapIntensity = 0.1;
    return;
  }

  mat.color.copy(color);
  mat.metalness = ((opts.metalness ?? 18) / 100) * 0.65;
  mat.roughness = (opts.roughness ?? 16) / 100;
  mat.emissive.copy(color).multiplyScalar(((opts.emissive ?? 16) / 100) * 0.28);
  mat.emissiveIntensity = 1;
  mat.envMapIntensity = 0.35;
}

export { UNIT };
