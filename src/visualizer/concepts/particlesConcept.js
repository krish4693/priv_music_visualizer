import { MIN_ENTITIES, MAX_ENTITIES, curatedLayout, createBaseEntity, createRng } from '../sceneCore/layout.js';
import { spreadSpinAxis } from '../motionSpread.js';

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initParticles(ctx) {
  const { variation, width, height, palette } = ctx;
  const rng = createRng(variation.seed);
  const count = Math.min(MAX_ENTITIES, Math.max(MIN_ENTITIES, variation.shapeCount));
  const spread = variation.layoutSpread / 100;
  const positions = curatedLayout(count, width, height, spread, rng);
  const particlesPer = 18;

  const entities = positions.map((pos, i) => {
    const e = createBaseEntity(pos, i, variation, rng, palette.length);
    e.rotSpeedX = spreadSpinAxis(rng, 0.4, 0.5, variation.speedSpread / 100);
    e.rotSpeedY = spreadSpinAxis(rng, 0.35, 0.5, variation.speedSpread / 100);
    e.rotSpeedZ = spreadSpinAxis(rng, 0.3, 0.5, variation.speedSpread / 100);
    const orbitR = 28 + rng() * 55;
    e.conceptData = {
      orbitR,
      orbitSpeed: 0.6 + rng() * 1.4,
      phase: rng() * Math.PI * 2,
      dots: Array.from({ length: particlesPer }, (_, j) => ({
        angle: (j / particlesPer) * Math.PI * 2 + rng() * 0.4,
        radius: orbitR * (0.35 + rng() * 0.65),
        size: 6 + rng() * 10,
        lift: (rng() - 0.5) * 40,
      })),
    };
    return e;
  });

  return { entities, state: { pulse: 0 } };
}

/** @param {object[]} entities @param {object} state @param {{ mot: number, geo: number, motionDt: number, beat?: boolean }} ctx */
export function updateParticles(entities, state, ctx) {
  if (ctx.beat) state.pulse = 1;
  state.pulse = Math.max(0, state.pulse - ctx.motionDt * 2.8);
  const pulse = state.pulse;
  for (const e of entities) {
    const d = e.conceptData;
    d.phase += ctx.mot * d.orbitSpeed * ctx.motionDt * 0.9;
    const breathe = 1 + ctx.geo * 0.35 + pulse * 0.25;
    e.squashX = breathe;
    e.squashY = breathe;
    e.squashZ = breathe;
  }
}

/** @param {object} e @param {object} dot @param {number} mot @param {number} geo */
export function particleDotWorld(e, dot, mot, geo) {
  const d = e.conceptData;
  const ang = dot.angle + d.phase + mot * 0.5;
  const r = dot.radius * (1 + geo * 0.2);
  return {
    x: e.x + Math.cos(ang) * r,
    y: e.y + Math.sin(ang * 0.85) * r * 0.75,
    z: e.z + dot.lift + Math.sin(ang * 1.3) * 18,
    size: dot.size * e.scale * (1 + geo * 0.4),
  };
}
