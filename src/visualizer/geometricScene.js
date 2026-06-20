import { DEFAULT_PALETTE, rgba } from '../images/palette.js';
import { createAudioSourceState, extractAudioSources, resetAudioSourceState } from '../audio/sources.js';
import { resolveMappedValues, DEFAULT_MAPPINGS } from './mappingMatrix.js';

const WIDTH = 1280;
const HEIGHT = 720;
const MAX_SHAPES = 110;

function rand(a = 0, b = 1) {
  return a + Math.random() * (b - a);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function pickShapeType() {
  const r = Math.random();
  if (r < 0.34) return 0;
  if (r < 0.67) return 1;
  return 2;
}

/**
 * Abstract geometric composition driven entirely by the mapping matrix.
 * No EQ bars, no center pulsing orb presets.
 */
export class GeometricScene {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.palette = [...DEFAULT_PALETTE];
    this.mappings = { ...DEFAULT_MAPPINGS };
    this.sourceState = createAudioSourceState();
    this.shapes = Array.from({ length: MAX_SHAPES }, () => this._newShape(true));
    this._prevFrameTime = null;
    this._spawnAcc = 0;
    this._mapped = {};
    this._strokeW = 2;
    this._hueShift = 0;
    this._alphaBase = 0.55;
  }

  setPalette(palette) {
    this.palette = palette?.length ? palette : [...DEFAULT_PALETTE];
  }

  setMappings(mappings) {
    this.mappings = mappings;
  }

  reset(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    this._prevFrameTime = null;
    this._spawnAcc = 0;
    resetAudioSourceState(this.sourceState);
    this.shapes = Array.from({ length: MAX_SHAPES }, () => this._newShape(true));
  }

  _newShape(initial = false) {
    return {
      type: pickShapeType(),
      morphTarget: pickShapeType(),
      morphT: initial ? 1 : 0,
      x: rand(0, this.width),
      y: rand(0, this.height),
      vx: rand(-1, 1),
      vy: rand(-1, 1),
      rotation: rand(0, Math.PI * 2),
      rotSpeed: rand(-2, 2),
      size: rand(14, 48),
      aspect: rand(0.55, 1.8),
      colorIdx: Math.floor(rand(0, this.palette.length)),
      life: initial ? rand(0.4, 1) : 0,
      maxLife: rand(0.6, 1),
    };
  }

  _respawnShape(s) {
    Object.assign(s, this._newShape(false));
    s.life = s.maxLife;
    s.x = rand(0, this.width);
    s.y = rand(0, this.height);
  }

  _pickColor(idx, alpha, boost = 0) {
    const n = this.palette.length;
    const shifted = ((Math.floor(idx + this._hueShift * n) % n) + n) % n;
    return rgba(this.palette, shifted, alpha, boost);
  }

  update(frame) {
    let dt = 1 / 30;
    if (frame.time != null) {
      if (this._prevFrameTime != null) dt = Math.max(1 / 120, frame.time - this._prevFrameTime);
      this._prevFrameTime = frame.time;
    }

    const sources = extractAudioSources(frame, this.sourceState, dt);
    const mapped = resolveMappedValues(sources, this.mappings);
    this._mapped = mapped;

    const targetActive = Math.floor(lerp(10, MAX_SHAPES, mapped.density));
    const morphSpeed = 0.35 + mapped.morphing * 2.8;
    const motionSpeed = 24 + mapped.motion * 200;
    const decayRate = 0.004 + mapped.lifetime * 0.028;
    const spawnRate = 1.5 + mapped.density * 8 + mapped.lifetime * 14;
    const baseSize = 10 + mapped.geometry * 88;
    this._strokeW = 1 + mapped.geometry * 7;
    this._hueShift = mapped.color;
    this._alphaBase = 0.25 + mapped.color * 0.55;

    this._spawnAcc += spawnRate * dt;

    let active = 0;
    for (const s of this.shapes) {
      if (s.life <= 0) {
        if (this._spawnAcc >= 1 && active < targetActive) {
          this._respawnShape(s);
          this._spawnAcc -= 1;
          active++;
        }
        continue;
      }
      active++;

      const drift = mapped.motion * 3.5;
      s.vx += Math.cos(s.rotation + mapped.motion * Math.PI * 2) * drift * dt;
      s.vy += Math.sin(s.rotation * 1.3) * drift * dt;
      s.vx = lerp(s.vx, Math.cos(s.rotation) * mapped.motion, 0.04);
      s.vy = lerp(s.vy, Math.sin(s.rotation) * mapped.motion, 0.04);

      s.x += s.vx * motionSpeed * dt;
      s.y += s.vy * motionSpeed * dt;
      s.rotation += s.rotSpeed * dt * (0.5 + mapped.motion * 5);

      const pad = 60;
      if (s.x < -pad) s.x = this.width + pad;
      if (s.x > this.width + pad) s.x = -pad;
      if (s.y < -pad) s.y = this.height + pad;
      if (s.y > this.height + pad) s.y = -pad;

      s.morphT += morphSpeed * dt;
      if (s.morphT >= 1) {
        s.type = s.morphTarget;
        s.morphTarget = pickShapeType();
        s.morphT = 0;
      }

      s.size = lerp(s.size, baseSize * rand(0.65, 1.05), 0.06);
      s.life -= decayRate;
    }

    while (active < targetActive && this._spawnAcc >= 0.4) {
      const dead = this.shapes.find((sh) => sh.life <= 0);
      if (!dead) break;
      this._respawnShape(dead);
      active++;
      this._spawnAcc -= 0.4;
    }
  }

  _drawMorphShape(ctx, s, w, h, strokeW) {
    const t = s.morphT;
    const typeA = s.type;
    const typeB = s.morphTarget;

    const drawCircle = (sw, sh) => {
      ctx.beginPath();
      ctx.ellipse(0, 0, sw / 2, sh / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (strokeW > 0.5) ctx.stroke();
    };

    const drawRect = (sw, sh, radius) => {
      const hw = sw / 2;
      const hh = sh / 2;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(-hw, -hh, sw, sh, radius);
      } else {
        ctx.rect(-hw, -hh, sw, sh);
      }
      ctx.fill();
      if (strokeW > 0.5) ctx.stroke();
    };

    const paramsFor = (type) => {
      if (type === 0) return { w, h, radius: w / 2 };
      if (type === 1) return { w: w * 0.92, h: h * 0.92, radius: 2 };
      return { w: w * s.aspect, h: h * 0.72, radius: 4 };
    };

    const a = paramsFor(typeA);
    const b = paramsFor(typeB);
    const mw = lerp(a.w, b.w, t);
    const mh = lerp(a.h, b.h, t);
    const mr = lerp(a.radius, b.radius, t);

    if (typeA === 0 && typeB === 0) drawCircle(mw, mh);
    else if (typeA !== 0 && typeB !== 0) drawRect(mw, mh, mr);
    else drawCircle(lerp(typeA === 0 ? a.w : a.w * 0.85, typeB === 0 ? b.w : b.w * 0.85, t),
      lerp(typeA === 0 ? a.h : a.h * 0.85, typeB === 0 ? b.h : b.h * 0.85, t));
  }

  draw(ctx) {
    const mapped = this._mapped;
    const trailFade = 0.06 + (mapped.lifetime ?? 0.5) * 0.38;
    ctx.fillStyle = `rgba(4, 3, 10, ${trailFade})`;
    ctx.fillRect(0, 0, this.width, this.height);

    const strokeW = this._strokeW;
    const satBoost = (mapped.color ?? 0.5) * 35;

    for (const s of this.shapes) {
      if (s.life <= 0) continue;
      const lifeRatio = Math.max(0, s.life / s.maxLife);
      const alpha = this._alphaBase * lifeRatio;
      const w = s.size;
      const h = s.size * s.aspect;

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.rotation);

      ctx.fillStyle = this._pickColor(s.colorIdx, alpha, satBoost);
      ctx.strokeStyle = this._pickColor(s.colorIdx + 2, alpha * 0.85, satBoost + 15);
      ctx.lineWidth = strokeW;

      this._drawMorphShape(ctx, s, w, h, strokeW);
      ctx.restore();
    }
  }
}
