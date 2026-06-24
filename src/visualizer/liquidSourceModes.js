/** @typedef {'volcano'} LiquidSourceMode */

export const LIQUID_SOURCE_MODES = [
  { id: 'volcano', label: 'Volcano — lava from summit vent' },
];

const VALID = new Set(LIQUID_SOURCE_MODES.map((m) => m.id));

/** Volcano vent in normalized canvas space (screen y down). */
export const VOLCANO_VENT = { u: 0.5, v: 0.07 };

/** @param {string} [id] @returns {LiquidSourceMode} */
export function normalizeLiquidSourceMode(id) {
  if (VALID.has(id)) return /** @type {LiquidSourceMode} */ (id);
  return 'volcano';
}
