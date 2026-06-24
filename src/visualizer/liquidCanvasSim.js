import { VOLCANO_VENT, normalizeLiquidSourceMode } from './liquidSourceModes.js';

function hash01(i, salt = 0) {
  const h = ((i * 73856093) ^ (salt * 19349663)) >>> 0;
  return (h & 0xffff) / 0xffff;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/**
 * Volcano lava — palette colors erupt from summit vent, flow downhill, pool at base.
 * Per-palette layers only (no RGB hue mixing between swatches).
 */
export class LiquidCanvasSim {
  /** @param {number} [gridW] @param {number} [gridH] */
  constructor(gridW = 160, gridH = 90) {
    this.gridW = gridW;
    this.gridH = gridH;
    this.n = gridW * gridH;
    this.layers = [];
    this.layerCount = 0;
    /** @type {{ r: number, g: number, b: number }[]} */
    this.palette = [];
    this.r = new Float32Array(this.n);
    this.g = new Float32Array(this.n);
    this.b = new Float32Array(this.n);
    this.height = new Float32Array(this.n);
    this._layerBuf = [];
    this.vx = new Float32Array(this.n);
    this.vy = new Float32Array(this.n);
    this._time = 0;
    this._eruptPulse = 0;
    /** @type {{ colorIdx: number, channel: number, phase: number }[]} */
    this._streams = [];
    this.vent = { ...VOLCANO_VENT };
  }

  _ensureLayers(count) {
    if (this.layerCount === count && this.layers.length === count) return;
    this.layerCount = count;
    this.layers = Array.from({ length: count }, () => new Float32Array(this.n));
    this._layerBuf = Array.from({ length: count }, () => new Float32Array(this.n));
  }

  /** @param {{ r: number, g: number, b: number }[]} palette @param {() => number} rng @param {string} [_sourceMode] */
  reset(palette, rng = Math.random, _sourceMode = 'volcano') {
    normalizeLiquidSourceMode(_sourceMode);
    const colors = palette?.length ? palette : [{ r: 255, g: 90, b: 20 }];
    this.palette = colors.map((c) => ({ r: c.r, g: c.g, b: c.b }));
    this._ensureLayers(colors.length);
    this.vent = { ...VOLCANO_VENT };

    for (const layer of this.layers) layer.fill(0);
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    this.height.fill(0);
    this.vx.fill(0);
    this.vy.fill(0);
    this._time = 0;
    this._eruptPulse = 0;
    this._streams = [];

    const n = colors.length;
    for (let i = 0; i < n; i++) {
      const channel = (i - (n - 1) * 0.5) / Math.max(1, n - 1);
      this._streams.push({ colorIdx: i, channel, phase: rng() * Math.PI * 2 });
    }

    this._erupt(1, rng);
    for (let w = 0; w < 90; w++) {
      this.step({ flowSpeed: 55, thickness: 55, turbulence: 30, motionDt: 1 / 30 });
    }
    this._updateComposite();
  }

  sampleClamped(field, u, v) {
    const cu = clamp01(u);
    const cv = clamp01(v);
    return this.sample(field, cu, cv);
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

  _splatLayer(layerIdx, cu, cv, radius, amount) {
    const cx = cu * this.gridW;
    const cy = cv * this.gridH;
    const rad = radius * Math.max(this.gridW, this.gridH);
    const r2 = rad * rad;
    const layer = this.layers[layerIdx];
    if (!layer) return;
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
        layer[i] = Math.min(1.5, layer[i] + w);
      }
    }
  }

  _erupt(strength, rng = Math.random) {
    const base = 0.09 + strength * 0.11;
    for (const s of this._streams) {
      const u = this.vent.u + s.channel * 0.028 + (rng() - 0.5) * 0.01;
      const v = this.vent.v + (rng() - 0.5) * 0.012;
      this._splatLayer(s.colorIdx, u, v, base, 0.45 + strength * 0.55);
      this._splatLayer(s.colorIdx, u, v + 0.04, base * 1.3, 0.25 + strength * 0.3);
    }
  }

  _velocityAt(u, v, speed, turb, thickness) {
    const { u: vu, v: vv } = this.vent;
    const dx = u - vu;
    const dy = v - vv;
    const dist = Math.hypot(dx, dy) + 0.015;
    const below = Math.max(0, dy);
    const thickMul = 0.55 + thickness * 0.65;

    let vx = 0;
    let vy = speed * 2.2 * thickMul;

    const erupt = Math.exp(-dist * 5.5);
    vx += dx * speed * 3.8 * erupt;
    vy += speed * 1.6 * erupt;

    const fan = Math.exp(-Math.abs(dx) * 2.2) * (0.2 + below * 1.1);
    vx += dx * speed * 3.0 * fan;
    vy += below * speed * 1.5 * thickMul;

    const stream =
      Math.sin(u * 22 + v * 7 + this._time * 0.75) * 0.38 +
      Math.sin(u * 9 - v * 12 + this._time * 1.1) * 0.26;
    vx += stream * turb * speed * 1.8;
    vy += Math.cos(u * 14 + v * 8 + this._time * 0.65) * turb * speed * 0.25;

    if (v > 0.88) vy *= 0.08;
    else if (v > 0.78) vy *= 0.35;
    if (u < 0.04) vx = Math.abs(vx) * 0.4;
    if (u > 0.96) vx = -Math.abs(vx) * 0.4;

    return { vx, vy };
  }

  _compositeAt(i) {
    let total = 0;
    let best = 0;
    let bestD = 0;
    let second = -1;
    let secondD = 0;

    for (let L = 0; L < this.layerCount; L++) {
      const d = this.layers[L][i];
      total += d;
      if (d > bestD) {
        second = best;
        secondD = bestD;
        best = L;
        bestD = d;
      } else if (d > secondD) {
        second = L;
        secondD = d;
      }
    }

    if (total < 1e-6) {
      this.r[i] = 0;
      this.g[i] = 0;
      this.b[i] = 0;
      this.height[i] = 0;
      return;
    }

    let pick = best;
    if (second >= 0 && secondD > 1e-5) {
      const ratio = secondD / (bestD + secondD + 1e-5);
      if (hash01(i, 17) < ratio) pick = second;
    }

    const c = this.palette[pick] ?? this.palette[0];
    this.r[i] = c.r / 255;
    this.g[i] = c.g / 255;
    this.b[i] = c.b / 255;
    this.height[i] = Math.min(1, total * 0.85);
  }

  _updateComposite() {
    for (let i = 0; i < this.n; i++) this._compositeAt(i);
  }

  /** @param {{ sourceMode?: string, flowSpeed?: number, thickness?: number, turbulence?: number, mot?: number, geo?: number, beat?: boolean, motionDt?: number }} p */
  step(p) {
    const dt = Math.min(0.04, p.motionDt ?? 1 / 30);
    this._time += dt;
    const speed = ((p.flowSpeed ?? 55) / 100) * (0.35 + (p.mot ?? 0) * 0.75);
    const thickness = (p.thickness ?? 50) / 100;
    const turb = (p.turbulence ?? 35) / 100;
    const diff = 0.05 + thickness * 0.14;
    const retain = 0.997 - thickness * 0.004;

    if (p.beat) {
      this._eruptPulse = 1;
      this._erupt(0.5 + (p.geo ?? 0) * 0.4);
    }
    this._eruptPulse = Math.max(0, this._eruptPulse - dt * 2.5);

    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const i = y * this.gridW + x;
        const u = x / (this.gridW - 1);
        const v = y / (this.gridH - 1);
        const vel = this._velocityAt(u, v, speed, turb, thickness);
        this.vx[i] = vel.vx;
        this.vy[i] = vel.vy;
      }
    }

    const eruptAmt = (0.022 + speed * 0.028) * (0.6 + this._eruptPulse * 0.7) * (0.7 + thickness * 0.45);
    for (const s of this._streams) {
      s.phase += dt * (0.45 + speed * 0.65);
      const pulse = 0.5 + Math.sin(s.phase) * 0.5;
      const u = this.vent.u + s.channel * 0.03 + Math.sin(s.phase * 0.65) * 0.008;
      const v = this.vent.v + pulse * 0.006;
      this._splatLayer(s.colorIdx, u, v, 0.035 + thickness * 0.02, eruptAmt * (0.8 + pulse * 0.35));
    }

    const advectScale = dt * 18 * (0.4 + speed * 0.55);

    for (let L = 0; L < this.layerCount; L++) {
      const src = this.layers[L];
      const dst = this._layerBuf[L];
      for (let y = 0; y < this.gridH; y++) {
        for (let x = 0; x < this.gridW; x++) {
          const i = y * this.gridW + x;
          const u = x / (this.gridW - 1);
          const v = y / (this.gridH - 1);
          const su = clamp01(u - (this.vx[i] * advectScale) / this.gridW);
          const sv = clamp01(v - (this.vy[i] * advectScale) / this.gridH);
          dst[i] = this.sampleClamped(src, su, sv) * retain;
        }
      }
    }

    for (let L = 0; L < this.layerCount; L++) {
      const src = this._layerBuf[L];
      const out = this.layers[L];
      for (let y = 1; y < this.gridH - 1; y++) {
        for (let x = 1; x < this.gridW - 1; x++) {
          const i = y * this.gridW + x;
          let sum = 0;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              sum += src[(y + oy) * this.gridW + (x + ox)];
            }
          }
          out[i] = src[i] * (1 - diff) + (sum / 9) * diff;
        }
      }
    }

    for (let L = 0; L < this.layerCount; L++) {
      const layer = this.layers[L];
      for (let y = 0; y < this.gridH; y++) {
        layer[y * this.gridW] *= 0.985;
        layer[y * this.gridW + this.gridW - 1] *= 0.985;
      }
    }

    this._updateComposite();
  }

  /** @param {number} relief 0-100 @returns {ImageData|null} */
  toImageData(relief = 45) {
    if (typeof document === 'undefined') return null;
    if (!this._imgData || this._imgData.width !== this.gridW || this._imgData.height !== this.gridH) {
      this._imgData = new ImageData(this.gridW, this.gridH);
    }
    const d = this._imgData.data;
    const rel = relief / 100;
    for (let i = 0; i < this.n; i++) {
      const h = this.height[i];
      const o = i * 4;
      if (h < 0.012) {
        d[o + 3] = 0;
        continue;
      }
      const lift = 1 + h * rel * 0.45;
      const intensity = Math.min(1, 0.55 + h * 0.85);
      d[o] = Math.min(255, this.r[i] * 255 * lift * intensity);
      d[o + 1] = Math.min(255, this.g[i] * 255 * lift * intensity);
      d[o + 2] = Math.min(255, this.b[i] * 255 * lift * intensity);
      d[o + 3] = 255;
    }
    return this._imgData;
  }
}
