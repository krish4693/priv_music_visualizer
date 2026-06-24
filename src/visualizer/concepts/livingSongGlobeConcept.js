import { createRng } from '../sceneCore/layout.js';
import { resolveLivingElementCount } from '../elementMotion.js';
import { normalizeGlobeShapeMode } from '../globeShapeModes.js';
import { globeDetailParams, normalizeGlobeDetail } from '../globeDetail.js';
import { clearGlobeCapsuleFieldCache } from './globeCapsuleField.js';
import {
  livingSongRiverProgress,
  livingSongWidthScale,
  livingSongSegmentState,
  riverLagSeconds,
  riverSegmentDuration,
  rollRivers,
  clearRiverTemplateCache,
} from './visualLivingSongConcept.js';

/** @typedef {{ pathSeed: number, startX: number, startY: number, colorIdx: number, startDelaySec: number }} RiverConfig */

const globeTemplateCache = new Map();
const GLOBE_CACHE_MAX = 256;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function hash01(seed, salt = 0) {
  const h = ((seed * 73856093) ^ (salt * 19349663)) >>> 0;
  return (h & 0xffff) / 0xffff;
}

/** Base shape radius in scene units from canvas size. */
export function globeRadius(width, height) {
  return Math.min(width, height) * 0.36;
}

/** 0–1: shape emerges over the song — ~90% shell by 60% playhead. */
export function globeEmergence(songTime, songDuration) {
  if (!songDuration || songDuration <= 0) return 0;
  const t = Math.min(1, Math.max(0, (songTime ?? 0) / songDuration));
  if (t <= 0.06) return smoothstep(t / 0.06) * 0.1;
  const u = Math.min(1, (t - 0.06) / 0.54);
  const shell = smoothstep(u);
  const finish = t > 0.6 ? smoothstep((t - 0.6) / 0.4) : 0;
  return Math.min(1, 0.1 + shell * 0.8 + finish * 0.1);
}

function smoothstep(t) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function sphericalToCart(theta, phi, r) {
  const sinP = Math.sin(phi);
  return [
    r * sinP * Math.cos(theta),
    r * Math.cos(phi),
    r * sinP * Math.sin(theta),
  ];
}

function cartToSpherical(x, y, z) {
  const r = Math.hypot(x, y, z) || 1;
  return {
    theta: Math.atan2(z, x),
    phi: Math.acos(clamp(y / r, -1, 1)),
    r,
  };
}

function normalize3v([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function slerpUnit(a, b, t) {
  let dotab = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  dotab = clamp(dotab, -1, 1);
  const omega = Math.acos(dotab);
  if (omega < 1e-5) {
    return normalize3v([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }
  const sinOmega = Math.sin(omega);
  const w1 = Math.sin((1 - t) * omega) / sinOmega;
  const w2 = Math.sin(t * omega) / sinOmega;
  return [a[0] * w1 + b[0] * w2, a[1] * w1 + b[1] * w2, a[2] * w1 + b[2] * w2];
}

/** Long geodesic thread arcs on the sphere shell — few turns, smooth bands. */
function buildSphereThreadChain(theta, phi, steps, radius, rng) {
  /** @type {number[][]} */
  const chain = [];
  let i = 0;
  while (i < steps) {
    const bandLen = Math.min(32 + Math.floor(rng() * 18), steps - i);
    const endTheta = theta + (rng() - 0.5) * 1.5;
    const endPhi = clamp(phi + (rng() - 0.5) * 1.0, 0.1, Math.PI - 0.1);
    const startU = normalize3v(sphericalToCart(theta, phi, 1));
    const endU = normalize3v(sphericalToCart(endTheta, endPhi, 1));
    for (let k = 0; k < bandLen; k++) {
      const u = bandLen <= 1 ? 0 : k / (bandLen - 1);
      const [ux, uy, uz] = slerpUnit(startU, endU, u);
      const shellR = radius * (0.997 + rng() * 0.002);
      chain.push([ux * shellR, uy * shellR, uz * shellR]);
      i++;
    }
    theta = endTheta;
    phi = endPhi;
  }
  return chain;
}

/** @param {number} nx @param {number} ny @param {number} nz @param {import('../globeShapeModes.js').GlobeShapeMode} shapeId @param {number} targetR @param {number} pathSeed @param {number} pointIndex */
export function projectToShapeShell(nx, ny, nz, shapeId, targetR, pathSeed = 0, pointIndex = 0) {
  switch (shapeId) {
    case 'ellipsoid': {
      const ax = 1.0;
      const ay = 1.38;
      const az = 0.82;
      const t = targetR / Math.sqrt((nx / ax) ** 2 + (ny / ay) ** 2 + (nz / az) ** 2);
      return [nx * t, ny * t, nz * t];
    }
    case 'blob': {
      const bump =
        1 +
        (hash01(pathSeed, pointIndex * 11) - 0.5) * 0.24 +
        Math.sin(pointIndex * 0.37 + pathSeed * 0.02) * 0.1;
      const t = targetR * bump;
      return [nx * t, ny * t, nz * t];
    }
    case 'cube': {
      const e = 0.42;
      const t = targetR * (Math.abs(nx) ** e + Math.abs(ny) ** e + Math.abs(nz) ** e) ** (-1 / e);
      return [nx * t, ny * t, nz * t];
    }
    default:
      return [nx * targetR, ny * targetR, nz * targetR];
  }
}

function morphTorusPoint(x, y, z, e2, majorR, pathSeed, i) {
  const minorR = majorR * 0.38;
  const distXZ = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const ringDist = distXZ - majorR;
  const phi = Math.atan2(y, ringDist || minorR * 0.01);
  const wildMinor = Math.hypot(y, ringDist) || minorR * 0.4;
  const chaos = (hash01(pathSeed, i * 19) - 0.5) * minorR * 0.55;
  const shellMinor = minorR + (hash01(pathSeed, i * 7) - 0.5) * minorR * 0.1;
  const rTube = (wildMinor + chaos) * (1 - e2) + shellMinor * e2;
  const cx = majorR + rTube * Math.cos(phi);
  return [cx * Math.cos(theta), rTube * Math.sin(phi), cx * Math.sin(theta)];
}

/**
 * Wild random walk on / near a shape surface — irregular, not grid lines.
 * @param {number} pathSeed
 * @param {number} colorIdx
 * @param {number} segmentIndex
 * @param {number} radius
 * @param {import('../globeShapeModes.js').GlobeShapeMode} shapeId
 * @param {number} [detail]
 * @param {number[]|null} [continueFrom]
 * @returns {number[][]}
 */
export function buildWildShapeChain(pathSeed, colorIdx, segmentIndex, radius, shapeId, detail = 50, continueFrom = null) {
  if (shapeId === 'torus') return buildWildTorusChain(pathSeed, colorIdx, segmentIndex, radius, detail, continueFrom);

  const { stepsMin, stepsRange } = globeDetailParams(detail);
  const rng = createRng((pathSeed + segmentIndex * 15937 + colorIdx * 4099) >>> 0);
  const steps = stepsMin + Math.floor(rng() * stepsRange);
  /** @type {number[][]} */
  const chain = [];

  let theta;
  let phi;
  if (continueFrom) {
    const s = cartToSpherical(continueFrom[0], continueFrom[1], continueFrom[2]);
    theta = s.theta + (rng() - 0.5) * 0.55;
    phi = clamp(s.phi + (rng() - 0.5) * 0.4, 0.1, Math.PI - 0.1);
  } else {
    theta = rng() * Math.PI * 2;
    phi = Math.acos(2 * rng() - 1);
  }

  if (shapeId === 'sphere') {
    return buildSphereThreadChain(theta, phi, steps, radius, rng);
  }

  for (let i = 0; i < steps; i++) {
    const wobble = (rng() - 0.5) * 0.38 + Math.sin(i * 0.31 + pathSeed * 0.01) * 0.22;

    theta += (rng() - 0.5) * 0.78;
    phi = clamp(phi + (rng() - 0.5) * 0.58, 0.08, Math.PI - 0.08);
    const r = radius * (0.55 + rng() * 0.95 + wobble * 0.35);

    if (shapeId === 'ellipsoid') {
      const [x, y, z] = sphericalToCart(theta, phi, r);
      chain.push([x, y * 1.38, z * 0.82]);
    } else if (shapeId === 'cube') {
      const [x, y, z] = sphericalToCart(theta, phi, 1);
      const e = 0.42;
      const t = (Math.abs(x) ** e + Math.abs(y) ** e + Math.abs(z) ** e) ** (-1 / e);
      const wildR = r * (0.55 + rng() * 0.95 + wobble * 0.35);
      chain.push([x * t * wildR, y * t * wildR, z * t * wildR]);
    } else if (shapeId === 'blob') {
      const bump = 1 + Math.sin(i * 0.41 + pathSeed * 0.013) * 0.28 + (rng() - 0.5) * 0.35;
      chain.push(sphericalToCart(theta, phi, r * bump));
    } else {
      chain.push(sphericalToCart(theta, phi, r));
    }
  }
  return chain;
}

/** @param {number[]|null} [continueFrom] */
function buildWildTorusChain(pathSeed, colorIdx, segmentIndex, majorR, detail = 50, continueFrom = null) {
  const { stepsMin, stepsRange } = globeDetailParams(detail);
  const rng = createRng((pathSeed + segmentIndex * 15937 + colorIdx * 4099) >>> 0);
  const minorR = majorR * 0.38;
  const steps = stepsMin + Math.floor(rng() * stepsRange);
  /** @type {number[][]} */
  const chain = [];

  let theta;
  let phi;
  if (continueFrom) {
    const x = continueFrom[0];
    const y = continueFrom[1];
    const z = continueFrom[2];
    theta = Math.atan2(z, x) + (rng() - 0.5) * 0.55;
    const distXZ = Math.hypot(x, z);
    phi = Math.atan2(y, distXZ - majorR) + (rng() - 0.5) * 0.4;
  } else {
    theta = rng() * Math.PI * 2;
    phi = rng() * Math.PI * 2;
  }

  for (let i = 0; i < steps; i++) {
    theta += (rng() - 0.5) * 0.72;
    phi += (rng() - 0.5) * 0.68;
    const wobble = (rng() - 0.5) * 0.38 + Math.sin(i * 0.31 + pathSeed * 0.01) * 0.22;
    const rTube = minorR * (0.45 + rng() * 1.05 + wobble * 0.4);
    const cx = majorR + rTube * Math.cos(phi);
    chain.push([cx * Math.cos(theta), rTube * Math.sin(phi), cx * Math.sin(theta)]);
  }
  return chain;
}

function cachedShapeChain(pathSeed, colorIdx, segmentIndex, radius, shapeId, detail, continueFrom) {
  const contKey = continueFrom
    ? `${continueFrom[0].toFixed(1)}|${continueFrom[1].toFixed(1)}|${continueFrom[2].toFixed(1)}`
    : 'start';
  const key = `${shapeId}|${detail}|${pathSeed}|${colorIdx}|${segmentIndex}|${Math.round(radius)}|${contKey}`;
  let chain = globeTemplateCache.get(key);
  if (!chain) {
    chain = buildWildShapeChain(pathSeed, colorIdx, segmentIndex, radius, shapeId, detail, continueFrom);
    globeTemplateCache.set(key, chain);
    if (globeTemplateCache.size > GLOBE_CACHE_MAX) {
      globeTemplateCache.delete(globeTemplateCache.keys().next().value);
    }
  }
  return chain;
}

/** Pull scattered early paths toward a shared shape shell as the song progresses. */
export function morphChainEmergence(chain, emergence, pathSeed, targetR, shapeId = 'sphere') {
  const e = clamp(emergence ?? 0, 0, 1);
  const blend = smoothstep(e);
  const chaosFade = (1 - e) * (1 - e);
  const shape = normalizeGlobeShapeMode(shapeId);

  if (shape === 'torus') {
    return chain.map(([x, y, z], i) => morphTorusPoint(x, y, z, blend, targetR, pathSeed, i));
  }

  return chain.map(([x, y, z], i) => {
    const r = Math.hypot(x, y, z) || 1;
    const nx = x / r;
    const ny = y / r;
    const nz = z / r;
    const chaos = (hash01(pathSeed, i * 19) - 0.5) * 2 * chaosFade;
    const wildR = targetR * (0.55 + hash01(pathSeed, i * 7) * 0.45 + chaos * 0.22);
    const [sx, sy, sz] = projectToShapeShell(nx, ny, nz, shape, targetR, pathSeed, i);
    const shellR = Math.hypot(sx, sy, sz);
    const shellNx = sx / shellR;
    const shellNy = sy / shellR;
    const shellNz = sz / shellR;
    const shellDist = shellR + chaos * targetR * 0.05 * chaosFade;
    if (shape === 'sphere' && e >= 0.82) {
      return [shellNx * targetR, shellNy * targetR, shellNz * targetR];
    }
    const R = wildR * (1 - blend) + shellDist * blend;
    return [shellNx * R, shellNy * R, shellNz * R];
  });
}

/**
 * Segment state for one of N interleaved globe threads (durcheinander).
 * Each lane is phase-offset within the segment cycle so threads weave in turn.
 */
export function livingSongGlobeThreadSegmentState(songTime, animationSpeed, songDuration, river) {
  const lanePhase = river.globeLanePhase ?? 0;
  if (lanePhase <= 0) {
    return livingSongSegmentState(songTime, animationSpeed, songDuration, river);
  }

  const lagSec = riverLagSeconds(river, songDuration);
  const laggedTime = Math.max(0, (songTime ?? 0) - lagSec);
  if (laggedTime <= 0) {
    return { started: false, currentSeg: 0, localProgress: 0, complete: false, laggedTime: 0 };
  }

  const anim = Math.max(0.25, animationSpeed ?? 1);
  const segDur = riverSegmentDuration(songDuration, animationSpeed) * (river.segmentDurationMul ?? 1);
  const phaseSec = lanePhase * segDur;
  const atEnd = songDuration > 0 && (songTime ?? 0) >= songDuration;
  const cappedLagged = songDuration > 0
    ? Math.max(0, Math.min(songTime ?? 0, songDuration) - lagSec)
    : laggedTime;
  const effectiveTime = (atEnd ? cappedLagged * anim : laggedTime * anim) - phaseSec;
  if (effectiveTime <= 0 && !atEnd) {
    return { started: false, currentSeg: 0, localProgress: 0, complete: false, laggedTime };
  }

  const currentSeg = Math.max(0, Math.floor(effectiveTime / segDur));
  const localProgress = atEnd ? 1 : Math.min(1, (effectiveTime % segDur) / segDur);
  return { started: true, currentSeg, localProgress, complete: atEnd, laggedTime };
}

/** @returns {{ started: boolean, localProgress: number, laggedTime: number, complete: boolean }} */
export function livingSongGlobeThreadProgress(songTime, animationSpeed, songDuration, river) {
  const state = livingSongGlobeThreadSegmentState(songTime, animationSpeed, songDuration, river);
  return {
    started: state.started,
    localProgress: state.localProgress,
    laggedTime: state.laggedTime,
    complete: state.complete,
  };
}

/** @param {number[][]} points @param {number} progress 0–1 */
export function slice3DChain(points, progress) {
  if (points.length < 2) return [];
  if (progress <= 0) return [];
  if (progress >= 1) return points;

  const floatIdx = progress * (points.length - 1);
  const idx = Math.max(1, Math.floor(floatIdx));
  const frac = floatIdx - Math.floor(floatIdx);
  const slice = points.slice(0, idx + 1);
  if (frac > 0.001 && idx + 1 < points.length) {
    const a = points[idx];
    const b = points[idx + 1];
    slice.push([
      a[0] + (b[0] - a[0]) * frac,
      a[1] + (b[1] - a[1]) * frac,
      a[2] + (b[2] - a[2]) * frac,
    ]);
  }
  return slice.length >= 2 ? slice : [];
}

/**
 * Shape path chains in 3D (multiple segments, active slice).
 * @returns {{ chains: number[][][], emergence: number }}
 */
export function livingSongGlobePaths(width, height, songTime, animationSpeed, songDuration, river, shapeId = 'sphere', detail = 50) {
  const progress = river.globeLanePhase != null
    ? livingSongGlobeThreadProgress(songTime, animationSpeed, songDuration, river)
    : livingSongRiverProgress(songTime, animationSpeed, songDuration, river);
  if (!progress.started) return { chains: [], emergence: 0 };

  const { currentSeg, localProgress, complete } = livingSongGlobeThreadSegmentState(
    songTime,
    animationSpeed,
    songDuration,
    river,
  );

  const emergence = globeEmergence(Math.min(songTime ?? 0, songDuration || Infinity), songDuration);
  const R = globeRadius(width, height);
  const colorIdx = river.colorIdx ?? 0;
  const pathSeed = river.pathSeed ?? 42;
  const shape = normalizeGlobeShapeMode(shapeId);
  const detailLevel = normalizeGlobeDetail(detail);

  /** @type {number[][][]} */
  const chains = [];
  /** @type {number[]|null} */
  let prevEnd = null;

  for (let s = 0; s < currentSeg; s++) {
    const raw = cachedShapeChain(pathSeed, colorIdx, s, R, shape, detailLevel, prevEnd);
    const morphed = morphChainEmergence(raw, emergence, pathSeed + s * 31, R, shape);
    chains.push(morphed);
    const last = morphed[morphed.length - 1];
    prevEnd = last ?? prevEnd;
  }

  const activeRaw = cachedShapeChain(pathSeed, colorIdx, currentSeg, R, shape, detailLevel, prevEnd);
  const activeMorphed = morphChainEmergence(activeRaw, emergence, pathSeed + currentSeg * 31, R, shape);
  if (complete) {
    if (activeMorphed.length >= 2) chains.push(activeMorphed);
  } else {
    const activeSlice = slice3DChain(activeMorphed, localProgress);
    if (activeSlice.length >= 2) chains.push(activeSlice);
  }

  return { chains, emergence };
}

export function clearGlobeTemplateCache() {
  globeTemplateCache.clear();
}

export { livingSongRiverProgress, livingSongWidthScale, rollRivers, clearRiverTemplateCache };

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initVisualLivingSongGlobe(ctx) {
  const variationSeed = ctx.variation?.seed ?? 42;
  const rng = createRng(variationSeed + 8803);
  const colorCount = resolveLivingElementCount(ctx.variation, ctx.palette?.length ?? 2);
  return {
    entities: [],
    state: {
      beatPulse: 0,
      songTime: 0,
      songDuration: 0,
      animationSpeed: 1,
      variationSeed,
      sessionRoll: 0,
      paletteColorCount: Math.max(1, colorCount),
      rivers: rollRivers(variationSeed, rng, colorCount),
    },
  };
}

export {
  updateVisualLivingSong as updateVisualLivingSongGlobe,
} from './visualLivingSongConcept.js';

/** @param {object} state @param {() => number} [rng] @param {number} [colorCount] */
export function resetLivingSongGlobe(state, rng = Math.random, colorCount) {
  const rollRng = createRng(((state.variationSeed ?? 42) + ((state.sessionRoll ?? 0) + 1) * 9973) >>> 0);
  const count = colorCount ?? state.paletteColorCount ?? 2;
  state.beatPulse = 0;
  state.smoothBeatPulse = 0;
  state.smoothEnergy = 0;
  state.songTime = 0;
  state.sessionRoll = (state.sessionRoll ?? 0) + 1;
  clearRiverTemplateCache();
  clearGlobeTemplateCache();
  clearGlobeCapsuleFieldCache();
  state.rivers = rollRivers(state.variationSeed, rollRng, count);
  state.paletteColorCount = Math.max(1, count);
}

// Backward-compatible alias
export const buildWildGlobeChain = buildWildShapeChain;
