import { normalizeElementSizePercent, elementSizeMultiplier } from './elementMotion.js';

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/**
 * Map From/To sliders (0–100) to min gap and orbit spread.
 * @param {import('./variationStore.js').VariationSettings|object} [variation]
 * @param {number} [baseScale] radius-like scene scale
 */
export function elementDistanceRange(variation, baseScale = 120) {
  const fromP = normalizeElementSizePercent(variation?.elementDistanceFrom ?? 42);
  const toP = normalizeElementSizePercent(variation?.elementDistanceTo ?? 74);
  const minP = Math.min(fromP, toP);
  const maxP = Math.max(fromP, toP);
  const scale = Math.max(20, baseScale);
  const minGap = scale * (0.035 + (minP / 100) * 0.38);
  const orbitScale = 0.22 + (maxP / 100) * 0.88;
  return { minGap, orbitScale, minP, maxP };
}

/**
 * @typedef {{ offset: number[], scale: number }} GlobeElementLayout
 * @typedef {{ x: number, y: number, z: number, vx: number, vy: number, vz: number, restX: number, restY: number, restZ: number, radius: number }} BalloonBody
 */

/**
 * @param {GlobeElementLayout[]} restLayouts
 * @param {number[]} radii
 * @param {number} minGap
 * @param {number} [mot]
 * @param {number} [motionDt]
 * @returns {GlobeElementLayout[]}
 */
export function stepGlobeBalloonLayouts(restLayouts, state, radii, minGap, mot = 0.5, motionDt = 1 / 60) {
  const n = restLayouts.length;
  if (!n) return [];

  if (!state.globeBalloons || state.globeBalloons.length !== n) {
    state.globeBalloons = restLayouts.map((layout, i) => ({
      x: layout.offset[0],
      y: layout.offset[1],
      z: layout.offset[2],
      vx: 0,
      vy: 0,
      vz: 0,
      restX: layout.offset[0],
      restY: layout.offset[1],
      restZ: layout.offset[2],
      radius: radii[i] ?? 1,
    }));
  }

  const bodies = state.globeBalloons;
  const spring = 0.028 + mot * 0.05;
  const damp = 0.84;
  const repulse = 0.3 + mot * 0.28;
  const dt = Math.min(0.05, Math.max(0.001, motionDt)) * 60;

  for (let i = 0; i < n; i++) {
    const layout = restLayouts[i];
    const b = bodies[i];
    b.restX = layout.offset[0];
    b.restY = layout.offset[1];
    b.restZ = layout.offset[2];
    b.radius = radii[i] ?? b.radius ?? 1;
    b.vx += (b.restX - b.x) * spring;
    b.vy += (b.restY - b.y) * spring;
    b.vz += (b.restZ - b.z) * spring;
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dy, dz) || 0.001;
      const minDist = a.radius + b.radius + minGap;
      if (dist < minDist) {
        const overlap = (minDist - dist) * repulse * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        a.vx -= nx * overlap;
        a.vy -= ny * overlap;
        a.vz -= nz * overlap;
        b.vx += nx * overlap;
        b.vy += ny * overlap;
        b.vz += nz * overlap;
      }
    }
  }

  return restLayouts.map((layout, i) => {
    const b = bodies[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.vx *= damp;
    b.vy *= damp;
    b.vz *= damp;
    return {
      offset: [b.x, b.y, b.z],
      scale: layout.scale,
    };
  });
}

/** Soft balloon separation for 2D/3D scene shapes (geometric + entity concepts). */
export function applyShapeBalloonSeparation(shapes, variation, mot, motionDt, width, height) {
  if (!shapes?.length) return;
  const baseSep = (width + height) * 0.02;
  const { minGap } = elementDistanceRange(variation, baseSep);
  const spring = 0.032 + mot * 0.04;
  const damp = 0.86;
  const repulse = 0.24 + mot * 0.32;
  const dt = Math.min(0.05, Math.max(0.001, motionDt)) * 60;

  for (const s of shapes) {
    if (s.balloonVx == null) {
      s.balloonVx = 0;
      s.balloonVy = 0;
      s.balloonVz = 0;
    }
    s.balloonX = s.balloonX ?? 0;
    s.balloonY = s.balloonY ?? 0;
    s.balloonZ = s.balloonZ ?? 0;
    s.balloonVx += -s.balloonX * spring;
    s.balloonVy += -s.balloonY * spring;
    s.balloonVz += -s.balloonZ * spring;
  }

  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i];
      const b = shapes[j];
      const ax = a.x + (a.wobbleX ?? 0) + (a.balloonX ?? 0);
      const ay = a.y + (a.wobbleY ?? 0) + (a.balloonY ?? 0);
      const az = (a.z ?? 0) + (a.wobbleZ ?? 0) + (a.balloonZ ?? 0);
      const bx = b.x + (b.wobbleX ?? 0) + (b.balloonX ?? 0);
      const by = b.y + (b.wobbleY ?? 0) + (b.balloonY ?? 0);
      const bz = (b.z ?? 0) + (b.wobbleZ ?? 0) + (b.balloonZ ?? 0);
      const dx = bx - ax;
      const dy = by - ay;
      const dz = bz - az;
      const dist = Math.hypot(dx, dy, dz * 0.65) || 0.001;
      const ra = 28 * (a.sizeMul ?? 1) * (a.scale ?? 1);
      const rb = 28 * (b.sizeMul ?? 1) * (b.scale ?? 1);
      const minDist = ra + rb + minGap;
      if (dist < minDist) {
        const push = (minDist - dist) * repulse * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;
        const nz = dz / dist;
        a.balloonVx -= nx * push;
        a.balloonVy -= ny * push;
        a.balloonVz -= nz * push * 0.7;
        b.balloonVx += nx * push;
        b.balloonVy += ny * push;
        b.balloonVz += nz * push * 0.7;
      }
    }
  }

  for (const s of shapes) {
    s.balloonX += s.balloonVx * dt;
    s.balloonY += s.balloonVy * dt;
    s.balloonZ += s.balloonVz * dt;
    s.balloonVx *= damp;
    s.balloonVy *= damp;
    s.balloonVz *= damp;
    const maxBalloon = 42 + (variation?.layoutSpread ?? 42) * 0.45 + minGap * 0.35;
    s.balloonX = clamp(s.balloonX, -maxBalloon, maxBalloon);
    s.balloonY = clamp(s.balloonY, -maxBalloon, maxBalloon);
    s.balloonZ = clamp(s.balloonZ, -maxBalloon * 0.6, maxBalloon * 0.6);
  }
}

export function clearGlobeBalloonState(state) {
  if (!state) return;
  state.globeBalloons = null;
  state.globeLayouts = null;
  state.balloonKey = null;
}
