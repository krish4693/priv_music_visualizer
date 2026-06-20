import { cloneVariation } from './variationStore.js';
import { cloneMappings } from './mappingMatrix.js';
import { normalizeCinematicSettings } from './cinematicSettingsStore.js';
import { POP_ART_COLORS } from './popArtPalette.js';
import { colorKey } from './paletteStore.js';

/** Pop Art cyan, yellow, blue — clear and vivid. */
export const LIVELY_PALETTE_KEYS = [
  colorKey(POP_ART_COLORS[0]),
  colorKey(POP_ART_COLORS[2]),
  colorKey(POP_ART_COLORS[3]),
];

/** @type {import('./mappingMatrix.js').MappingMatrix} */
export const LIVELY_MAPPINGS = {
  geometry: { source: 'low', sensitivity: 0.75 },
  color: { source: 'mid', sensitivity: 0.55 },
  motion: { source: 'beatPulse', sensitivity: 0.62 },
  morphing: { source: 'tempoPhase', sensitivity: 0.45 },
};

export const LIVELY_VISCOSITY = 0.5;

/** @type {import('./variationStore.js').VariationSettings} */
export const LIVELY_VARIATION = cloneVariation({
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
});

export const LIVELY_CINEMATIC = normalizeCinematicSettings({
  fog: 30,
  bloom: 42,
  bloomRadius: 34,
  vignette: 42,
  exposure: 118,
  keyLight: 70,
  fillLight: 58,
  rimLight: 38,
  ambient: 36,
  frontLight: 78,
  shadows: true,
  metalness: 18,
  roughness: 16,
  emissive: 16,
  letterbox: 32,
  cameraOrbit: 52,
  floorGloss: 28,
});

export const LIVELY_BG = '#101018';

/** Full look payload for applyLookSettings / config export. */
export function buildLivelyRefinedLook() {
  return {
    variation: cloneVariation(LIVELY_VARIATION),
    mappings: cloneMappings(LIVELY_MAPPINGS),
    viscosity: LIVELY_VISCOSITY,
    bgColor: LIVELY_BG,
    title: '',
    titleFrequency: 35,
    palette: { customColors: [], selectedKeys: [...LIVELY_PALETTE_KEYS] },
    cinematic: { ...LIVELY_CINEMATIC },
  };
}
