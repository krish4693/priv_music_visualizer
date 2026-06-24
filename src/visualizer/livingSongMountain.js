import { mountainRockColor } from './livingSongPalette.js';

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** Deadly mountain height field — peaks loom at top, valleys carve downward. */
export class LivingSongMountain {
  /** @param {number} [gridW] @param {number} [gridH] @param {() => number} [rng] */
  constructor(gridW = 176, gridH = 99, rng = Math.random) {
    this.gridW = gridW;
    this.gridH = gridH;
    this.n = gridW * gridH;
    this.height = new Float32Array(this.n);
    this.rockR = new Float32Array(this.n);
    this.rockG = new Float32Array(this.n);
    this.rockB = new Float32Array(this.n);
    this.vent = { u: 0.5, v: 0.09 };
    this._build(rng);
  }

  _build(rng) {
    let peakH = 0;
    let peakU = 0.5;
    let peakV = 0.09;

    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const u = x / (this.gridW - 1);
        const v = y / (this.gridH - 1);
        let h = 0;

        h += Math.exp(-((u - 0.5) ** 2 * 14 + (v - 0.07) ** 2 * 42)) * 0.98;
        h += Math.exp(-((u - 0.26) ** 2 * 7 + (v - 0.14) ** 2 * 22)) * 0.38;
        h += Math.exp(-((u - 0.74) ** 2 * 7 + (v - 0.14) ** 2 * 22)) * 0.38;
        h += Math.exp(-((u - 0.38) ** 2 * 9 + (v - 0.2) ** 2 * 16)) * 0.22;
        h += Math.exp(-((u - 0.62) ** 2 * 9 + (v - 0.2) ** 2 * 16)) * 0.22;

        const ridge =
          Math.abs(Math.sin(u * 24 + Math.sin(v * 9 + rng() * 0.5) * 2.8)) * 0.045 * (1 - v * 0.6) +
          Math.abs(Math.sin(v * 20 + u * 5.5)) * 0.032;
        h += ridge;

        h -= Math.exp(-((u - 0.5) ** 2 * 48 + (v - 0.22) ** 2 * 10)) * 0.14;
        h -= Math.exp(-((u - 0.18) ** 2 * 12 + (v - 0.55) ** 2 * 6)) * 0.08;
        h -= Math.exp(-((u - 0.82) ** 2 * 12 + (v - 0.55) ** 2 * 6)) * 0.08;

        h = clamp01(h);
        const i = y * this.gridW + x;
        this.height[i] = h;

        if (h > peakH && v < 0.35) {
          peakH = h;
          peakU = u;
          peakV = v;
        }
      }
    }

    this.vent = { u: peakU, v: peakV };

    for (let y = 1; y < this.gridH - 1; y++) {
      for (let x = 1; x < this.gridW - 1; x++) {
        const i = y * this.gridW + x;
        const h = this.height[i];
        const hx = this.height[i + 1] - this.height[i - 1];
        const hy = this.height[i + this.gridW] - this.height[i - this.gridW];
        const slope = Math.hypot(hx, hy);
        const c = mountainRockColor(h, slope);
        this.rockR[i] = c.r / 255;
        this.rockG[i] = c.g / 255;
        this.rockB[i] = c.b / 255;
      }
    }
  }

  sample(field, u, v) {
    const x = u * (this.gridW - 1);
    const y = v * (this.gridH - 1);
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(this.gridW - 1, x0 + 1);
    const y1 = Math.min(this.gridH - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const i00 = y0 * this.gridW + x0;
    const i10 = y0 * this.gridW + x1;
    const i01 = y1 * this.gridW + x0;
    const i11 = y1 * this.gridW + x1;
    const a = field[i00] * (1 - tx) + field[i10] * tx;
    const b = field[i01] * (1 - tx) + field[i11] * tx;
    return a * (1 - ty) + b * ty;
  }

  /** Downhill direction (screen +y = down). */
  gradient(u, v) {
    const eps = 1.2 / this.gridW;
    const h = this.sample(this.height, u, v);
    const hx = this.sample(this.height, u + eps, v) - this.sample(this.height, u - eps, v);
    const hy = this.sample(this.height, u, v + eps) - this.sample(this.height, u, v - eps);
    let gx = -hx;
    let gy = -hy + 0.35;
    const len = Math.hypot(gx, gy) + 1e-5;
    return { gx: gx / len, gy: gy / len, slope: len * 2, terrain: h };
  }

  /** @param {number} [relief] @returns {ImageData|null} */
  toImageData(relief = 40) {
    if (typeof document === 'undefined') return null;
    const img = new ImageData(this.gridW, this.gridH);
    const d = img.data;
    const rel = relief / 100;
    for (let i = 0; i < this.n; i++) {
      const h = this.height[i];
      const shade = 0.75 + h * rel * 0.35;
      const o = i * 4;
      d[o] = Math.min(255, this.rockR[i] * 255 * shade);
      d[o + 1] = Math.min(255, this.rockG[i] * 255 * shade);
      d[o + 2] = Math.min(255, this.rockB[i] * 255 * shade);
      d[o + 3] = 255;
    }
    return img;
  }
}
