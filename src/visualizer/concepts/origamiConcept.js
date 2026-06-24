import { MIN_ENTITIES, MAX_ENTITIES, curatedLayout, createBaseEntity, createRng } from '../sceneCore/layout.js';

const FOLD_TARGETS = [0, 0.35, 0.65, 1];

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initOrigami(ctx) {
  const { variation, width, height, palette } = ctx;
  const rng = createRng(variation.seed);
  const count = Math.min(MAX_ENTITIES, Math.max(MIN_ENTITIES, variation.shapeCount));
  const spread = variation.layoutSpread / 100;
  const positions = curatedLayout(count, width, height, spread, rng);

  const entities = positions.map((pos, i) => {
    const e = createBaseEntity(pos, i, variation, rng, palette.length, count);
    const foldFrom = FOLD_TARGETS[Math.floor(rng() * FOLD_TARGETS.length)];
    const foldTo = FOLD_TARGETS[Math.floor(rng() * FOLD_TARGETS.length)];
    e.conceptData = {
      paperW: 120 + rng() * 90,
      paperH: 95 + rng() * 70,
      foldFrom,
      foldTo,
      crease: rng() > 0.5 ? 'x' : 'y',
    };
    e.morphT = rng() * 0.5;
    return e;
  });

  return { entities, state: {} };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** @param {object} e */
export function origamiFoldAngle(e) {
  const d = e.conceptData;
  const t = easeInOut(Math.min(1, e.morphT));
  return d.foldFrom + (d.foldTo - d.foldFrom) * t;
}

/** @param {object[]} entities @param {object} _state @param {{ morph: number, motionDt: number, rng: () => number }} ctx */
export function updateOrigami(entities, _state, ctx) {
  for (const e of entities) {
    e.morphT = Math.min(1, e.morphT + (0.012 + ctx.morph * 0.06) * ctx.motionDt);
    if (e.morphT >= 1) {
      e.conceptData.foldFrom = e.conceptData.foldTo;
      e.conceptData.foldTo = FOLD_TARGETS[Math.floor(ctx.rng() * FOLD_TARGETS.length)];
      e.morphT = 0;
    }
  }
}
