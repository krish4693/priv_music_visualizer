function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export const MAX_LIVING_ELEMENTS = 28;

/** @param {number} [value] @param {number} [fallback] */
export function normalizeLivingElementCount(value, fallback = 6) {
  return clamp(Math.round(Number(value) || fallback), 1, MAX_LIVING_ELEMENTS);
}

/** @param {number} [value] */
export function normalizeElementMotion(value) {
  return clamp(Number(value) ?? 50, 0, 100);
}

/** @param {number} [value] */
export function normalizeElementTurn(value) {
  return clamp(Number(value) ?? 50, 0, 100);
}

/** @param {number} [value] */
export function normalizeElement3dMotion(value) {
  return clamp(Number(value) ?? 50, 0, 100);
}

/** @param {number} [value] */
export function normalizeSurfaceWobble(value) {
  return clamp(Number(value) ?? 40, 0, 100);
}

/** 0.2 (calm) … 1.0 (default @ 50%) … 1.8 (lively). */
export function elementMotionScale(variation) {
  const m = normalizeElementMotion(variation?.elementMotion);
  return 0.2 + (m / 100) * 1.6;
}

/** 0.5 @ 0% … 1.0 @ 50% default … 1.5 @ 100%. Preserves legacy look at default. */
export function elementTurnScale(variation) {
  return 0.5 + normalizeElementTurn(variation?.elementTurn) / 100;
}

/** 0.5 @ 0% … 1.0 @ 50% default … 1.5 @ 100%. Preserves legacy depth/drift at default. */
export function element3dScale(variation) {
  return 0.5 + normalizeElement3dMotion(variation?.element3dMotion) / 100;
}

/** Unified shape/element count for every visual concept (1–28). */
export function resolveShapeCount(variation, fallback = 6) {
  if (variation?.shapeCount != null && Number.isFinite(Number(variation.shapeCount))) {
    return normalizeLivingElementCount(variation.shapeCount, fallback);
  }
  if (variation?.livingElementCount != null && Number.isFinite(Number(variation.livingElementCount))) {
    return normalizeLivingElementCount(variation.livingElementCount, fallback);
  }
  return normalizeLivingElementCount(fallback, fallback);
}

/** @param {import('./variationStore.js').VariationSettings|object} [variation] @param {number} [_paletteLength] */
export function resolveLivingElementCount(variation, _paletteLength = 2) {
  return resolveShapeCount(variation, 6);
}

/**
 * Palette colors cycled to match shape count (lava streams, etc.).
 * @param {{ r: number, g: number, b: number }[]} [palette]
 * @param {import('./variationStore.js').VariationSettings|object} [variation]
 */
export function colorsForShapeCount(palette, variation) {
  const base = palette?.length ? palette : [{ r: 255, g: 90, b: 20 }];
  const count = resolveShapeCount(variation, 6);
  const colors = [];
  for (let i = 0; i < count; i++) colors.push(base[i % base.length]);
  return colors;
}

/** Map 0–100 UI to ~0.25×–1.75× element scale. */
export function elementSizePercentToScale(percent) {
  const p = clamp(Number(percent) ?? 50, 0, 100);
  return 0.25 + (p / 100) * 1.5;
}

/** @param {number} [value] */
export function normalizeElementSizePercent(value) {
  return clamp(Number(value) ?? 50, 0, 100);
}

/**
 * Per-element size from From/To range. Size spread adds random jitter inside the range.
 * @param {import('./variationStore.js').VariationSettings|object} [variation]
 * @param {number} [index]
 * @param {number} [count]
 * @param {() => number} [rng]
 */
export function elementSizeMultiplier(variation, index = 0, count = 1, rng = null) {
  const fromP = normalizeElementSizePercent(variation?.elementSizeFrom ?? 50);
  const toP = normalizeElementSizePercent(variation?.elementSizeTo ?? 100);
  const minP = Math.min(fromP, toP);
  const maxP = Math.max(fromP, toP);
  const minS = elementSizePercentToScale(minP);
  const maxS = elementSizePercentToScale(maxP);
  if (count <= 1) return (minS + maxS) / 2;
  const spread = (variation?.sizeSpread ?? 0) / 100;
  if (spread > 0.05 && rng) {
    return minS + rng() * (maxS - minS);
  }
  const t = index / (count - 1);
  return minS + (maxS - minS) * t;
}

/** @param {number} tempo 0–1 from analysis */
export function bpmFromTempo(tempo) {
  return 65 + (tempo ?? 0.5) * 115;
}
