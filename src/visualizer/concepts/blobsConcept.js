import { MIN_ENTITIES, MAX_ENTITIES, curatedLayout, createBaseEntity, createRng } from '../sceneCore/layout.js';
import { initSoftShapeMotion, updateSoftShapeMotion } from '../roundShapeMotion.js';

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initBlobs(ctx) {
  const { variation, width, height, palette } = ctx;
  const rng = createRng(variation.seed);
  const count = Math.min(MAX_ENTITIES, Math.max(MIN_ENTITIES, variation.shapeCount));
  const spread = variation.layoutSpread / 100;
  const positions = curatedLayout(count, width, height, spread, rng);

  const entities = positions.map((pos, i) => {
    const e = createBaseEntity(pos, i, variation, rng, palette.length);
    e.conceptData = {
      blobRx: 70 + rng() * 60,
      blobRy: 55 + rng() * 50,
      blobRz: 65 + rng() * 55,
      wobblePhase: rng() * Math.PI * 2,
    };
    initSoftShapeMotion(rng, e, 'ellipsoid');
    e.squashX = 0.9 + rng() * 0.25;
    e.squashY = 0.85 + rng() * 0.3;
    e.squashZ = 0.9 + rng() * 0.25;
    return e;
  });

  return { entities, state: {} };
}

/** @param {object[]} entities @param {object} _state @param {{ mot: number, geo: number, motionDt: number }} ctx */
export function updateBlobs(entities, _state, ctx) {
  for (const e of entities) {
    updateSoftShapeMotion(e, ctx.mot * 1.2, ctx.motionDt);
    const pulse = 1 + ctx.geo * 0.28 + Math.sin(e.conceptData.wobblePhase + e.rotY) * 0.08;
    e.squashX = pulse * (0.92 + Math.sin(e.rotX) * 0.06);
    e.squashY = pulse * (0.88 + Math.cos(e.rotY) * 0.08);
    e.squashZ = pulse;
    e.conceptData.wobblePhase += ctx.motionDt * 0.4;
  }
}
