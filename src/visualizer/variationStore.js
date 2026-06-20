export const VARIATION_STORAGE_KEY = 'visualizer-popart-variation-v1';

export { SHAPE_OPTIONS } from './shapePresets.js';

export const COLOR_MODES = [
  { id: 'manual', label: 'Manual — palette only' },
  { id: 'tempo', label: 'Tempo — follows song BPM' },
  { id: 'energy', label: 'Energy — reacts to beats & volume' },
];

/** @typedef {'manual'|'tempo'|'energy'} ColorMode */
/** @typedef {'rectangle'|'cube'|'oval'|'pillar'} ShapeId */

/**
 * @typedef {Object} VariationSettings
 * @property {number} seed
 * @property {ShapeId[]} enabledShapes
 * @property {ColorMode} colorMode
 * @property {number} colorShift
 * @property {number} shapeCount
 * @property {number} sizeSpread
 * @property {number} spinIntensity
 * @property {number} layoutSpread
 * @property {number} depthRange
 * @property {boolean} manualSpeed
 * @property {number} manualSpeedValue
 * @property {boolean} surprises
 * @property {number} surpriseRate
 * @property {boolean} roundedEdges
 * @property {boolean} kanten
 * @property {number} cornerRound
 * @property {boolean} fixedLayout
 */

/** @type {VariationSettings} */
export const DEFAULT_VARIATION = {
  seed: 42817,
  enabledShapes: ['rectangle', 'cube', 'oval', 'pillar'],
  colorMode: 'tempo',
  colorShift: 65,
  shapeCount: 20,
  sizeSpread: 35,
  spinIntensity: 50,
  layoutSpread: 50,
  depthRange: 45,
  manualSpeed: false,
  manualSpeedValue: 50,
  surprises: true,
  surpriseRate: 55,
  roundedEdges: false,
  kanten: true,
  cornerRound: 45,
  fixedLayout: true,
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function randomSeed() {
  return Math.floor(Math.random() * 99999) + 1;
}

/** @returns {VariationSettings} */
export function cloneVariation(v) {
  return {
    seed: v.seed,
    enabledShapes: [...v.enabledShapes],
    colorMode: v.colorMode,
    colorShift: v.colorShift,
    shapeCount: v.shapeCount,
    sizeSpread: v.sizeSpread,
    spinIntensity: v.spinIntensity,
    layoutSpread: v.layoutSpread,
    depthRange: v.depthRange,
    manualSpeed: !!v.manualSpeed,
    manualSpeedValue: v.manualSpeedValue,
    surprises: !!v.surprises,
    surpriseRate: v.surpriseRate,
    roundedEdges: !!v.roundedEdges,
    kanten: !!v.kanten,
    cornerRound: v.cornerRound,
    fixedLayout: v.fixedLayout !== false,
  };
}

/** @returns {VariationSettings} */
export function loadVariation() {
  try {
    const raw = localStorage.getItem(VARIATION_STORAGE_KEY);
    if (!raw) return cloneVariation(DEFAULT_VARIATION);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return cloneVariation(DEFAULT_VARIATION);

    const validShapes = new Set(SHAPE_OPTIONS.map((s) => s.id));
    const enabledShapes = Array.isArray(parsed.enabledShapes)
      ? parsed.enabledShapes.filter((id) => validShapes.has(id))
      : [...DEFAULT_VARIATION.enabledShapes];
    if (!enabledShapes.length) enabledShapes.push('cube');

    const validModes = new Set(COLOR_MODES.map((m) => m.id));
    const colorMode = validModes.has(parsed.colorMode) ? parsed.colorMode : DEFAULT_VARIATION.colorMode;

    return {
      seed: Number.isFinite(parsed.seed) ? Math.max(1, Math.floor(parsed.seed)) : DEFAULT_VARIATION.seed,
      enabledShapes,
      colorMode,
      colorShift: clamp(Number(parsed.colorShift) || DEFAULT_VARIATION.colorShift, 0, 100),
      shapeCount: clamp(Number(parsed.shapeCount) || DEFAULT_VARIATION.shapeCount, 8, 28),
      sizeSpread: clamp(Number(parsed.sizeSpread) ?? DEFAULT_VARIATION.sizeSpread, 0, 100),
      spinIntensity: clamp(Number(parsed.spinIntensity) ?? DEFAULT_VARIATION.spinIntensity, 0, 100),
      layoutSpread: clamp(Number(parsed.layoutSpread) ?? DEFAULT_VARIATION.layoutSpread, 0, 100),
      depthRange: clamp(Number(parsed.depthRange) ?? DEFAULT_VARIATION.depthRange, 0, 100),
      manualSpeed: !!parsed.manualSpeed,
      manualSpeedValue: clamp(Number(parsed.manualSpeedValue) ?? DEFAULT_VARIATION.manualSpeedValue, 0, 250),
      surprises: parsed.surprises !== false,
      surpriseRate: clamp(Number(parsed.surpriseRate) ?? DEFAULT_VARIATION.surpriseRate, 0, 100),
      roundedEdges: !!parsed.roundedEdges,
      kanten: parsed.kanten !== false,
      cornerRound: clamp(Number(parsed.cornerRound) ?? DEFAULT_VARIATION.cornerRound, 0, 100),
      fixedLayout: parsed.fixedLayout !== false,
    };
  } catch {
    return cloneVariation(DEFAULT_VARIATION);
  }
}

/** @param {VariationSettings} settings */
export function saveVariation(settings) {
  localStorage.setItem(VARIATION_STORAGE_KEY, JSON.stringify(settings));
}

/** @param {VariationSettings} settings @returns {VariationSettings} */
export function randomizeVariationSeed(settings) {
  const next = cloneVariation(settings);
  next.seed = randomSeed();
  return next;
}
