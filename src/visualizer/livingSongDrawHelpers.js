import {
  bpmFromTempo,
  element3dScale,
  elementMotionScale,
  elementSizeMultiplier,
  elementTurnScale,
  normalizeSurfaceWobble,
  resolveLivingElementCount,
} from './elementMotion.js';
import { elementDistanceRange, stepGlobeBalloonLayouts, clearGlobeBalloonState } from './elementBalloonPhysics.js';
import { globeRadius } from './concepts/livingSongGlobeConcept.js';
import { applySurfaceWobble } from './surfaceWobble.js';
import { rotateEuler } from './math3d.js';

/** @param {object} scene @param {object} state */
export function resolveLivingRiverCount(scene, state) {
  const paletteLen = Math.max(1, scene.palette?.length ?? 1);
  const count = resolveLivingElementCount(scene.variation, paletteLen);
  let rivers = (state.rivers?.length ? state.rivers : []).slice(0, count);
  if (!rivers.length) {
    rivers = [{ pathSeed: 42, startX: 0.5, startY: 0.12, colorIdx: 0, startDelaySec: 0 }];
  }
  return rivers;
}

/** @param {object} [variation] */
export function livingMotionScale(variation) {
  return elementMotionScale(variation);
}

/** @param {object} [variation] @param {object} [state] */
export function livingSongMotionParams(variation, state = {}) {
  return {
    motionScale: elementMotionScale(variation),
    turnScale: elementTurnScale(variation),
    dim3Scale: element3dScale(variation),
    wobbleAmt: normalizeSurfaceWobble(variation?.surfaceWobble) / 100,
    tempo: state.tempo ?? 0.5,
    pulse: state.beatPulse ?? 0,
    energy: state.smoothEnergy ?? 0,
    variationSeed: state.variationSeed ?? variation?.seed ?? 42,
    songTime: state.songTime ?? 0,
  };
}

/** @param {number[]} point @param {number} songTime @param {number[]} euler @param {object} params */
export function applyLivingSongTilt(point, songTime, euler, params) {
  const m = params.turnScale * params.motionScale;
  const t = songTime ?? 0;
  return rotateEuler(point, euler[0] * m, euler[1] * m, euler[2] * m);
}

/** @param {number[]} point @param {object} params @param {number} [baseRadius] */
export function applyLivingSongWobble3d(point, params, baseRadius = 120) {
  if (params.wobbleAmt <= 0.001) return point;
  const bpm = bpmFromTempo(params.tempo);
  const audioStr = Math.min(1, params.pulse * 0.55 + params.energy * 0.75) * params.motionScale;
  return applySurfaceWobble(
    point,
    params.songTime,
    bpm,
    audioStr,
    params.wobbleAmt,
    params.variationSeed,
    baseRadius,
  );
}

/** @param {{ x: number, y: number }[]} points @param {object} params */
export function wobbleLivingSongPath2d(points, params) {
  if (params.wobbleAmt <= 0.001 || points.length < 2) return points;
  const bpm = bpmFromTempo(params.tempo);
  const audioStr = Math.min(1, params.pulse * 0.55 + params.energy * 0.75) * params.motionScale;
  const strength = params.wobbleAmt * (0.04 + audioStr * 0.96);
  const seed = params.variationSeed * 0.013;
  const timeScale = (params.songTime ?? 0) * (0.35 + bpm / 140);
  return points.map((p, i) => {
    const t = i / Math.max(1, points.length - 1);
    return {
      x: p.x + Math.sin(timeScale * 1.3 + t * 12 + seed) * strength * 18,
      y: p.y + Math.cos(timeScale * 1.1 + t * 10 + seed) * strength * 14,
    };
  });
}

/** Scale a scalar amplitude by 3D motion + activity (neutral @ default sliders). */
export function livingSongAmp(params) {
  return params.dim3Scale * params.motionScale;
}

/** Place each globe element as its own visible blob (Fibonacci sphere distribution). */
export function globeElementLayout(elementIndex, elementCount, pathSeed, baseRadius, orbitScale = 0.55) {
  const count = Math.max(1, elementCount | 0);
  if (count === 1) return { offset: [0, 0, 0], scale: 1 };

  const golden = (1 + Math.sqrt(5)) / 2;
  const i = elementIndex + 0.5;
  const phi = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * i) / count)));
  const theta = (2 * Math.PI * i) / golden;
  const orbitMul = count <= 3 ? 1.48 : count <= 6 ? 1.22 : 1;
  const orbit = baseRadius * orbitScale * orbitMul * (0.82 + Math.min(count, 24) * 0.028);
  const jitter = (((pathSeed ?? 1) % 97) / 97) * 0.22;
  const offset = [
    orbit * Math.sin(phi) * Math.cos(theta + jitter),
    orbit * Math.cos(phi) * 0.72,
    orbit * Math.sin(phi) * Math.sin(theta + jitter),
  ];
  const scale = Math.max(0.32, Math.min(0.78, 1.45 / Math.pow(count, 0.32)));
  return { offset, scale };
}

/** @param {number[][]} chain @param {{ offset: number[], scale: number }} layout */
export function positionGlobeElementChain(chain, layout) {
  const [ox, oy, oz] = layout.offset;
  const s = layout.scale;
  return chain.map(([x, y, z]) => [x * s + ox, y * s + oy, z * s + oz]);
}

/**
 * Rest layouts + soft balloon collision offsets for Living Song Globe.
 * @param {object} scene
 * @param {object} state
 * @param {object[]} rivers
 * @param {number} [mot]
 * @param {number} [motionDt]
 */
export function resolveGlobeLayoutsWithBalloons(scene, state, rivers, mot = 0.5, motionDt = 1 / 60) {
  const variation = scene.variation ?? {};
  const elementCount = rivers.length;
  const shapeR = globeRadius(scene.width, scene.height);
  const baseWidth = Math.max(6, scene.width * 0.0066);
  const { minGap, orbitScale } = elementDistanceRange(variation, shapeR);
  const key = `${elementCount}|${variation.elementDistanceFrom}|${variation.elementDistanceTo}|${variation.seed}|${Math.round(shapeR)}`;
  if (state.balloonKey !== key) {
    clearGlobeBalloonState(state);
    state.balloonKey = key;
  }
  const restLayouts = rivers.map((river, i) =>
    globeElementLayout(i, elementCount, river.pathSeed, shapeR, orbitScale),
  );
  const radii = restLayouts.map((layout, i) =>
    baseWidth * layout.scale * 2.6 * elementSizeMultiplier(variation, i, elementCount),
  );
  state.globeLayouts = stepGlobeBalloonLayouts(restLayouts, state, radii, minGap, mot, motionDt);
  return state.globeLayouts;
}
