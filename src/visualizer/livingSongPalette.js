/** Lava heat gradient — obsidian → embers → orange → lava yellow. */
export const LAVA_HEAT_STOPS = [
  { t: 0, r: 14, g: 10, b: 16 },
  { t: 0.22, r: 62, g: 16, b: 12 },
  { t: 0.48, r: 180, g: 52, b: 14 },
  { t: 0.72, r: 255, g: 108, b: 24 },
  { t: 1, r: 255, g: 228, b: 72 },
];

/** @param {number} t 0–1 @param {number} [glowBoost] bass-driven brighten */
export function lavaColorFromHeat(t, glowBoost = 0) {
  const heat = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < LAVA_HEAT_STOPS.length - 2 && heat > LAVA_HEAT_STOPS[i + 1].t) i++;
  const a = LAVA_HEAT_STOPS[i];
  const b = LAVA_HEAT_STOPS[i + 1];
  const span = b.t - a.t || 1;
  const f = (heat - a.t) / span;
  const boost = 1 + glowBoost * 0.85;
  const floor = 0.22 + glowBoost * 0.35;
  return {
    r: Math.min(255, Math.max(a.r, (a.r + (b.r - a.r) * f) * boost + floor * 40)),
    g: Math.min(255, Math.max(a.g, (a.g + (b.g - a.g) * f) * boost + floor * 18)),
    b: Math.min(255, Math.max(a.b, (a.b + (b.b - a.b) * f) * boost + floor * 8)),
  };
}

/** Mountain rock — deep obsidian to charred stone. */
export function mountainRockColor(height, slope) {
  const h = Math.min(1, Math.max(0, height));
  const s = Math.min(1, slope * 2.5);
  const t = h * 0.55 + s * 0.45;
  return {
    r: Math.round(8 + t * 38 + s * 12),
    g: Math.round(6 + t * 28 + s * 6),
    b: Math.round(12 + t * 32 + s * 8),
  };
}
