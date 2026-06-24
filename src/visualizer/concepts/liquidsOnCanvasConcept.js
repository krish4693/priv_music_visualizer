import { createRng } from '../sceneCore/layout.js';
import { LiquidCanvasSim } from '../liquidCanvasSim.js';
import { normalizeLiquidSourceMode } from '../liquidSourceModes.js';
import { colorsForShapeCount } from '../elementMotion.js';

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initLiquidsOnCanvas(ctx) {
  const rng = createRng(ctx.variation.seed);
  const sim = new LiquidCanvasSim(144, 81);
  const mode = normalizeLiquidSourceMode(ctx.variation?.liquidSourceMode);
  sim.reset(colorsForShapeCount(ctx.palette, ctx.variation), rng, mode);
  return { entities: [], state: { sim, mesh: null, sourceMode: mode } };
}

/** @param {object[]} _entities @param {{ sim: LiquidCanvasSim, mesh?: object|null, sourceMode?: string }} state @param {object} ctx */
export function updateLiquidsOnCanvas(_entities, state, ctx) {
  if (!state.sim) return;
  const v = ctx.variation ?? ctx;
  const mode = normalizeLiquidSourceMode(v.liquidSourceMode);
  if (state.sourceMode !== mode) {
    state.sourceMode = mode;
    const palette = ctx.palette?.length ? ctx.palette : state.sim.palette;
    state.sim.reset(colorsForShapeCount(palette, v), ctx.rng ?? Math.random, mode);
  }
  state.sim.step({
    sourceMode: mode,
    flowSpeed: v.liquidFlowSpeed ?? 55,
    thickness: v.liquidThickness ?? 50,
    turbulence: v.liquidTurbulence ?? 35,
    mot: ctx.mot ?? 0,
    geo: ctx.geo ?? 0,
    beat: ctx.beat,
    motionDt: ctx.motionDt ?? 1 / 30,
  });
}

/** @param {LiquidCanvasSim} sim @param {{ r: number, g: number, b: number }[]} palette @param {() => number} rng @param {string} [sourceMode] @param {import('../variationStore.js').VariationSettings|object} [variation] */
export function resetLiquidSim(sim, palette, rng, sourceMode = 'center', variation = null) {
  const colors = variation ? colorsForShapeCount(palette, variation) : palette;
  sim.reset(colors, rng, normalizeLiquidSourceMode(sourceMode));
}
