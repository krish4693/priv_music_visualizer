/** @typedef {'box'|'ellipsoid'|'pyramid'|'octahedron'|'cone'|'cylinder'|'prism'|'tetrahedron'|'torus'} ShapeKind */

/**
 * @typedef {Object} ShapePreset
 * @property {ShapeKind} kind
 * @property {number} rx
 * @property {number} ry
 * @property {number} rz
 * @property {number} [round]
 */

export const SHAPE_OPTIONS = [
  { id: 'rectangle', label: 'Rectangle' },
  { id: 'cube', label: 'Cube' },
  { id: 'oval', label: 'Oval' },
  { id: 'pillar', label: 'Pillar' },
  { id: 'pyramid', label: 'Pyramid' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'cone', label: 'Cone' },
  { id: 'cylinder', label: 'Cylinder' },
  { id: 'prism', label: 'Triangular prism' },
  { id: 'tetrahedron', label: 'Tetrahedron' },
  { id: 'torus', label: 'Torus' },
];

/** @type {Record<string, ShapePreset>} */
export const SHAPE_PRESETS = {
  rectangle: { kind: 'box', rx: 210, ry: 78, rz: 52, round: 0.04 },
  cube: { kind: 'box', rx: 105, ry: 105, rz: 105, round: 0.06 },
  oval: { kind: 'ellipsoid', rx: 135, ry: 92, rz: 88, round: 1 },
  pillar: { kind: 'box', rx: 68, ry: 145, rz: 68, round: 0.08 },
  pyramid: { kind: 'pyramid', rx: 130, ry: 155, rz: 130, round: 0 },
  diamond: { kind: 'octahedron', rx: 118, ry: 150, rz: 118, round: 0 },
  cone: { kind: 'cone', rx: 98, ry: 165, rz: 98, round: 0 },
  cylinder: { kind: 'cylinder', rx: 92, ry: 135, rz: 92, round: 0 },
  prism: { kind: 'prism', rx: 125, ry: 110, rz: 95, round: 0 },
  tetrahedron: { kind: 'tetrahedron', rx: 145, ry: 145, rz: 145, round: 0 },
  torus: { kind: 'torus', rx: 115, ry: 42, rz: 115, round: 0 },
};

export function getShapeKind(id) {
  return SHAPE_PRESETS[id]?.kind ?? 'box';
}
