import { DEFAULT_BG } from '../backgroundStore.js';
import { createRng } from './layout.js';

const BASE_STAR_COUNT = 180;

/** Deep space palette — not derived from a light user bg color. */
const SPACE_CORE = { r: 14, g: 16, b: 32 };
const SPACE_MID = { r: 8, g: 10, b: 22 };
const SPACE_EDGE = { r: 3, g: 4, b: 10 };

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** @param {string} hex */
function parseHex(hex) {
  const raw = (hex || DEFAULT_BG).replace('#', '').trim();
  if (raw.length === 3) {
    return {
      r: parseInt(raw[0] + raw[0], 16),
      g: parseInt(raw[1] + raw[1], 16),
      b: parseInt(raw[2] + raw[2], 16),
    };
  }
  if (raw.length >= 6) {
    return {
      r: parseInt(raw.slice(0, 2), 16),
      g: parseInt(raw.slice(2, 4), 16),
      b: parseInt(raw.slice(4, 6), 16),
    };
  }
  return { r: 16, g: 16, b: 24 };
}

/** @param {{ r: number, g: number, b: number }} rgb */
function luminance(rgb) {
  return (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
}

/** @param {{ r: number, g: number, b: number }} a @param {{ r: number, g: number, b: number }} b @param {number} t */
function mixRgb(a, b, t) {
  const u = Math.min(1, Math.max(0, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * u),
    g: Math.round(a.g + (b.g - a.g) * u),
    b: Math.round(a.b + (b.b - a.b) * u),
  };
}

function rgba({ r, g, b }, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** @param {number} seed @param {number} [backgroundDepth] 0–100 */
function buildStarField(seed, backgroundDepth = 50) {
  const depth = clamp(Number(backgroundDepth) ?? 50, 0, 100) / 100;
  const count = Math.round(50 + depth * 420);
  const brightness = 0.28 + depth * 0.92;
  const rng = createRng((seed >>> 0) + 90210);
  /** @type {{ nx: number, ny: number, depth: number, size: number, alpha: number, cool: boolean }[]} */
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      nx: rng(),
      ny: rng(),
      depth: 0.15 + rng() * 0.85,
      size: (0.45 + rng() * 1.1) * (0.75 + depth * 0.55),
      alpha: (0.12 + rng() * 0.55) * brightness,
      cool: rng() < 0.28,
    });
  }
  stars.sort((a, b) => b.depth - a.depth);
  return stars;
}

/** @type {Map<string, ReturnType<typeof buildStarField>>} */
const starCache = new Map();

/** @param {number} seed @param {number} [backgroundDepth] */
function getStarField(seed, backgroundDepth = 50) {
  const depthKey = Math.round(clamp(Number(backgroundDepth) ?? 50, 0, 100));
  const key = `${seed >>> 0}|${depthKey}`;
  let field = starCache.get(key);
  if (!field) {
    field = buildStarField(seed, depthKey);
    starCache.set(key, field);
    if (starCache.size > 24) starCache.delete(starCache.keys().next().value);
  }
  return field;
}

/** @param {string} [bgColor] */
function spacePalette(bgColor) {
  const user = parseHex(bgColor);
  if (luminance(user) > 0.22) {
    return { core: SPACE_CORE, mid: SPACE_MID, edge: SPACE_EDGE };
  }
  const tint = 0.22;
  return {
    core: mixRgb(SPACE_CORE, user, tint),
    mid: mixRgb(SPACE_MID, user, tint * 0.7),
    edge: mixRgb(SPACE_EDGE, user, tint * 0.4),
  };
}

/**
 * Subtle deep-space backdrop — dark void, faint stars, slow parallax.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} width
 * @param {number} height
 * @param {{ songTime?: number, seed?: number, bgColor?: string, backgroundDepth?: number }} [opts]
 */
export function drawSpaceBackground(ctx, width, height, opts = {}) {
  const songTime = opts.songTime ?? 0;
  const seed = opts.seed ?? 42;
  const depth = clamp(Number(opts.backgroundDepth) ?? 50, 0, 100) / 100;
  const { core, mid, edge } = spacePalette(opts.bgColor);
  const cx = width * 0.5;
  const cy = height * 0.44;
  const span = Math.max(width, height);

  const voidGrad = ctx.createRadialGradient(cx, cy, span * (0.02 + depth * 0.02), cx, cy, span * (0.82 + depth * 0.12));
  voidGrad.addColorStop(0, rgba(mixRgb(core, { r: 22, g: 26, b: 48 }, 0.35), 1));
  voidGrad.addColorStop(0.42, rgba(mid, 1));
  voidGrad.addColorStop(1, rgba(edge, 1));
  ctx.fillStyle = voidGrad;
  ctx.fillRect(0, 0, width, height);

  const hazeStrength = 0.04 + depth * 0.14;
  const hazeA = ctx.createRadialGradient(width * 0.22, height * 0.28, 0, width * 0.22, height * 0.28, span * (0.28 + depth * 0.18));
  hazeA.addColorStop(0, rgba({ r: 36, g: 48, b: 92 }, hazeStrength));
  hazeA.addColorStop(1, rgba(mid, 0));
  ctx.fillStyle = hazeA;
  ctx.fillRect(0, 0, width, height);

  const hazeB = ctx.createRadialGradient(width * 0.78, height * 0.62, 0, width * 0.78, height * 0.62, span * (0.24 + depth * 0.16));
  hazeB.addColorStop(0, rgba({ r: 48, g: 32, b: 72 }, hazeStrength * 0.72));
  hazeB.addColorStop(1, rgba(mid, 0));
  ctx.fillStyle = hazeB;
  ctx.fillRect(0, 0, width, height);

  const drift = songTime * 0.006;
  const stars = getStarField(seed, opts.backgroundDepth ?? 50);
  for (const star of stars) {
    const parallax = (1 - star.depth) * (14 + depth * 24);
    const px = ((star.nx * width + Math.sin(drift * 0.9 + star.depth * 12) * parallax) % width + width) % width;
    const py = ((star.ny * height + Math.cos(drift * 0.7 + star.depth * 9) * parallax * 0.65) % height + height) % height;
    const tw = 0.86 + 0.14 * Math.sin(songTime * 0.35 + star.depth * 20);
    const alpha = star.alpha * tw;
    ctx.fillStyle = star.cool
      ? rgba({ r: 170, g: 200, b: 255 }, alpha)
      : rgba({ r: 230, g: 235, b: 245 }, alpha);
    ctx.fillRect(px, py, star.size, star.size);
  }

  const rim = ctx.createLinearGradient(0, height * 0.75, 0, height);
  rim.addColorStop(0, rgba(edge, 0));
  rim.addColorStop(1, rgba({ r: 0, g: 0, b: 0 }, 0.35 + depth * 0.35));
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, width, height);
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawLivingSongSpaceBackground(scene, ctx) {
  const state = scene._conceptState ?? {};
  drawSpaceBackground(ctx, scene.width, scene.height, {
    songTime: state.songTime ?? 0,
    seed: state.variationSeed ?? scene.variation?.seed ?? 42,
    bgColor: scene.bgColor || DEFAULT_BG,
    backgroundDepth: scene.variation?.backgroundDepth ?? 50,
  });
}
