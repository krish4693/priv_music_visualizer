/** @typedef {'sphere'|'sphereCurvedZigzag'|'sphereSpiralWrap'|'sphereLatitudeBands'|'sphereRiverMeander'|'ellipsoid'|'torus'|'blob'|'cube'} GlobeShapeMode */

export const GLOBE_SHAPE_MODES = [
  { id: 'sphere', label: 'Sphere' },
  { id: 'sphereCurvedZigzag', label: 'Sphere (curved zigzag)' },
  { id: 'sphereSpiralWrap', label: 'Sphere (spiral wrap)' },
  { id: 'sphereLatitudeBands', label: 'Sphere (latitude bands)' },
  { id: 'sphereRiverMeander', label: 'Sphere (river meander)' },
  { id: 'ellipsoid', label: 'Ellipsoid' },
  { id: 'torus', label: 'Torus ring' },
  { id: 'blob', label: 'Organic blob' },
  { id: 'cube', label: 'Soft cube' },
];

const VALID = new Set(GLOBE_SHAPE_MODES.map((m) => m.id));

/** @param {string} [id] @returns {GlobeShapeMode} */
export function normalizeGlobeShapeMode(id) {
  if (VALID.has(id)) return /** @type {GlobeShapeMode} */ (id);
  return 'sphere';
}
