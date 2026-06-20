const BEZ_K = 0.5522847498;

/** Normalized half-extents (0–1 relative to min(canvas w,h)/2). */
export const SHAPE_KEYFRAMES = [
  { rx: 0.92, ry: 0.62, round: 0.03 },
  { rx: 0.55, ry: 0.55, round: 0.06 },
  { rx: 0.68, ry: 0.68, round: 1 },
  { rx: 0.48, ry: 0.48, round: 0.02, diamond: true },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function shapeParamsAt(phase) {
  const n = SHAPE_KEYFRAMES.length;
  const f = ((phase % 1) + 1) % 1 * n;
  const i = Math.floor(f) % n;
  const j = (i + 1) % n;
  const t = easeInOut(f - i);
  const a = SHAPE_KEYFRAMES[i];
  const b = SHAPE_KEYFRAMES[j];
  return {
    rx: lerp(a.rx, b.rx, t),
    ry: lerp(a.ry, b.ry, t),
    round: lerp(a.round, b.round, t),
    diamond: t < 0.5 ? a.diamond : b.diamond,
  };
}

/**
 * Trace a closed morph path centred at 0,0.
 */
export function traceMorphPath(ctx, params, unit) {
  const rx = params.rx * unit;
  const ry = params.ry * unit;

  if (params.diamond) {
    ctx.moveTo(0, -ry);
    ctx.lineTo(rx, 0);
    ctx.lineTo(0, ry);
    ctx.lineTo(-rx, 0);
    ctx.closePath();
    return;
  }

  if (params.round >= 0.88) {
    ctx.moveTo(0, -ry);
    ctx.bezierCurveTo(rx * BEZ_K, -ry, rx, -ry * BEZ_K, rx, 0);
    ctx.bezierCurveTo(rx, ry * BEZ_K, rx * BEZ_K, ry, 0, ry);
    ctx.bezierCurveTo(-rx * BEZ_K, ry, -rx, ry * BEZ_K, -rx, 0);
    ctx.bezierCurveTo(-rx, -ry * BEZ_K, -rx * BEZ_K, -ry, 0, -ry);
    ctx.closePath();
    return;
  }

  const cr = params.round * Math.min(rx, ry) * 0.85;
  if (cr < 2) {
    ctx.rect(-rx, -ry, rx * 2, ry * 2);
    return;
  }

  ctx.moveTo(-rx + cr, -ry);
  ctx.lineTo(rx - cr, -ry);
  ctx.quadraticCurveTo(rx, -ry, rx, -ry + cr);
  ctx.lineTo(rx, ry - cr);
  ctx.quadraticCurveTo(rx, ry, rx - cr, ry);
  ctx.lineTo(-rx + cr, ry);
  ctx.quadraticCurveTo(-rx, ry, -rx, ry - cr);
  ctx.lineTo(-rx, -ry + cr);
  ctx.quadraticCurveTo(-rx, -ry, -rx + cr, -ry);
  ctx.closePath();
}
