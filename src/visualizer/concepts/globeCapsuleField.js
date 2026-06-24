import { createRng } from '../sceneCore/layout.js';
import { normalizeGlobeDetail } from '../globeDetail.js';

const fieldCache = new Map();
const FIELD_CACHE_MAX = 48;

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

function hash01(seed, salt = 0) {
  const h = ((seed * 73856093) ^ (salt * 19349663)) >>> 0;
  return (h & 0xffff) / 0xffff;
}

/** Capsule count per sphere — dense packed shell (reference end state). */
export function globeCapsuleCount(detail = 50, objectCount = 1) {
  const d = normalizeGlobeDetail(detail) / 100;
  const perSphere = Math.round(520 + d * 980);
  if (objectCount <= 1) return clamp(perSphere, 600, 1800);
  const spread = Math.max(1, objectCount);
  return clamp(Math.round(perSphere / Math.pow(spread, 0.18)), 480, 1200);
}

/**
 * @typedef {{ nx: number, ny: number, nz: number, tx: number, ty: number, tz: number, colorIdx: number, rank: number, radiusMul: number, lengthMul: number }} GlobeCapsule
 */

/** Fibonacci-sphere capsules with mixed colors, sorted for progressive paint. */
export function getGlobeCapsuleField(pathSeed, detail, paletteLen, objectCount = 1) {
  const count = globeCapsuleCount(detail, objectCount);
  const colors = Math.max(1, paletteLen | 0);
  const key = `${pathSeed}|${count}|${colors}|len2`;
  let field = fieldCache.get(key);
  if (field) return field;

  const rng = createRng((pathSeed * 2654435761) >>> 0);
  const golden = (1 + Math.sqrt(5)) / 2;
  /** @type {GlobeCapsule[]} */
  const capsules = [];

  for (let i = 0; i < count; i++) {
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = (2 * Math.PI * i) / golden + (rng() - 0.5) * 0.14;
    const nx = Math.sin(phi) * Math.cos(theta);
    const ny = Math.cos(phi);
    const nz = Math.sin(phi) * Math.sin(theta);

    let ux = -Math.sin(theta);
    let uy = 0;
    let uz = Math.cos(theta);
    const dotUN = ux * nx + uy * ny + uz * nz;
    ux -= dotUN * nx;
    uy -= dotUN * ny;
    uz -= dotUN * nz;
    const uLen = Math.hypot(ux, uy, uz) || 1;
    ux /= uLen;
    uy /= uLen;
    uz /= uLen;

    const spin = hash01(pathSeed, i * 41) * Math.PI * 2;
    const c = Math.cos(spin);
    const s = Math.sin(spin);
    const tx = ux * c + (uy * nz - uz * ny) * s;
    const ty = uy * c + (uz * nx - ux * nz) * s;
    const tz = uz * c + (ux * ny - uy * nx) * s;

    const colorIdx = Math.floor(hash01(pathSeed, i * 17 + 3) * colors) % colors;
    const radiusMul = 0.9 + hash01(pathSeed, i * 29) * 0.22;
    const lengthMul = 1.4 + hash01(pathSeed, i * 53) * 1.35;
    const rank = Math.floor(hash01(pathSeed, i * 97 + 11) * count);

    capsules.push({ nx, ny, nz, tx, ty, tz, colorIdx, rank, radiusMul, lengthMul });
  }

  capsules.sort((a, b) => a.rank - b.rank);
  fieldCache.set(key, capsules);
  if (fieldCache.size > FIELD_CACHE_MAX) {
    fieldCache.delete(fieldCache.keys().next().value);
  }
  return capsules;
}

/** 0–1 how many capsules are visible (fills sphere over the song). */
export function globeCapsulePaintProgress(songTime, songDuration, startDelayRatio = 0) {
  if (!songDuration || songDuration <= 0) return 0;
  const lag = (startDelayRatio ?? 0) * songDuration;
  const t = Math.max(0, (songTime ?? 0) - lag);
  const u = clamp(t / Math.max(1, songDuration - lag), 0, 1);
  if (u <= 0.02) return 0;
  const shifted = clamp((u - 0.02) / 0.95, 0, 1);
  const eased = shifted * shifted * (3 - 2 * shifted);
  return Math.min(1, eased * 1.01);
}

export function clearGlobeCapsuleFieldCache() {
  fieldCache.clear();
}
