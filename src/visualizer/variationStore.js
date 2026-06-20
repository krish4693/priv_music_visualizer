export const VARIATION_STORAGE_KEY = 'visualizer-popart-variation-v1';

import { SHAPE_OPTIONS } from './shapePresets.js';
import { normalizeVisualConcept } from './visualConceptStore.js';

export { SHAPE_OPTIONS };

export const ANIMATION_SPEEDS = [
  { value: 0.25, label: '¼×' },
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

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
 * @property {number} speedSpread
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
 * @property {number} animationSpeed
 * @property {import('./visualConceptStore.js').VisualConceptId} visualConcept
 */

/** @type {VariationSettings} */
export const DEFAULT_VARIATION = {
  seed: 42817,
  enabledShapes: ['cube', 'oval', 'pillar'],
  colorMode: 'energy',
  colorShift: 55,
  shapeCount: 14,
  sizeSpread: 30,
  spinIntensity: 62,
  speedSpread: 45,
  layoutSpread: 42,
  depthRange: 52,
  manualSpeed: false,
  manualSpeedValue: 50,
  surprises: false,
  surpriseRate: 20,
  roundedEdges: true,
  kanten: false,
  cornerRound: 50,
  fixedLayout: true,
  animationSpeed: 1,
  visualConcept: 'geometric',
};

const VALID_ANIMATION_SPEEDS = new Set(ANIMATION_SPEEDS.map((s) => s.value));

function normalizeAnimationSpeed(value) {
  const n = Number(value);
  return VALID_ANIMATION_SPEEDS.has(n) ? n : DEFAULT_VARIATION.animationSpeed;
}

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
    speedSpread: v.speedSpread,
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
    animationSpeed: normalizeAnimationSpeed(v.animationSpeed),
    visualConcept: normalizeVisualConcept(v.visualConcept),
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
      speedSpread: clamp(Number(parsed.speedSpread) ?? DEFAULT_VARIATION.speedSpread, 0, 100),
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
      animationSpeed: normalizeAnimationSpeed(parsed.animationSpeed),
      visualConcept: normalizeVisualConcept(parsed.visualConcept),
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
