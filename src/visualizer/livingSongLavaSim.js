import { lavaColorFromHeat } from './livingSongPalette.js';

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Viscous lava flowing down a mountain height field.
 * Bass drives glow; beats erupt; mid/high add ripples.
 */
export class LivingSongLavaSim {
  /** @param {import('./livingSongMountain.js').LivingSongMountain} mountain */
  constructor(mountain) {
    this.mountain = mountain;
    this.gridW = mountain.gridW;
    this.gridH = mountain.gridH;
    this.n = mountain.n;
    this.heat = new Float32Array(this.n);
    this.heat2 = new Float32Array(this.n);
    this.glow = new Float32Array(this.n);
    this.r = new Float32Array(this.n);
    this.g = new Float32Array(this.n);
    this.b = new Float32Array(this.n);
    this.height = new Float32Array(this.n);
    this.vx = new Float32Array(this.n);
    this.vy = new Float32Array(this.n);
    this._time = 0;
    this._eruptPulse = 0;
    this._glowLevel = 0;
  }

  reset(rng = Math.random) {
    this.heat.fill(0);
    this.glow.fill(0);
    this._time = 0;
    this._eruptPulse = 0;
    this._glowLevel = 0;
    this._erupt(0.85, rng);
    for (let w = 0; w < 140; w++) {
      this.step({ flowSpeed: 48, thickness: 62, turbulence: 32, bass: 0.4, motionDt: 1 / 30 });
    }
    this._updateComposite(0.35);
  }

  sample(field, u, v) {
    return this.mountain.sample(field, clamp01(u), clamp01(v));
  }

  _splatHeat(cu, cv, radius, amount) {
    const cx = cu * this.gridW;
    const cy = cv * this.gridH;
    const rad = radius * Math.max(this.gridW, this.gridH);
    const r2 = rad * rad;
    const minX = Math.max(0, Math.floor(cx - rad));
    const maxX = Math.min(this.gridW - 1, Math.ceil(cx + rad));
    const minY = Math.max(0, Math.floor(cy - rad));
    const maxY = Math.min(this.gridH - 1, Math.ceil(cy + rad));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const t = 1 - Math.sqrt(d2) / rad;
        const w = t * t * amount;
        const i = y * this.gridW + x;
        this.heat[i] = Math.min(1.4, this.heat[i] + w);
      }
    }
  }

  _erupt(strength, rng = Math.random) {
    const { u, v } = this.mountain.vent;
    this._splatHeat(u + (rng() - 0.5) * 0.015, v + (rng() - 0.5) * 0.01, 0.08 + strength * 0.06, 0.5 + strength * 0.55);
    this._splatHeat(u, v + 0.035, 0.11 + strength * 0.05, 0.28 + strength * 0.3);
  }

  _velocityAt(u, v, speed, turb, thickness, ripple) {
    const { gx, gy, slope, terrain } = this.mountain.gradient(u, v);
    const thickMul = 0.45 + thickness * 0.55;
    let vx = gx * speed * 2.4 * thickMul * (0.35 + slope * 0.65);
    let vy = gy * speed * 2.8 * thickMul * (0.35 + slope * 0.65);

    const stream =
      Math.sin(u * 28 + v * 9 + this._time * 0.55) * 0.35 +
      Math.sin(u * 12 - v * 16 + this._time * 0.85) * ripple * 0.55;
    vx += stream * turb * speed * 1.4;
    vy += Math.cos(u * 16 + v * 11 + this._time * 0.45) * turb * speed * 0.2;

    if (terrain < 0.08) vy *= 0.15;

    return { vx, vy };
  }

  _updateComposite(glowBoost) {
    for (let i = 0; i < this.n; i++) {
      const h = this.heat[i];
      this.height[i] = Math.min(1, h);
      const g = this.glow[i] * (0.4 + glowBoost * 0.9);
      const c = lavaColorFromHeat(Math.min(1, h * 0.92 + g * 0.15), glowBoost);
      this.r[i] = c.r / 255;
      this.g[i] = c.g / 255;
      this.b[i] = c.b / 255;
    }
  }

  /** @param {{ flowSpeed?: number, thickness?: number, turbulence?: number, mot?: number, geo?: number, bass?: number, beatPulse?: number, beat?: boolean, motionDt?: number }} p */
  step(p) {
    const dt = Math.min(0.035, p.motionDt ?? 1 / 30);
    this._time += dt;
    const speed = ((p.flowSpeed ?? 42) / 100) * (0.22 + (p.mot ?? 0) * 0.45);
    const thickness = (p.thickness ?? 62) / 100;
    const turb = (p.turbulence ?? 28) / 100;
    const bass = p.bass ?? p.geo ?? 0;
    const ripple = (p.beatPulse ?? 0) * 0.8 + (p.mot ?? 0) * 0.25;
    const diff = 0.04 + thickness * 0.1;
    const retain = 0.9985 - thickness * 0.003;

    this._glowLevel = this._glowLevel * 0.94 + bass * 0.06;

    if (p.beat) {
      this._eruptPulse = 1;
      this._erupt(0.45 + bass * 0.55);
    }
    this._eruptPulse = Math.max(0, this._eruptPulse - dt * 1.8);

    const feed = (0.028 + speed * 0.032) * (0.65 + this._eruptPulse * 0.85 + bass * 0.55);
    const { u: vu, v: vv } = this.mountain.vent;
    this._splatHeat(vu, vv, 0.042 + thickness * 0.022, feed);

    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const i = y * this.gridW + x;
        const u = x / (this.gridW - 1);
        const v = y / (this.gridH - 1);
        const vel = this._velocityAt(u, v, speed, turb, thickness, ripple);
        this.vx[i] = vel.vx;
        this.vy[i] = vel.vy;
      }
    }

    const advectScale = dt * 14 * (0.32 + speed * 0.42);

    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const i = y * this.gridW + x;
        const u = x / (this.gridW - 1);
        const v = y / (this.gridH - 1);
        const su = clamp01(u - (this.vx[i] * advectScale) / this.gridW);
        const sv = clamp01(v - (this.vy[i] * advectScale) / this.gridH);
        this.heat2[i] = this.sample(this.heat, su, sv) * retain;
      }
    }

    for (let y = 1; y < this.gridH - 1; y++) {
      for (let x = 1; x < this.gridW - 1; x++) {
        const i = y * this.gridW + x;
        let sum = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            sum += this.heat2[(y + oy) * this.gridW + (x + ox)];
          }
        }
        this.heat[i] = this.heat2[i] * (1 - diff) + (sum / 9) * diff;
        this.glow[i] = this.glow[i] * 0.92 + this.heat[i] * bass * 0.08;
      }
    }

    this._updateComposite(this._glowLevel + this._eruptPulse * 0.35);
  }

  /** @param {number} [glowBoost] @returns {ImageData|null} */
  toImageData(glowBoost = 0) {
    if (typeof document === 'undefined') return null;
    const img = new ImageData(this.gridW, this.gridH);
    const d = img.data;
    const glow = glowBoost + this._glowLevel * 0.5;
    for (let i = 0; i < this.n; i++) {
      const h = this.heat[i];
      const o = i * 4;
      if (h < 0.006) {
        d[o + 3] = 0;
        continue;
      }
      const heatT = Math.min(1, h * 1.25 + glow * 0.35 + 0.08);
      const c = lavaColorFromHeat(heatT, glow);
      d[o] = c.r;
      d[o + 1] = c.g;
      d[o + 2] = c.b;
      d[o + 3] = 255;
    }
    return img;
  }
}
