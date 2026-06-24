/** @typedef {'geometric'|'particles'|'typography'|'constellation'|'blobs'|'glassDiscs'|'origami'|'liquidsOnCanvas'|'visualLivingSong'|'visualLivingSong3d'|'visualLivingSongSnake'|'visualLivingSongGlobe'} VisualConceptId */

export const VISUAL_CONCEPTS = [
  { id: 'geometric', label: 'Geometric shapes' },
  { id: 'particles', label: 'Particles' },
  { id: 'typography', label: 'Typography' },
  { id: 'constellation', label: 'Constellation' },
  { id: 'blobs', label: 'Blobs' },
  { id: 'glassDiscs', label: 'Glass discs' },
  { id: 'origami', label: 'Origami' },
  { id: 'liquidsOnCanvas', label: 'Volcano lava' },
  { id: 'visualLivingSong', label: 'Visual Living Song' },
  { id: 'visualLivingSong3d', label: 'Visual Living Song 3D' },
  { id: 'visualLivingSongSnake', label: 'Living Song · Snake & Sun' },
  { id: 'visualLivingSongGlobe', label: 'Living Song · Globe' },
];

const VALID_IDS = new Set(VISUAL_CONCEPTS.map((c) => c.id));

/** @param {string} [id] @returns {VisualConceptId} */
export function normalizeVisualConcept(id) {
  return VALID_IDS.has(id) ? /** @type {VisualConceptId} */ (id) : 'geometric';
}

/** @param {VisualConceptId} id */
export function isGeometricConcept(id) {
  return normalizeVisualConcept(id) === 'geometric';
}

/** @param {VisualConceptId} id */
export function isCanvasFluidConcept(id) {
  return normalizeVisualConcept(id) === 'liquidsOnCanvas';
}

/** @param {VisualConceptId} id */
export function isLivingSongConcept(id) {
  const concept = normalizeVisualConcept(id);
  return concept === 'visualLivingSong' || concept === 'visualLivingSong3d' || concept === 'visualLivingSongSnake' || concept === 'visualLivingSongGlobe';
}

/** @param {VisualConceptId} id */
export function isLavaConcept(id) {
  return normalizeVisualConcept(id) === 'liquidsOnCanvas';
}

/** @param {VisualConceptId} id */
export function isGlobeConcept(id) {
  return normalizeVisualConcept(id) === 'visualLivingSongGlobe';
}

/** @param {VisualConceptId} id @param {'popart'|'cinematic'} renderer */
export function conceptSupportsRenderer(id, renderer) {
  const concept = normalizeVisualConcept(id);
  if (concept === 'glassDiscs' && renderer === 'popart') return true;
  return true;
}
