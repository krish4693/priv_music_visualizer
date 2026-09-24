/** @typedef {'off'|'sphere'|'box'} GlobeJointStyle */

export const GLOBE_JOINT_STYLES = [
  { id: 'sphere', label: 'Round joints' },
  { id: 'box', label: 'Square joints' },
  { id: 'off', label: 'Off (visible gaps)' },
];

const VALID = new Set(GLOBE_JOINT_STYLES.map((m) => m.id));

/** @param {string} [id] @returns {GlobeJointStyle} */
export function normalizeGlobeJointStyle(id) {
  if (VALID.has(id)) return /** @type {GlobeJointStyle} */ (id);
  return 'sphere';
}
