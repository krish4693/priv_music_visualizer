/** @typedef {'orbit'|'bob'|'figure8'|'sway'} SoftMotionStyle */

const SOFT_MOTION_STYLES = /** @type {SoftMotionStyle[]} */ (['orbit', 'bob', 'figure8', 'sway']);

/** @param {string} kind */
export function isSoftRoundKind(kind) {
  return kind === 'ellipsoid' || kind === 'egg';
}

/**
 * @param {() => number} rng
 * @param {object} shape
 * @param {string} kind
 */
export function initSoftShapeMotion(rng, shape, kind) {
  if (!isSoftRoundKind(kind)) {
    shape.motionStyle = null;
    shape.wobbleX = 0;
    shape.wobbleY = 0;
    shape.wobbleZ = 0;
    shape.squashX = 1;
    shape.squashY = 1;
    shape.squashZ = 1;
    shape.tiltX = 0;
    shape.tiltZ = 0;
    return;
  }

  shape.motionStyle = SOFT_MOTION_STYLES[Math.floor(rng() * SOFT_MOTION_STYLES.length)];
  shape.wobblePhase = rng() * Math.PI * 2;
  shape.squashPhase = rng() * Math.PI * 2;
  shape.wobbleAmp = 32 + rng() * 52;
  shape.wobbleRate = 0.75 + rng() * 0.9;
  shape.wobbleTilt = 0.22 + rng() * 0.38;
  shape.wobbleX = 0;
  shape.wobbleY = 0;
  shape.wobbleZ = 0;
  shape.squashX = 1;
  shape.squashY = 1;
  shape.squashZ = 1;
  shape.tiltX = 0;
  shape.tiltZ = 0;
}

/**
 * Visible motion for symmetric round shapes (rotation alone is hard to see).
 * @param {object} shape
 * @param {number} mot 0–1 motion drive
 * @param {number} motionDt
 */
export function updateSoftShapeMotion(shape, mot, motionDt) {
  if (!shape.motionStyle) return;

  const drive = 0.45 + mot * 0.85;
  const rate = drive * shape.wobbleRate;
  shape.wobblePhase += motionDt * rate * 2.4;
  shape.squashPhase += motionDt * rate * 3.2;

  const amp = shape.wobbleAmp * (0.5 + mot * 0.75);
  const p = shape.wobblePhase;
  let ox = 0;
  let oy = 0;
  let oz = 0;

  switch (shape.motionStyle) {
    case 'orbit':
      ox = Math.cos(p) * amp;
      oy = Math.sin(p * 0.65) * amp * 0.42;
      oz = Math.sin(p) * amp * 0.55;
      break;
    case 'bob':
      ox = Math.sin(p * 1.35) * amp * 0.28;
      oy = Math.sin(p * 2.05) * amp;
      oz = Math.cos(p * 1.1) * amp * 0.22;
      break;
    case 'figure8':
      ox = Math.sin(p) * amp;
      oy = Math.sin(p * 2) * amp * 0.48;
      oz = Math.cos(p * 1.5) * amp * 0.3;
      break;
    case 'sway':
    default:
      ox = Math.sin(p * 0.85) * amp * 0.72;
      oy = Math.cos(p * 1.25) * amp * 0.55;
      oz = Math.sin(p * 1.55 + shape.wobbleTilt) * amp * 0.38;
      break;
  }

  shape.wobbleX = ox;
  shape.wobbleY = oy;
  shape.wobbleZ = oz;

  const squashAmt = 0.1 + mot * 0.08;
  const squash = 1 + Math.sin(shape.squashPhase) * squashAmt;
  shape.squashX = squash;
  shape.squashY = 1 / squash;
  shape.squashZ = 1 + Math.cos(shape.squashPhase * 0.85) * squashAmt * 0.65;

  shape.tiltX = Math.sin(p * 1.15) * shape.wobbleTilt * drive;
  shape.tiltZ = Math.cos(p * 0.92) * shape.wobbleTilt * drive;
}

/** @param {object} shape @param {string} kind */
export function syncSoftShapeMotionKind(shape, kind) {
  if (isSoftRoundKind(kind) && !shape.motionStyle) {
    initSoftShapeMotion(() => Math.random(), shape, kind);
  } else if (!isSoftRoundKind(kind)) {
    initSoftShapeMotion(() => 0, shape, kind);
  }
}
