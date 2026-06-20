import { DEFAULT_PALETTE, rgba } from '../images/palette.js';

const WIDTH = 1280;
const HEIGHT = 720;
const PARTICLE_COUNT = 2400;
const SCRIBBLE_COUNT = 120;

function rand(a = 0, b = 1) {
  return a + Math.random() * (b - a);
}

function rmsBoost(rms = 0) {
  return Math.min(1, rms * 3);
}

export class OrganicOrganism {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.time = 0;
    this.chaos = 0.4;
    this.palette = [...DEFAULT_PALETTE];
    this.paletteShift = 0;
    this.backgroundImages = [];
    this.smoothRms = 0.12;
    this.smoothCentroid = 0.5;
    this.smoothSpread = 0.35;
    this.smoothTexture = 0.3;
    this.smoothMid = 0.5;
    this.coreX = 0;
    this.coreY = 0;
    this.shake = { x: 0, y: 0 };
    this.glitch = 0;
    this.invertFlash = 0;
    this.particles = [];
    this.bursts = [];
    this.mutants = [];
    this.scribbles = [];
    this.splatter = null;
    this.splatterCtx = null;
    this._initSplatter(width, height);
    this.init();
  }

  setPalette(palette) {
    this.palette = palette?.length ? palette : [...DEFAULT_PALETTE];
    for (const p of this.particles) {
      p.colorIdx = Math.floor(rand(0, this.palette.length));
    }
  }

  setBackgroundImages(images) {
    this.backgroundImages = images ?? [];
  }

  pickColor(offset = 0, alpha = 1, boost = 0) {
    const idx = Math.floor(this.paletteShift + offset) % this.palette.length;
    return rgba(this.palette, idx, alpha, boost);
  }

  _initSplatter(w, h) {
    if (typeof document === 'undefined') return;
    this.splatter = document.createElement('canvas');
    this.splatter.width = w;
    this.splatter.height = h;
    this.splatterCtx = this.splatter.getContext('2d');
    this.splatterCtx.fillStyle = '#000';
    this.splatterCtx.fillRect(0, 0, w, h);
  }

  init() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const layer = i % 4;
      this.particles.push({
        angle: rand(0, Math.PI * 2),
        baseRadius: rand(10, 320),
        radius: 0,
        speed: rand(-0.035, 0.035) * (layer + 1),
        size: rand(0.5, layer === 3 ? 5 : 2.5),
        colorIdx: Math.floor(rand(0, this.palette.length)),
        phase: rand(0, Math.PI * 2),
        layer,
        vx: rand(-2, 2),
        vy: rand(-2, 2),
        wild: Math.random() < 0.25,
      });
    }

    this.scribbles = Array.from({ length: SCRIBBLE_COUNT }, () => ({
      x: rand(0, this.width),
      y: rand(0, this.height),
      vx: rand(-4, 4),
      vy: rand(-4, 4),
      life: rand(0.3, 1),
    }));

    this.bursts = [];
    this.mutants = [];
  }

  reset(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.time = 0;
    this.chaos = 0.4;
    this.paletteShift = 0;
    this.shake = { x: 0, y: 0 };
    this.glitch = 0;
    this.invertFlash = 0;
    this._initSplatter(width, height);
    this.init();
  }

  update(frame) {
    if (frame.time != null) {
      this.time = frame.time;
    } else {
      this.time += 1 / 30;
    }

    const { rms, bass, mid, high, bars, waveform, beat, centroid = 0.5, spread = 0.35, texture = 0.3 } = frame;
    const energy = 0.4 + rms * 3.5;
    const wild = mid * 0.45 + high * 0.35 + spread * 0.3;

    this.smoothRms = this.smoothRms * 0.94 + rms * 0.06;
    this.smoothCentroid = this.smoothCentroid * 0.92 + centroid * 0.08;
    this.smoothSpread = this.smoothSpread * 0.93 + spread * 0.07;
    this.smoothTexture = this.smoothTexture * 0.9 + texture * 0.1;
    this.smoothMid = this.smoothMid * 0.9 + mid * 0.1;

    this.coreX = this.coreX * 0.96 + (centroid - 0.5) * 140 * 0.04;
    this.coreY = this.coreY * 0.96 + (spread - 0.45) * 90 * 0.04;

    this.chaos = Math.min(1, this.chaos * 0.92 + wild * 0.1 + texture * 0.06 + (beat ? 0.12 : 0));
    this.paletteShift = (this.paletteShift + 0.02 + this.smoothCentroid * 0.04 + texture * 0.06) % this.palette.length;
    this.glitch = Math.max(0, this.glitch * 0.85 - 0.02 + texture * 0.12 + high * 0.05);
    this.invertFlash = Math.max(0, this.invertFlash - 0.05);

    this.cx += rand(-1, 1) * (4 + this.smoothSpread * 25) * this.chaos;
    this.cy += rand(-1, 1) * (4 + this.smoothTexture * 20) * this.chaos;
    this.cx = Math.max(this.width * 0.15, Math.min(this.width * 0.85, this.cx));
    this.cy = Math.max(this.height * 0.15, Math.min(this.height * 0.85, this.cy));

    this.shake.x = rand(-1, 1) * wild * 6 * this.chaos;
    this.shake.y = rand(-1, 1) * wild * 6 * this.chaos;

    const burstCount = beat ? 40 + Math.floor(texture * 30) : Math.floor(wild * 6);
    for (let i = 0; i < burstCount; i++) {
      const a = rand(0, Math.PI * 2);
      const speed = rand(2, 18) + bass * 12;
      this.bursts.push({
        x: this.cx + rand(-30, 30),
        y: this.cy + rand(-30, 30),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: rand(0.5, 1.2),
        size: rand(1, 6) + high * 4,
        colorIdx: Math.floor(rand(0, this.palette.length)),
        kind: Math.random() < 0.3 ? 'streak' : 'blob',
      });
    }

    if (texture > 0.55 && this.mutants.length < 5 && Math.random() < 0.08) {
      this.mutants.push({
        x: this.cx + rand(-120, 120),
        y: this.cy + rand(-120, 120),
        vx: rand(-3, 3),
        vy: rand(-3, 3),
        r: rand(15, 50),
        colorIdx: Math.floor(rand(0, this.palette.length)),
        life: rand(0.6, 1.5),
        spin: rand(-0.2, 0.2),
        angle: rand(0, Math.PI * 2),
      });
    }

    const pulse = 1 + this.smoothRms * 0.45 + this.smoothMid * 0.25 + spread * 0.2;

    for (const p of this.particles) {
      const bandIdx = Math.floor(Math.abs(Math.sin(p.phase + this.time)) * bars.length) % bars.length;
      const band = bars[bandIdx] ?? 0;

      if (p.wild) {
        p.vx += rand(-0.8, 0.8) * energy * this.chaos;
        p.vy += rand(-0.8, 0.8) * energy * this.chaos;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.x = (p.x ?? this.cx) + p.vx * (1 + wild);
        p.y = (p.y ?? this.cy) + p.vy * (1 + wild);
        if (p.x < 0 || p.x > this.width) p.vx *= -1.1;
        if (p.y < 0 || p.y > this.height) p.vy *= -1.1;
      } else {
        p.angle += p.speed * energy * (1 + this.smoothMid * 0.6) * (1 + this.chaos * 0.5);
        const wobble = Math.sin(this.time * 3 + p.phase) * (15 + this.smoothTexture * 50);
        const layerPull = [this.smoothRms, mid, high, spread][p.layer];
        p.radius = p.baseRadius * pulse + wobble * layerPull + band * 70;
        const squash = 0.35 + mid * 0.4 + rand(-0.1, 0.1) * this.chaos;
        p.x = this.cx + Math.cos(p.angle + this.time * 0.2) * p.radius;
        p.y = this.cy + Math.sin(p.angle + this.time * 0.17) * p.radius * squash;
      }

      p.colorIdx = (p.colorIdx + rand(-0.5, 0.5) + high * 0.3) % this.palette.length;
    }

    for (const s of this.scribbles) {
      s.x += s.vx * (1 + energy * 0.5);
      s.y += s.vy * (1 + energy * 0.5);
      s.vx += rand(-0.5, 0.5) * this.chaos;
      s.vy += rand(-0.5, 0.5) * this.chaos;
      s.life -= 0.008;
      if (s.life <= 0 || s.x < -50 || s.x > this.width + 50 || s.y < -50 || s.y > this.height + 50) {
        s.x = this.cx + rand(-200, 200);
        s.y = this.cy + rand(-200, 200);
        s.vx = rand(-6, 6);
        s.vy = rand(-6, 6);
        s.life = rand(0.4, 1);
      }
    }

    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.x += b.vx;
      b.y += b.vy;
      b.vx *= 0.91;
      b.vy *= 0.91;
      b.vy += 0.05 * this.chaos;
      b.life -= 0.02 + this.chaos * 0.01;
      if (b.life <= 0) this.bursts.splice(i, 1);
    }

    for (let i = this.mutants.length - 1; i >= 0; i--) {
      const m = this.mutants[i];
      m.x += m.vx * (1 + bass);
      m.y += m.vy * (1 + bass);
      m.angle += m.spin * (1 + mid);
      m.life -= 0.012;
      m.r *= 1 + bass * 0.02;
      if (m.life <= 0) this.mutants.splice(i, 1);
    }

    if (this.bursts.length > 800) this.bursts.splice(0, this.bursts.length - 800);

    this._frame = {
      rms, bass, mid, high, bars, waveform, beat, energy, pulse, wild,
      centroid, spread, texture,
      smoothRms: this.smoothRms,
      smoothCentroid: this.smoothCentroid,
      smoothSpread: this.smoothSpread,
      smoothTexture: this.smoothTexture,
      smoothMid: this.smoothMid,
    };
    this._splatterFrame(waveform, bass, mid, high, beat);
  }

  _splatterFrame(waveform, bass, mid, high, beat) {
    if (!this.splatterCtx) return;
    const sc = this.splatterCtx;
    sc.globalCompositeOperation = 'source-over';
    sc.fillStyle = `rgba(0,0,0,${0.04 + (beat ? 0 : 0.02)})`;
    sc.fillRect(0, 0, this.width, this.height);

    const splats = beat ? 25 : 3 + Math.floor(this.chaos * 8);
    sc.globalCompositeOperation = 'lighter';
    for (let i = 0; i < splats; i++) {
      const x = this.cx + rand(-250, 250);
      const y = this.cy + rand(-250, 250);
      const r = rand(5, 60) * (1 + bass);
      const colorIdx = Math.floor(rand(0, this.palette.length));
      sc.fillStyle = this.pickColor(colorIdx, rand(0.05, 0.25), rand(-20, 40));
      sc.beginPath();
      if (Math.random() < 0.5) {
        sc.ellipse(x, y, r, r * rand(0.2, 2), rand(0, Math.PI), 0, Math.PI * 2);
      } else {
        sc.arc(x, y, r, 0, Math.PI * 2);
      }
      sc.fill();
    }

    if (waveform?.length > 4) {
      sc.strokeStyle = this.pickColor(0, 0.08 + mid * 0.15, 30);
      sc.lineWidth = rand(1, 8);
      sc.beginPath();
      for (let i = 0; i < waveform.length; i++) {
        const t = i / (waveform.length - 1);
        const w = waveform[i];
        const x = t * this.width + rand(-5, 5) * this.chaos;
        const y = this.cy + w * 200 * (1 + bass) + rand(-30, 30) * this.chaos;
        if (i === 0) sc.moveTo(x, y);
        else sc.lineTo(x, y);
      }
      sc.stroke();
    }
  }

  draw(ctx, title = '') {
    const { rms, bass, mid, high, waveform, energy, pulse, wild, beat } = this._frame ?? {};

    ctx.save();
    ctx.fillStyle = `rgba(2, 0, 8, ${0.12 + rms * 0.05})`;
    ctx.fillRect(0, 0, this.width, this.height);

    if (this.splatter) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.55 + this.chaos * 0.35;
      ctx.drawImage(this.splatter, 0, 0);
      ctx.globalAlpha = 1;
    }

    ctx.translate(this.shake.x, this.shake.y);
    ctx.globalCompositeOperation = 'source-over';

    this.drawImageShards(ctx, bass, mid, high, beat);
    this.drawChaosFog(ctx, bass, mid, high);
    this.drawScribbleStorm(ctx, rms);
    this.drawWildTentacles(ctx, waveform, bass, mid, high);
    this.drawParticleChaos(ctx, rms, high, beat);
    this.drawBrokenRings(ctx, mid, bass);
    this.drawBursts(ctx);
    this.drawMutants(ctx);
    this.drawCores(ctx);
    this.drawGlitch(ctx);
    this.drawInvertFlash(ctx);

    ctx.restore();

    if (title && this.chaos < 0.85) {
      ctx.fillStyle = `rgba(255,255,255,${0.12 - this.chaos * 0.1})`;
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(title, 20, this.height - 18);
    }
  }

  drawImageShards(ctx, bass, mid, high, beat) {
    if (!this.backgroundImages.length) return;

    ctx.globalCompositeOperation = 'screen';
    const count = this.backgroundImages.length;

    for (let i = 0; i < count; i++) {
      const { img } = this.backgroundImages[i];
      if (!img?.complete) continue;

      const shards = beat ? 6 : 3;
      for (let s = 0; s < shards; s++) {
        const t = this.time * 0.3 + i + s;
        const scale = 0.35 + bass * 0.25 + Math.sin(t) * 0.08;
        const iw = img.naturalWidth || img.width;
        const ih = img.naturalHeight || img.height;
        const dw = this.width * scale;
        const dh = (ih / iw) * dw;
        const ox = this.cx + Math.cos(t + s) * (120 + mid * 200) - dw / 2;
        const oy = this.cy + Math.sin(t * 1.3 + s) * (80 + high * 160) - dh / 2;

        const sx = rand(0, iw * 0.5);
        const sy = rand(0, ih * 0.5);
        const sw = iw * rand(0.2, 0.6);
        const sh = ih * rand(0.2, 0.6);

        ctx.globalAlpha = 0.08 + this.chaos * 0.12 + rmsBoost(this._frame?.rms) * 0.1;
        ctx.save();
        ctx.translate(ox + rand(-30, 30) * this.chaos, oy + rand(-30, 30) * this.chaos);
        ctx.rotate(Math.sin(t) * 0.4 * this.chaos);
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  drawChaosFog(ctx, bass, mid, high) {
    for (let i = 0; i < 3; i++) {
      const ox = rand(-80, 80) * this.chaos;
      const oy = rand(-80, 80) * this.chaos;
      const g = ctx.createRadialGradient(
        this.cx + ox, this.cy + oy, 10,
        this.cx + ox, this.cy + oy, this.height * (0.35 + i * 0.15),
      );
      g.addColorStop(0, this.pickColor(i, 0.06 + bass * 0.08));
      g.addColorStop(0.5, this.pickColor(i + 2, 0.03 + mid * 0.05));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawScribbleStorm(ctx, rms) {
    ctx.globalCompositeOperation = 'difference';
    for (let i = 0; i < this.scribbles.length; i++) {
      const a = this.scribbles[i];
      const b = this.scribbles[(i + 7) % this.scribbles.length];
      if (Math.random() > 0.3 + this.chaos * 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(this.cx + rand(-50, 50), this.cy + rand(-50, 50));
      ctx.strokeStyle = this.pickColor(i, a.life * (0.15 + rms));
      ctx.lineWidth = rand(0.5, 3) * (1 + this.chaos * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawWildTentacles(ctx, waveform, bass, mid, high) {
    if (!waveform?.length) return;
    const beat = this._frame?.beat;
    const count = 6 + Math.floor(this.chaos * 18) + (beat ? 8 : 0);

    ctx.globalCompositeOperation = 'lighter';
    const len = waveform.length;

    for (let t = 0; t < count; t++) {
      const baseAngle = rand(0, Math.PI * 2);
      const reach = rand(80, 400) * (1 + bass * 0.8);
      const originX = this.cx + rand(-60, 60) * this.chaos;
      const originY = this.cy + rand(-60, 60) * this.chaos;

      ctx.beginPath();
      ctx.moveTo(originX, originY);

      for (let i = 0; i < len; i += Math.max(1, Math.floor(rand(1, 4)))) {
        const tAlong = i / (len - 1);
        const w = waveform[i] ?? 0;
        const dist = reach * Math.pow(tAlong, rand(0.5, 1.2)) + w * rand(30, 120);
        const curl = Math.sin(tAlong * rand(3, 12) + this.time * rand(2, 8) + t) * rand(20, 80) * tAlong;
        const angle = baseAngle + curl * 0.04 + Math.sin(this.time + t) * this.chaos;
        const x = originX + Math.cos(angle) * dist + rand(-15, 15) * this.chaos;
        const y = originY + Math.sin(angle) * dist + rand(-15, 15) * this.chaos;
        ctx.lineTo(x, y);
      }

      ctx.strokeStyle = this.pickColor(t, rand(0.1, 0.45), rand(-10, 50));
      ctx.lineWidth = rand(0.5, 8) + bass * 6;
      ctx.lineCap = 'round';
      ctx.setLineDash(beat && t % 2 ? [rand(2, 12), rand(2, 8)] : []);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawParticleChaos(ctx, rms, high, beat) {
    ctx.globalCompositeOperation = 'lighter';
    const step = beat ? 1 : 2;

    for (let i = 0; i < this.particles.length; i += step) {
      const p = this.particles[i];
      const alpha = rand(0.1, 0.7) * (0.3 + rms * 2);
      const size = p.size * rand(1, 4) * (1 + this.chaos);

      if (Math.random() < 0.15 * this.chaos) {
        ctx.strokeStyle = this.pickColor(p.colorIdx, alpha, 40);
        ctx.lineWidth = rand(0.3, 2);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 8, p.y - p.vy * 8);
        ctx.stroke();
      }

      ctx.fillStyle = this.pickColor(p.colorIdx, alpha, rand(-15, 35));
      ctx.beginPath();
      if (Math.random() < 0.4) {
        ctx.fillRect(p.x - size, p.y - size * 0.3, size * 2, size * 0.6);
      } else {
        ctx.arc(p.x, p.y, size * rand(1, 3), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBrokenRings(ctx, mid, bass) {
    ctx.globalCompositeOperation = 'exclusion';
    const count = 3 + Math.floor(this.chaos * 10);

    for (let i = 0; i < count; i++) {
      const angle = this.time * rand(0.01, 0.08) * (i % 2 ? 1 : -1) + i;
      const r = rand(40, 280) * (1 + bass * 0.5);
      ctx.save();
      ctx.translate(this.cx + rand(-100, 100) * this.chaos, this.cy + rand(-100, 100) * this.chaos);
      ctx.rotate(angle);
      ctx.scale(rand(0.5, 2), rand(0.1, 0.8));
      ctx.beginPath();
      ctx.arc(0, 0, r, rand(0, Math.PI), rand(Math.PI, Math.PI * 3));
      ctx.strokeStyle = this.pickColor(i, rand(0.05, 0.3));
      ctx.lineWidth = rand(1, 12);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBursts(ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bursts) {
      if (b.kind === 'streak') {
        ctx.strokeStyle = this.pickColor(b.colorIdx, b.life * 0.8, 50);
        ctx.lineWidth = b.size * b.life;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - b.vx * 3, b.y - b.vy * 3);
        ctx.stroke();
      } else {
        ctx.fillStyle = this.pickColor(b.colorIdx, b.life * 0.7, 30);
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.size * 5 * b.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawMutants(ctx) {
    ctx.globalCompositeOperation = 'hard-light';
    for (const m of this.mutants) {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate(m.angle);
      ctx.fillStyle = this.pickColor(m.colorIdx, m.life * 0.5);
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const w = 1 + Math.sin(a * 3 + this.time * 5) * 0.5;
        const r = m.r * w * m.life;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawCores(ctx) {
    const {
      smoothRms, smoothCentroid, smoothSpread, smoothTexture, smoothMid, texture,
    } = this._frame ?? {};

    const x = this.cx + this.coreX;
    const y = this.cy + this.coreY;

    const breath = 0.75
      + smoothRms * 0.55
      + smoothSpread * 0.3
      + Math.sin(this.time * 0.45) * 0.1
      + Math.cos(this.time * 0.31) * smoothMid * 0.12;

    const coreR = 22 + smoothCentroid * 65 * breath + smoothTexture * 40 + smoothMid * 20;

    ctx.globalCompositeOperation = 'lighter';

    const outer = ctx.createRadialGradient(x, y, 0, x, y, coreR * 4.5);
    outer.addColorStop(0, this.pickColor(0, 0.45 + smoothRms * 0.25, 40));
    outer.addColorStop(0.35, this.pickColor(1, 0.2 + smoothSpread * 0.2));
    outer.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.arc(x, y, coreR * 4.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    const segs = 12 + Math.floor(smoothTexture * 16);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const wobble = 1
        + Math.sin(a * 3 + this.time * 0.9) * smoothSpread * 0.28
        + Math.cos(a * 5 + this.time * 0.6) * smoothMid * 0.18
        + Math.sin(this.time * 0.4) * smoothTexture * 0.1;
      const r = coreR * wobble;
      const px = x + Math.cos(a + this.time * 0.15) * r;
      const py = y + Math.sin(a + this.time * 0.12) * r * (0.55 + smoothCentroid * 0.35);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = this.pickColor(2, 0.4 + smoothRms * 0.2, 25);
    ctx.fill();

    if (smoothSpread > 0.5 && texture > 0.35) {
      const haloR = coreR * (1.6 + smoothSpread * 0.8);
      ctx.beginPath();
      ctx.arc(x, y, haloR, 0, Math.PI * 2);
      ctx.strokeStyle = this.pickColor(3, 0.08 + smoothTexture * 0.12);
      ctx.lineWidth = 2 + smoothSpread * 4;
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  drawGlitch(ctx) {
    if (this.glitch < 0.1) return;

    if (!this._frameBuffer || this._frameBuffer.width !== this.width) {
      this._frameBuffer = document.createElement('canvas');
      this._frameBuffer.width = this.width;
      this._frameBuffer.height = this.height;
    }
    const fb = this._frameBuffer.getContext('2d');
    fb.drawImage(ctx.canvas, 0, 0);

    const slices = Math.floor(3 + this.glitch * 15);
    ctx.globalCompositeOperation = 'difference';

    for (let i = 0; i < slices; i++) {
      const y = rand(0, this.height);
      const h = rand(2, 40) * this.glitch;
      const shift = rand(-60, 60) * this.glitch;
      ctx.drawImage(this._frameBuffer, 0, y, this.width, h, shift, y, this.width, h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawInvertFlash(ctx) {
    if (this.invertFlash <= 0) return;
    ctx.globalCompositeOperation = 'difference';
    ctx.fillStyle = `rgba(255,255,255,${this.invertFlash * 0.6})`;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.globalCompositeOperation = 'source-over';
  }
}
