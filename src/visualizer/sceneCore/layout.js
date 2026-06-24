import { elementMotionScale, elementTurnScale, element3dScale, elementSizeMultiplier } from '../elementMotion.js';

export const MIN_ENTITIES = 1;
export const MAX_ENTITIES = 28;

export function createRng(seed) {
  let s = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function curatedLayout(n, w, h, spread = 0.5, rng = Math.random) {
  const cols = 5;
  const rows = Math.ceil(n / cols);
  const positions = [];
  const jitterScale = 0.35 + spread * 1.65;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = ((col + 0.5) / cols) * w;
    const cy = ((row + 0.5) / rows) * h;
    const jitterX = (((i * 47) % 90 - 45) + (rng() - 0.5) * 40) * jitterScale;
    const jitterY = (((i * 83) % 90 - 45) + (rng() - 0.5) * 40) * jitterScale;
    positions.push({ x: cx + jitterX, y: cy + jitterY });
  }
  return positions;
}

/**
 * @param {{ x: number, y: number }} pos
 * @param {number} i
 * @param {import('../variationStore.js').VariationSettings} variation
 * @param {() => number} rng
 * @param {number} paletteLen
 */
export function createBaseEntity(pos, i, variation, rng, paletteLen, entityCount = 1) {
  const spin = variation.spinIntensity / 100;
  const turnMul = elementTurnScale(variation);
  const dim3Mul = element3dScale(variation);
  const motion = elementMotionScale(variation);
  const speedSpread = (variation.speedSpread ?? 45) / 100;
  const depth = variation.depthRange / 100;
  const sizeMul = elementSizeMultiplier(variation, i, entityCount, rng);
  const zRange = (80 + depth * 200) * dim3Mul * motion;
  const spinMul = (0.35 + spin * 0.85) * turnMul * motion;
  const z = (rng() - 0.5) * zRange * 2;

  return {
    x: pos.x,
    y: pos.y,
    z,
    homeX: pos.x,
    homeY: pos.y,
    homeZ: z,
    vx: 0,
    vy: 0,
    vz: 0,
    rotX: rng() * Math.PI * 2,
    rotY: rng() * Math.PI * 2,
    rotZ: rng() * Math.PI * 2,
    rotSpeedX: (rng() - 0.5) * 0.76 * spinMul * (0.5 + speedSpread),
    rotSpeedY: (rng() - 0.5) * 0.64 * spinMul * (0.5 + speedSpread),
    rotSpeedZ: (rng() - 0.5) * 0.84 * spinMul * (0.5 + speedSpread),
    colorIdx: i % Math.max(1, paletteLen),
    scale: 1,
    targetScale: 1,
    sizeMul,
    surpriseSpinBoost: 1,
    surpriseScale: 1,
    wobbleX: 0,
    wobbleY: 0,
    wobbleZ: 0,
    squashX: 1,
    squashY: 1,
    squashZ: 1,
    tiltX: 0,
    tiltZ: 0,
    morphT: 0,
  };
}
