/** Lightweight 3D value noise for surface "wabern" displacement. */

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function hash3(ix, iy, iz, seed) {
  let h = (ix * 374761393 + iy * 668265263 + iz * 1274126177 + seed * 1013904223) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = (h * 1274126177) >>> 0;
  return (h ^ (h >>> 16)) / 4294967296;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function noise3(x, y, z, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const fx = fade(x - x0);
  const fy = fade(y - y0);
  const fz = fade(z - z0);

  const n000 = hash3(x0, y0, z0, seed);
  const n100 = hash3(x0 + 1, y0, z0, seed);
  const n010 = hash3(x0, y0 + 1, z0, seed);
  const n110 = hash3(x0 + 1, y0 + 1, z0, seed);
  const n001 = hash3(x0, y0, z0 + 1, seed);
  const n101 = hash3(x0 + 1, y0, z0 + 1, seed);
  const n011 = hash3(x0, y0 + 1, z0 + 1, seed);
  const n111 = hash3(x0 + 1, y0 + 1, z0 + 1, seed);

  const x00 = lerp(n000, n100, fx);
  const x10 = lerp(n010, n110, fx);
  const x01 = lerp(n001, n101, fx);
  const x11 = lerp(n011, n111, fx);
  const y0v = lerp(x00, x10, fy);
  const y1v = lerp(x01, x11, fy);
  return lerp(y0v, y1v, fz) * 2 - 1;
}

/**
 * Radial + tangential surface displacement (blocks stay attached to form).
 * @param {number[]} point [x,y,z]
 * @param {number} songTime
 * @param {number} bpm
 * @param {number} audioStrength 0–1 (RMS / beat)
 * @param {number} strength 0–1 user wobble amount
 * @param {number} seed
 * @param {number} baseRadius
 * @returns {number[]}
 */
export function applySurfaceWobble(point, songTime, bpm, audioStrength, strength, seed, baseRadius) {
  if (strength <= 0.001) return point;

  const [x, y, z] = point;
  const len = Math.hypot(x, y, z) || 1;
  const nx = x / len;
  const ny = y / len;
  const nz = z / len;

  const timeScale = (songTime ?? 0) * (0.35 + bpm / 140);
  const s = (seed ?? 42) * 0.013;
  const freq = 1.4 + bpm * 0.004;

  const n1 = noise3(x * freq * 0.08 + s, y * freq * 0.08, z * freq * 0.08 + timeScale, seed);
  const n2 = noise3(x * freq * 0.14 + timeScale * 0.6, y * freq * 0.12, z * freq * 0.14, seed + 17);
  const n3 = noise3(x * freq * 0.05, y * freq * 0.05 + timeScale * 0.4, z * freq * 0.05 + s, seed + 41);
  const combined = n1 * 0.5 + n2 * 0.32 + n3 * 0.18;

  const amp = baseRadius * strength * (0.04 + audioStrength * 0.14);
  const radial = combined * amp;
  const tangX = Math.sin(timeScale * 1.3 + x * 0.12 + s) * amp * 0.45;
  const tangY = Math.sin(combined * Math.PI * 2 + timeScale) * amp * 0.55;
  const tangZ = Math.cos(timeScale * 1.1 + z * 0.11 + s) * amp * 0.45;

  return [
    x + nx * radial + tangX,
    y + ny * radial + tangY,
    z + nz * radial + tangZ,
  ];
}
