import { MIN_ENTITIES, MAX_ENTITIES, curatedLayout, createBaseEntity, createRng } from '../sceneCore/layout.js';

/** @param {object[]} entities @param {number} maxDist */
function buildEdges(entities, maxDist) {
  const edges = [];
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dz = a.z - b.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < maxDist) edges.push({ a: i, b: j, dist });
    }
  }
  return edges.slice(0, Math.min(edges.length, entities.length * 3));
}

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initConstellation(ctx) {
  const { variation, width, height, palette } = ctx;
  const rng = createRng(variation.seed);
  const count = Math.min(MAX_ENTITIES, Math.max(MIN_ENTITIES, variation.shapeCount));
  const spread = variation.layoutSpread / 100;
  const positions = curatedLayout(count, width, height, spread, rng);

  const entities = positions.map((pos, i) => {
    const e = createBaseEntity(pos, i, variation, rng, palette.length);
    e.conceptData = { nodeSize: 4 + rng() * 7, glow: rng() };
    e.rotSpeedX *= 0.35;
    e.rotSpeedY *= 0.35;
    e.rotSpeedZ *= 0.35;
    return e;
  });

  const maxDist = 180 + (1 - spread) * 120 + variation.layoutSpread * 0.8;
  const edges = buildEdges(entities, maxDist);

  return { entities, state: { edges, pulse: 0, edgePulse: new Float32Array(edges.length) } };
}

/** @param {object[]} entities @param {object} state @param {{ mot: number, geo: number, motionDt: number, beat?: boolean }} ctx */
export function updateConstellation(entities, state, ctx) {
  if (ctx.beat) state.pulse = 1;
  state.pulse = Math.max(0, state.pulse - ctx.motionDt * 3.5);
  for (let i = 0; i < state.edgePulse.length; i++) {
    state.edgePulse[i] = Math.max(0, state.edgePulse[i] - ctx.motionDt * 2.2);
    if (ctx.beat && Math.random() < 0.35) state.edgePulse[i] = 1;
  }
  for (const e of entities) {
    e.conceptData.nodeSize = (4 + e.conceptData.glow * 7) * (1 + ctx.geo * 0.35 + state.pulse * 0.2);
  }
}
