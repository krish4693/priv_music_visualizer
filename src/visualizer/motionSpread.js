/** @param {() => number} rng @param {number} randomRange @param {number} spinMul @param {number} spread 0–1 */
export function spreadSpinAxis(rng, randomRange, spinMul, spread) {
  const s = Math.min(1, Math.max(0, spread));
  const random = (rng() - 0.5) * randomRange * spinMul;
  const unified = randomRange * spinMul * 0.5 * (1 - s);
  return unified + random * s;
}

/** @param {() => number} rng @param {number} randomRange @param {number} spread 0–1 @param {number} [mul=1] */
export function spreadDriftAxis(rng, randomRange, spread, mul = 1) {
  const s = Math.min(1, Math.max(0, spread));
  const random = (rng() - 0.5) * randomRange * mul;
  const unified = randomRange * 0.5 * mul * (1 - s);
  return unified + random * s;
}
