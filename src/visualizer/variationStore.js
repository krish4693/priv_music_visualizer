export const VARIATION_STORAGE_KEY = 'visualizer-popart-variation-v2';

import { SHAPE_OPTIONS } from './shapePresets.js';
import { normalizeVisualConcept } from './visualConceptStore.js';
import { normalizeLiquidSourceMode } from './liquidSourceModes.js';
import { normalizeGlobeShapeMode } from './globeShapeModes.js';
import { normalizeGlobeDetail } from './globeDetail.js';
import { normalizeGlobeTubeProfile } from './globeTubeProfile.js';
import { normalizeElementSizePercent } from './elementMotion.js';

export { SHAPE_OPTIONS };

export const ANIMATION_SPEEDS = [
  { value: 0.25, label: '¼×' },
  { value: 0.5, label: '½×' },
  { value: 1, label: '1×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
  { value: 8, label: '8×' },
  { value: 16, label: '16×' },
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
 * @property {number} elementSizeFrom
 * @property {number} elementSizeTo
 * @property {number} elementDistanceFrom
 * @property {number} elementDistanceTo
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
 * @property {import('./liquidSourceModes.js').LiquidSourceMode} liquidSourceMode
 * @property {import('./globeShapeModes.js').GlobeShapeMode} globeShapeMode
 * @property {number} globeDetail
 * @property {boolean} [globeDenseProof]
 * @property {import('./globeTubeProfile.js').GlobeTubeProfile} globeTubeProfile
 * @property {number} liquidFlowSpeed
 * @property {number} liquidThickness
 * @property {number} liquidRelief
 * @property {number} liquidTurbulence
 * @property {number|null} [livingElementCount]
 * @property {number} elementMotion
 * @property {number} elementTurn
 * @property {number} element3dMotion
 * @property {number} surfaceWobble
 * @property {number} backgroundDepth
 * @property {boolean} elementUnicolor
 */

/** @type {VariationSettings} */
export const DEFAULT_VARIATION = {
  seed: 42817,
  enabledShapes: ['cube', 'oval', 'pillar'],
  colorMode: 'energy',
  colorShift: 55,
  shapeCount: 6,
  sizeSpread: 30,
  elementSizeFrom: 45,
  elementSizeTo: 100,
  elementDistanceFrom: 42,
  elementDistanceTo: 74,
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
  liquidSourceMode: 'volcano',
  liquidFlowSpeed: 55,
  liquidThickness: 50,
  liquidRelief: 45,
  liquidTurbulence: 35,
  globeShapeMode: 'sphere',
  globeDetail: 50,
  globeTubeProfile: 'round',
  livingElementCount: 6,
  elementMotion: 50,
  elementTurn: 50,
  element3dMotion: 50,
  surfaceWobble: 0,
  backgroundDepth: 50,
  elementUnicolor: false,
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
    shapeCount: clamp(Number(v.shapeCount) || DEFAULT_VARIATION.shapeCount, 1, 28),
    sizeSpread: v.sizeSpread,
    elementSizeFrom: normalizeElementSizePercent(v.elementSizeFrom),
    elementSizeTo: normalizeElementSizePercent(v.elementSizeTo),
    elementDistanceFrom: normalizeElementSizePercent(v.elementDistanceFrom ?? DEFAULT_VARIATION.elementDistanceFrom),
    elementDistanceTo: normalizeElementSizePercent(v.elementDistanceTo ?? DEFAULT_VARIATION.elementDistanceTo),
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
    liquidSourceMode: normalizeLiquidSourceMode(v.liquidSourceMode ?? v.liquidFlowDirection),
    liquidFlowSpeed: clamp(Number(v.liquidFlowSpeed) ?? DEFAULT_VARIATION.liquidFlowSpeed, 0, 100),
    liquidThickness: clamp(Number(v.liquidThickness) ?? DEFAULT_VARIATION.liquidThickness, 0, 100),
    liquidRelief: clamp(Number(v.liquidRelief) ?? DEFAULT_VARIATION.liquidRelief, 0, 100),
    liquidTurbulence: clamp(Number(v.liquidTurbulence) ?? DEFAULT_VARIATION.liquidTurbulence, 0, 100),
    globeShapeMode: normalizeGlobeShapeMode(v.globeShapeMode),
    globeDetail: normalizeGlobeDetail(v.globeDetail),
    globeDenseProof: !!v.globeDenseProof,
    globeTubeProfile: normalizeGlobeTubeProfile(v.globeTubeProfile),
    livingElementCount: v.livingElementCount == null ? null : clamp(Math.round(Number(v.livingElementCount)), 1, 28),
    elementMotion: clamp(Number(v.elementMotion) ?? DEFAULT_VARIATION.elementMotion, 0, 100),
    elementTurn: clamp(Number(v.elementTurn) ?? DEFAULT_VARIATION.elementTurn, 0, 100),
    element3dMotion: clamp(Number(v.element3dMotion) ?? DEFAULT_VARIATION.element3dMotion, 0, 100),
    surfaceWobble: clamp(Number(v.surfaceWobble) ?? DEFAULT_VARIATION.surfaceWobble, 0, 100),
    backgroundDepth: clamp(Number(v.backgroundDepth) ?? DEFAULT_VARIATION.backgroundDepth, 0, 100),
    elementUnicolor: !!v.elementUnicolor,
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
      shapeCount: clamp(Number(parsed.shapeCount) || DEFAULT_VARIATION.shapeCount, 1, 28),
      sizeSpread: clamp(Number(parsed.sizeSpread) ?? DEFAULT_VARIATION.sizeSpread, 0, 100),
      elementSizeFrom: normalizeElementSizePercent(parsed.elementSizeFrom ?? DEFAULT_VARIATION.elementSizeFrom),
      elementSizeTo: normalizeElementSizePercent(parsed.elementSizeTo ?? DEFAULT_VARIATION.elementSizeTo),
      elementDistanceFrom: normalizeElementSizePercent(parsed.elementDistanceFrom ?? DEFAULT_VARIATION.elementDistanceFrom),
      elementDistanceTo: normalizeElementSizePercent(parsed.elementDistanceTo ?? DEFAULT_VARIATION.elementDistanceTo),
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
      liquidSourceMode: normalizeLiquidSourceMode(parsed.liquidSourceMode ?? parsed.liquidFlowDirection),
      liquidFlowSpeed: clamp(Number(parsed.liquidFlowSpeed) ?? DEFAULT_VARIATION.liquidFlowSpeed, 0, 100),
      liquidThickness: clamp(Number(parsed.liquidThickness) ?? DEFAULT_VARIATION.liquidThickness, 0, 100),
      liquidRelief: clamp(Number(parsed.liquidRelief) ?? DEFAULT_VARIATION.liquidRelief, 0, 100),
      liquidTurbulence: clamp(Number(parsed.liquidTurbulence) ?? DEFAULT_VARIATION.liquidTurbulence, 0, 100),
      globeShapeMode: normalizeGlobeShapeMode(parsed.globeShapeMode),
      globeDetail: normalizeGlobeDetail(parsed.globeDetail),
      globeDenseProof: !!parsed.globeDenseProof,
      globeTubeProfile: normalizeGlobeTubeProfile(parsed.globeTubeProfile),
      livingElementCount: parsed.livingElementCount == null
        ? null
        : clamp(Math.round(Number(parsed.livingElementCount)), 1, 28),
      elementMotion: clamp(Number(parsed.elementMotion) ?? DEFAULT_VARIATION.elementMotion, 0, 100),
      elementTurn: clamp(Number(parsed.elementTurn) ?? DEFAULT_VARIATION.elementTurn, 0, 100),
      element3dMotion: clamp(Number(parsed.element3dMotion) ?? DEFAULT_VARIATION.element3dMotion, 0, 100),
      surfaceWobble: clamp(Number(parsed.surfaceWobble) ?? DEFAULT_VARIATION.surfaceWobble, 0, 100),
      backgroundDepth: clamp(Number(parsed.backgroundDepth) ?? DEFAULT_VARIATION.backgroundDepth, 0, 100),
      elementUnicolor: !!parsed.elementUnicolor,
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
