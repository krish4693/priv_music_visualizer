import { MIN_ENTITIES, MAX_ENTITIES, curatedLayout, createBaseEntity, createRng } from '../sceneCore/layout.js';
import { buildCharMeshData, charsForTypography } from '../letterMesh.js';
import { spreadSpinAxis } from '../motionSpread.js';

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initTypography(ctx) {
  const { variation, width, height, palette, songTitle } = ctx;
  const rng = createRng(variation.seed);
  const count = Math.min(MAX_ENTITIES, Math.max(MIN_ENTITIES, variation.shapeCount));
  const spread = variation.layoutSpread / 100;
  const positions = curatedLayout(count, width, height, spread, rng);
  const chars = charsForTypography(songTitle, count);

  const entities = positions.map((pos, i) => {
    const e = createBaseEntity(pos, i, variation, rng, palette.length);
    const ch = chars[i];
    const mesh = buildCharMeshData(ch);
    e.rotSpeedX = spreadSpinAxis(rng, 0.55, 0.45, variation.speedSpread / 100);
    e.rotSpeedY = spreadSpinAxis(rng, 0.72, 0.55, variation.speedSpread / 100);
    e.rotSpeedZ = spreadSpinAxis(rng, 0.48, 0.45, variation.speedSpread / 100);
    e.conceptData = {
      char: ch,
      ...mesh,
      letterScale: 1.15 + rng() * 0.45,
      displayScale: 1,
    };
    return e;
  });

  return { entities, state: {} };
}

/** @param {object[]} entities @param {object} _state @param {{ geo: number, morph: number }} ctx */
export function updateTypography(entities, _state, ctx) {
  for (const e of entities) {
    const target = 0.85 + ctx.geo * 0.25;
    e.conceptData.displayScale = target + Math.sin(e.rotY) * ctx.morph * 0.08;
  }
}
