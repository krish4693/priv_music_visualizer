function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Map 0–100 detail slider to path density and tube mesh quality.
 * @param {number} [detail]
 * @returns {{ stepsMin: number, stepsRange: number, tubeSides: number }}
 */
export function globeDetailParams(detail = 50) {
  const d = clamp(Number(detail) || 50, 0, 100) / 100;
  const stepsMin = Math.round(56 + d * 120);
  const stepsRange = Math.round(28 + d * 108);
  const tubeSides = Math.max(6, Math.round(8 + d * 12));
  return { stepsMin, stepsRange, tubeSides };
}

/** @param {number} [detail] */
export function normalizeGlobeDetail(detail) {
  return clamp(Number(detail) ?? 50, 0, 100);
}
