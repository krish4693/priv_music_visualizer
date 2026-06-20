import { MIN_ENTITIES, MAX_ENTITIES, curatedLayout, createBaseEntity, createRng } from '../sceneCore/layout.js';

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initGlassDiscs(ctx) {
  const { variation, width, height, palette } = ctx;
  const rng = createRng(variation.seed);
  const count = Math.min(MAX_ENTITIES, Math.max(MIN_ENTITIES, variation.shapeCount));
  const spread = variation.layoutSpread / 100;
  const positions = curatedLayout(count, width, height, spread, rng);

  const entities = positions.map((pos, i) => {
    const e = createBaseEntity(pos, i, variation, rng, palette.length);
    const radius = 55 + rng() * 75;
    e.conceptData = {
      radius,
      baseRadius: radius,
      thickness: 0.08 + rng() * 0.06,
      tiltX: (rng() - 0.5) * 0.9,
      tiltZ: (rng() - 0.5) * 0.9,
      shimmer: rng() * Math.PI * 2,
    };
    e.tiltX = e.conceptData.tiltX;
    e.tiltZ = e.conceptData.tiltZ;
    e.rotSpeedX *= 0.25;
    e.rotSpeedZ *= 0.25;
    return e;
  });

  return { entities, state: {} };
}

/** @param {object[]} entities @param {object} _state @param {{ mot: number, geo: number, motionDt: number }} ctx */
export function updateGlassDiscs(entities, _state, ctx) {
  for (const e of entities) {
    e.conceptData.shimmer += ctx.motionDt * (0.5 + ctx.mot);
    const wobble = Math.sin(e.conceptData.shimmer) * ctx.mot * 0.15;
    e.tiltX = e.conceptData.tiltX + wobble;
    e.tiltZ = e.conceptData.tiltZ + Math.cos(e.conceptData.shimmer * 0.7) * ctx.mot * 0.12;
    e.conceptData.radius = e.conceptData.baseRadius * e.sizeMul * (1 + ctx.geo * 0.18);
  }
}
