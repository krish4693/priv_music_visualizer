/** @typedef {'round'|'square'} GlobeTubeProfile */

export const GLOBE_TUBE_PROFILES = [
  { id: 'round', label: 'Round tubes' },
  { id: 'square', label: 'Square tubes' },
];

const VALID = new Set(GLOBE_TUBE_PROFILES.map((m) => m.id));

/** @param {string} [id] @returns {GlobeTubeProfile} */
export function normalizeGlobeTubeProfile(id) {
  if (VALID.has(id)) return /** @type {GlobeTubeProfile} */ (id);
  return 'round';
}
