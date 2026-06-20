/** @typedef {'geometric'|'particles'|'typography'|'constellation'|'blobs'|'glassDiscs'|'origami'} VisualConceptId */

export const VISUAL_CONCEPTS = [
  { id: 'geometric', label: 'Geometric shapes' },
  { id: 'particles', label: 'Particles' },
  { id: 'typography', label: 'Typography' },
  { id: 'constellation', label: 'Constellation' },
  { id: 'blobs', label: 'Blobs' },
  { id: 'glassDiscs', label: 'Glass discs' },
  { id: 'origami', label: 'Origami' },
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

/** @param {VisualConceptId} id @param {'popart'|'cinematic'} renderer */
export function conceptSupportsRenderer(id, renderer) {
  const concept = normalizeVisualConcept(id);
  if (concept === 'glassDiscs' && renderer === 'popart') return true;
  return true;
}
