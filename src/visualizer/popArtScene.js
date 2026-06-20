import { createAudioSourceState, extractAudioSources, resetAudioSourceState } from '../audio/sources.js';
import { resolveMappedValues, DEFAULT_MAPPINGS } from './mappingMatrix.js';
import { CHARCOAL_BG, popArtColor, popArtStroke, POP_ART_ALPHA, POP_ART_COLORS } from './popArtPalette.js';
import {
  transformVertex,
  rotateNormal,
  projectPoint,
  shadeFactor,
  meshForShape,
} from './math3d.js';

const WIDTH = 1280;
const HEIGHT = 720;
const SHAPE_COUNT = 20;

/** 0 = large rectangle slab, 1 = cube square, 2 = oval ellipsoid */
const SHAPE_PRESETS = [
  { rx: 210, ry: 78, rz: 52, round: 0.04 },
  { rx: 105, ry: 105, rz: 105, round: 0.06 },
  { rx: 135, ry: 92, rz: 88, round: 1 },
];

function rand(a = 0, b = 1) {
  return a + Math.random() * (b - a);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function pickNextType(current) {
  const options = [0, 1, 2].filter((t) => t !== current);
  return options[Math.floor(Math.random() * options.length)];
}

function curatedLayout(n, w, h) {
  const cols = 5;
  const rows = 4;
  const positions = [];
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = ((col + 0.5) / cols) * w;
    const cy = ((row + 0.5) / rows) * h;
    const jitterX = ((i * 47) % 90 - 45) * 1.8;
    const jitterY = ((i * 83) % 90 - 45) * 1.4;
    positions.push({ x: cx + jitterX, y: cy + jitterY });
  }
  return positions;
}

function parseRgb(css) {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return { r: 200, g: 200, b: 200 };
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function shadeColor(css, factor) {
  const { r, g, b } = parseRgb(css);
  const f = Math.min(1, Math.max(0.45, factor));
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

/**
 * Slow-moving 3D Pop Art composition — extruded shapes tumbling on all axes.
 */
export class PopArtScene {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.mappings = { ...DEFAULT_MAPPINGS };
    this.viscosity = 0.38;
    this.sourceState = createAudioSourceState();
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    this._prevFrameTime = null;
    this._bgCanvas = null;
    this.palette = [...POP_ART_COLORS];
    this.shapes = this._initShapes(width, height);
  }

  setPalette(palette) {
    this.palette = palette?.length ? palette.map((c) => ({ ...c })) : [...POP_ART_COLORS];
    const n = this.palette.length;
    for (let i = 0; i < this.shapes.length; i++) {
      this.shapes[i].colorIdx = i % n;
    }
  }

  setMappings(mappings) {
    this.mappings = mappings;
  }

  setViscosity(v) {
    this.viscosity = Math.min(1, Math.max(0, v));
  }

  reset(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    this._prevFrameTime = null;
    this._bgCanvas = null;
    resetAudioSourceState(this.sourceState);
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    this.shapes = this._initShapes(width, height);
  }

  _initShapes(width, height) {
    const positions = curatedLayout(SHAPE_COUNT, width, height);
    const typeCycle = [0, 1, 2, 1, 0, 2, 1, 0, 2, 1, 0, 2, 1, 0, 1, 2, 0, 1, 2, 0];

    return positions.map((pos, i) => {
      const type = typeCycle[i % typeCycle.length];
      const preset = SHAPE_PRESETS[type];
      const morphTarget = pickNextType(type);
      const target = SHAPE_PRESETS[morphTarget];
      return {
        x: pos.x,
        y: pos.y,
        z: rand(-120, 120),
        vx: rand(-0.15, 0.15),
        vy: rand(-0.15, 0.15),
        vz: rand(-0.08, 0.08),
        rotX: rand(0, Math.PI * 2),
        rotY: rand(0, Math.PI * 2),
        rotZ: rand(0, Math.PI * 2),
        rotSpeedX: rand(-0.38, 0.38),
        rotSpeedY: rand(-0.32, 0.32),
        rotSpeedZ: rand(-0.42, 0.42),
        type,
        morphTarget,
        morphT: rand(0, 0.4),
        fromRx: preset.rx,
        fromRy: preset.ry,
        fromRz: preset.rz,
        fromRound: preset.round,
        toRx: target.rx,
        toRy: target.ry,
        toRz: target.rz,
        toRound: target.round,
        colorIdx: i % this.palette.length,
        colorBlend: 0,
        scale: 1,
        targetScale: 1,
        alpha: POP_ART_ALPHA,
      };
    });
  }

  _ensureBackground() {
    if (this._bgCanvas?.width === this.width) return;
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    const b = c.getContext('2d');
    b.fillStyle = CHARCOAL_BG;
    b.fillRect(0, 0, this.width, this.height);

    b.globalAlpha = 0.035;
    for (let i = 0; i < 2800; i++) {
      const v = 22 + (i * 17 % 18);
      b.fillStyle = `rgb(${v}, ${v}, ${v + 2})`;
      b.fillRect((i * 73) % this.width, (i * 131) % this.height, 1, 1);
    }
    b.globalAlpha = 1;
    this._bgCanvas = c;
  }

  _advanceMorph(s) {
    if (s.morphT >= 1) {
      s.type = s.morphTarget;
      s.morphTarget = pickNextType(s.type);
      const preset = SHAPE_PRESETS[s.type];
      const target = SHAPE_PRESETS[s.morphTarget];
      s.fromRx = preset.rx;
      s.fromRy = preset.ry;
      s.fromRz = preset.rz;
      s.fromRound = preset.round;
      s.toRx = target.rx;
      s.toRy = target.ry;
      s.toRz = target.rz;
      s.toRound = target.round;
      s.morphT = 0;
    }
  }

  update(frame) {
    let dt = 1 / 30;
    if (frame.time != null) {
      if (this._prevFrameTime != null) dt = Math.max(1 / 120, Math.min(0.1, frame.time - this._prevFrameTime));
      this._prevFrameTime = frame.time;
    }

    const sources = extractAudioSources(frame, this.sourceState, dt);
    const raw = resolveMappedValues(sources, this.mappings);

    const visc = this.viscosity;
    const dampRate = 0.028 + (1 - visc) * 0.065;

    for (const key of Object.keys(this.damped)) {
      this.damped[key] = lerp(this.damped[key], raw[key] ?? 0, dampRate);
    }

    const geo = this.damped.geometry;
    const col = this.damped.color;
    const mot = this.damped.motion;
    const morph = this.damped.morphing;

    const drag = 0.978 + visc * 0.018;
    const driftSpeed = 14 + (1 - visc) * 48 + mot * 28;
    const morphRate = 0.012 + morph * 0.035 + (1 - visc) * 0.012;
    const rotRate = 0.22 + mot * 0.35;
    const breathe = 1 + geo * 0.22;

    for (const s of this.shapes) {
      s.targetScale = breathe + Math.sin(s.rotY * 0.5) * geo * 0.06;
      s.scale = lerp(s.scale, s.targetScale, 0.055);

      s.colorBlend = lerp(s.colorBlend, col * 0.85, 0.035);

      const angle = s.rotY + mot * 0.9;
      s.vx += Math.cos(angle) * mot * 0.012;
      s.vy += Math.sin(angle * 0.7) * mot * 0.012;
      s.vz += Math.sin(angle * 0.5) * mot * 0.008;
      s.vx *= drag;
      s.vy *= drag;
      s.vz *= drag;

      s.x += s.vx * driftSpeed * dt;
      s.y += s.vy * driftSpeed * dt;
      s.z += s.vz * driftSpeed * dt * 0.85;

      s.rotX += s.rotSpeedX * rotRate * dt;
      s.rotY += s.rotSpeedY * rotRate * dt;
      s.rotZ += s.rotSpeedZ * rotRate * dt;

      const pad = 220;
      if (s.x < -pad) s.x = this.width + pad;
      if (s.x > this.width + pad) s.x = -pad;
      if (s.y < -pad) s.y = this.height + pad;
      if (s.y > this.height + pad) s.y = -pad;
      if (s.z > 280) s.z = -280;
      if (s.z < -280) s.z = 280;

      s.morphT = Math.min(1, s.morphT + morphRate * dt);
      this._advanceMorph(s);
    }
  }

  _shapeDimensions(s) {
    const t = easeInOut(s.morphT);
    return {
      rx: lerp(s.fromRx, s.toRx, t) * s.scale,
      ry: lerp(s.fromRy, s.toRy, t) * s.scale,
      rz: lerp(s.fromRz, s.toRz, t) * s.scale,
      round: lerp(s.fromRound, s.toRound, t),
    };
  }

  _collectDrawables() {
    const drawables = [];
    const w = this.width;
    const h = this.height;

    for (const s of this.shapes) {
      const { rx, ry, rz, round } = this._shapeDimensions(s);
      const mesh = meshForShape(rx, ry, rz, round);
      const offset = [s.x - w / 2, s.y - h / 2, s.z];
      const rot = [s.rotX, s.rotY, s.rotZ];
      const baseFill = popArtColor(this.palette, s.colorIdx, s.colorBlend, 1);
      const strokeBase = popArtStroke(this.palette, s.colorIdx, 1);

      for (const face of mesh) {
        const worldVerts = face.verts.map((v) => transformVertex(v, rot, offset));
        const viewNormal = rotateNormal(face.normal, rot);
        if (viewNormal[2] <= 0.05) continue;

        const projected = worldVerts.map((v) => projectPoint(v, w, h));
        const avgZ = projected.reduce((sum, p) => sum + p.z, 0) / projected.length;
        const shade = shadeFactor(viewNormal);

        drawables.push({
          avgZ,
          projected,
          fill: shadeColor(baseFill, shade),
          stroke: strokeBase,
        });
      }
    }

    drawables.sort((a, b) => a.avgZ - b.avgZ);
    return drawables;
  }

  draw(ctx) {
    this._ensureBackground();
    ctx.drawImage(this._bgCanvas, 0, 0);

    const strokeW = 2 + this.damped.geometry * 2;
    const drawables = this._collectDrawables();

    for (const d of drawables) {
      const pts = d.projected;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.fillStyle = d.fill;
      ctx.fill();
    }

    for (const d of drawables) {
      const pts = d.projected;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      ctx.lineWidth = strokeW;
      ctx.strokeStyle = d.stroke;
      ctx.stroke();
    }
  }
}
