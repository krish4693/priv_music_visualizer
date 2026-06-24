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
    const e = createBaseEntity(pos, i, variation, rng, palette.length, count);
    e.conceptData = {
      blobRx: 100 + rng() * 80,
      blobRy: 85 + rng() * 65,
      blobRz: 95 + rng() * 70,
      wobblePhase: rng() * Math.PI * 2,
      chaosPhase: rng() * Math.PI * 2,
      chaosRate: 0.9 + rng() * 1.8,
      driftAngle: rng() * Math.PI * 2,
      mergePull: 0.55 + rng() * 0.65,
    };
    initSoftShapeMotion(rng, e, 'ellipsoid');
    e.wobbleAmp *= 2.1;
    e.wobbleRate *= 1.45;
    return e;
  });

  return { entities, state: { mergePulse: 0 } };
}

/**
 * @param {object[]} entities
 * @param {{ mergePulse: number }} state
 * @param {{ mot: number, geo: number, motionDt: number, beat?: boolean, fixedLayout?: boolean, layoutSpread?: number }} ctx
 */
export function updateBlobs(entities, state, ctx) {
  if (ctx.beat) state.mergePulse = 1;
  state.mergePulse = Math.max(0, state.mergePulse - ctx.motionDt * 2.4);

  const mot = ctx.mot ?? 0;
  const geo = ctx.geo ?? 0;
  const pulse = state.mergePulse;
  const layoutTight = 1.1 - (ctx.layoutSpread ?? 42) / 100 * 0.55;
  const neighborReach = 280 + layoutTight * 120;

  for (const e of entities) {
    updateSoftShapeMotion(e, mot * 2.4, ctx.motionDt);
    const d = e.conceptData;

    d.wobblePhase += ctx.motionDt * (0.8 + mot * 1.6);
    d.chaosPhase += ctx.motionDt * d.chaosRate * (0.85 + mot * 1.1);

    const chaosAmp = (48 + mot * 105 + pulse * 130 + geo * 55) * d.mergePull;
    e.wobbleX += Math.sin(d.chaosPhase) * chaosAmp * 0.5 + Math.cos(d.chaosPhase * 1.9) * chaosAmp * 0.32;
    e.wobbleY += Math.cos(d.chaosPhase * 1.25) * chaosAmp * 0.58 + Math.sin(d.chaosPhase * 0.7) * chaosAmp * 0.22;
    e.wobbleZ += Math.sin(d.chaosPhase * 0.85) * chaosAmp * 0.42;

    d.driftAngle += ctx.motionDt * (0.45 + mot * 1.15 + pulse * 0.8);
    const orbitR = (40 + mot * 95 + pulse * 75) * layoutTight;
    e.wobbleX += Math.cos(d.driftAngle) * orbitR;
    e.wobbleY += Math.sin(d.driftAngle * 0.78) * orbitR * 0.82;
    e.wobbleZ += Math.sin(d.driftAngle * 1.15) * orbitR * 0.35;

    const swell = 1 + geo * 0.5 + pulse * 0.65 + Math.sin(d.wobblePhase + e.rotY) * 0.14;
    e.squashX = (e.squashX ?? 1) * swell * (0.9 + Math.sin(e.rotX + d.chaosPhase) * 0.18);
    e.squashY = (e.squashY ?? 1) * swell * (0.86 + Math.cos(e.rotY + d.chaosPhase) * 0.2);
    e.squashZ = (e.squashZ ?? 1) * swell * (0.92 + Math.sin(d.chaosPhase * 1.4) * 0.12);
  }

  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const a = entities[i];
      const b = entities[j];
      const dx = b.homeX - a.homeX;
      const dy = b.homeY - a.homeY;
      const dz = b.homeZ - a.homeZ;
      const dist = Math.hypot(dx, dy, dz * 0.55) || 1;
      if (dist > neighborReach) continue;

      const closeness = 1 - dist / neighborReach;
      const pull = closeness * closeness * (0.22 + mot * 0.38 + pulse * 0.45);
      const ax = a.conceptData.mergePull;
      const bx = b.conceptData.mergePull;

      a.wobbleX += dx * pull * 0.11 * bx;
      a.wobbleY += dy * pull * 0.11 * bx;
      a.wobbleZ += dz * pull * 0.07 * bx;
      b.wobbleX -= dx * pull * 0.11 * ax;
      b.wobbleY -= dy * pull * 0.11 * ax;
      b.wobbleZ -= dz * pull * 0.07 * ax;

      if (closeness > 0.55 && pulse > 0.2) {
        const sharedSwell = 1 + closeness * pulse * 0.18;
        a.squashX *= sharedSwell;
        a.squashY *= sharedSwell;
        a.squashZ *= sharedSwell;
        b.squashX *= sharedSwell;
        b.squashY *= sharedSwell;
        b.squashZ *= sharedSwell;
      }
    }
  }

  if (ctx.fixedLayout === false) {
    const drift = 0.008 + mot * 0.022 + pulse * 0.018;
    for (const e of entities) {
      const angle = e.conceptData.driftAngle + e.rotY;
      e.vx += Math.cos(angle) * drift;
      e.vy += Math.sin(angle * 0.76) * drift;
      e.vz += Math.sin(angle * 0.55) * drift * 0.65;
    }
  }
}
