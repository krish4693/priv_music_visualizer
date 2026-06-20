import { createAudioSourceState, extractAudioSources, resetAudioSourceState } from '../audio/sources.js';
import { resolveMappedValues, DEFAULT_MAPPINGS } from './mappingMatrix.js';
import { shapeParamsAt, traceMorphPath } from './shapeClip.js';

const WIDTH = 1280;
const HEIGHT = 720;
const BG = '#0a0a0a';

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function coverRect(imgW, imgH, viewW, viewH) {
  const ir = imgW / imgH;
  const vr = viewW / viewH;
  let dw;
  let dh;
  if (ir > vr) {
    dh = viewH;
    dw = viewH * ir;
  } else {
    dw = viewW;
    dh = viewW / ir;
  }
  return { dw, dh, dx: (viewW - dw) / 2, dy: (viewH - dh) / 2 };
}

/**
 * Music-reactive image visualizer — your photo is warped, shifted, recolored and glitched by audio.
 */
export class ImageMusicScene {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.image = null;
    this.mappings = { ...DEFAULT_MAPPINGS };
    this.viscosity = 0.35;
    this.sourceState = createAudioSourceState();
    this.damped = { zoom: 0, motion: 0, color: 0, glitch: 0, wave: 0, shapeMorph: 0 };
    this.shapePhase = 0;
    this._prevFrameTime = null;
    this.time = 0;
    this.panX = 0;
    this.panY = 0;
    this.hue = 0;
    this._bars = null;
  }

  setImage(img) {
    this.image = img?.complete ? img : null;
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
    this.time = 0;
    this.panX = 0;
    this.panY = 0;
    this.hue = 0;
    resetAudioSourceState(this.sourceState);
    this.damped = { zoom: 0, motion: 0, color: 0, glitch: 0, wave: 0, shapeMorph: 0 };
    this.shapePhase = 0;
  }

  update(frame) {
    let dt = 1 / 30;
    if (frame.time != null) {
      if (this._prevFrameTime != null) dt = Math.max(1 / 120, Math.min(0.1, frame.time - this._prevFrameTime));
      this.time = frame.time;
      this._prevFrameTime = frame.time;
    } else {
      this.time += dt;
    }

    this._bars = frame.bars ?? null;

    const sources = extractAudioSources(frame, this.sourceState, dt);
    const raw = resolveMappedValues(sources, this.mappings);

    const visc = this.viscosity;
    const dampRate = 0.032 + (1 - visc) * 0.07;

    for (const key of Object.keys(this.damped)) {
      this.damped[key] = lerp(this.damped[key], raw[key] ?? 0, dampRate);
    }

    const mot = this.damped.motion;
    const drift = (1 - visc) * 0.35 + 0.08;
    this.panX += Math.sin(this.time * 0.31) * drift * (0.4 + mot);
    this.panY += Math.cos(this.time * 0.27) * drift * (0.4 + mot);
    this.hue = (this.hue + (0.15 + this.damped.color * 1.2) * dt) % 360;

    const sm = this.damped.shapeMorph;
    const morphSpeed = 0.04 + sm * 0.14 + (1 - visc) * 0.05;
    this.shapePhase = (this.shapePhase + morphSpeed * dt) % 1;
  }

  _drawPlaceholder(ctx) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(220, 220, 230, 0.45)';
    ctx.font = '22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Upload an image to visualize', this.width / 2, this.height / 2);
    ctx.textAlign = 'start';
  }

  _drawImageLayer(ctx, img, layout, filter, dx, dy, scale, alpha = 1) {
    const w = this.width;
    const h = this.height;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(w / 2 + dx, h / 2 + dy);
    ctx.scale(scale, scale);
    ctx.filter = filter;
    ctx.drawImage(img, layout.dx - w / 2, layout.dy - h / 2, layout.dw, layout.dh);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _drawWave(ctx, img, wave, motion) {
    const cols = 48;
    const colW = this.width / cols;
    const z = this.damped.zoom;
    const scale = 1.04 + z * 0.38;
    const px = this.panX + motion * 35;
    const py = this.panY + motion * 28;

    ctx.save();
    ctx.translate(this.width / 2 + px, this.height / 2 + py);
    ctx.scale(scale, scale);
    ctx.translate(-this.width / 2, -this.height / 2);

    const amp = wave * 42;
    for (let col = 0; col < cols; col++) {
      const sx = (col / cols) * img.width;
      const sw = img.width / cols + 2;
      const bar = this._bars?.[Math.floor((col / cols) * (this._bars?.length ?? 1))] ?? 0;
      const offset = amp * Math.sin(col * 0.28 + this.time * 2.4) * (0.5 + bar);
      ctx.drawImage(img, sx, 0, sw, img.height, col * colW + offset, 0, colW + 1, this.height);
    }
    ctx.restore();
  }

  _drawGlitchSlices(ctx, img, layout, glitch, motion) {
    const slices = 22;
    const sh = this.height / slices;
    const scale = 1.04 + this.damped.zoom * 0.35;
    const px = this.panX + motion * 40;
    const py = this.panY + motion * 30;

    ctx.save();
    ctx.translate(this.width / 2 + px, this.height / 2 + py);
    ctx.scale(scale, scale);
    ctx.translate(-this.width / 2, -this.height / 2);

    for (let i = 0; i < slices; i++) {
      const barIdx = Math.floor((i / slices) * (this._bars?.length ?? 48));
      const bar = this._bars?.[barIdx] ?? 0;
      const offset = glitch * (55 + bar * 110) * Math.sin(i * 0.85 + this.time * 3.2);
      const srcY = (i / slices) * img.height;
      const srcH = img.height / slices + 2;
      ctx.drawImage(img, 0, srcY, img.width, srcH, layout.dx + offset, i * sh, layout.dw, sh + 1);
    }
    ctx.restore();
  }

  _drawShapeTiles(ctx, img, layout, filter, shapeMorph, px, py, scale) {
    const cols = 3;
    const rows = 2;
    const w = this.width;
    const h = this.height;
    const unit = Math.min(w, h) * 0.22 * (0.85 + shapeMorph * 0.35);
    const gap = 28;

    ctx.save();
    ctx.translate(w / 2 + px, h / 2 + py);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);

    const gridW = cols * unit * 2 + (cols - 1) * gap;
    const gridH = rows * unit * 2 + (rows - 1) * gap;
    const startX = w / 2 - gridW / 2 + unit;
    const startY = h / 2 - gridH / 2 + unit;

    let tile = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cx = startX + col * (unit * 2 + gap);
        const cy = startY + row * (unit * 2 + gap);
        const phase = (this.shapePhase + tile * 0.17) % 1;
        const params = shapeParamsAt(phase);
        const bulge = 1 + shapeMorph * 0.25 * Math.sin(this.time * 1.5 + tile);

        const srcCol = col / cols;
        const srcRow = row / rows;
        const sw = img.width / cols;
        const sh = img.height / rows;
        const sx = srcCol * img.width;
        const sy = srcRow * img.height;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(bulge, bulge);
        ctx.beginPath();
        traceMorphPath(ctx, params, unit);
        ctx.clip();
        ctx.filter = filter;
        const tw = unit * 2.2;
        const th = unit * 2.2;
        ctx.drawImage(img, sx, sy, sw, sh, -tw / 2, -th / 2, tw, th);
        ctx.filter = 'none';
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
        tile++;
      }
    }
    ctx.restore();
  }

  _drawShapeClip(ctx, img, layout, filter, shapeMorph, px, py, scale) {
    const w = this.width;
    const h = this.height;
    const unit = Math.min(w, h) * 0.46 * (0.9 + shapeMorph * 0.2);
    const params = shapeParamsAt(this.shapePhase);
    const bulge = 1 + shapeMorph * 0.18 * Math.sin(this.time * 2);

    ctx.save();
    ctx.translate(w / 2 + px, h / 2 + py);
    ctx.scale(scale * bulge, scale * bulge);
    ctx.beginPath();
    traceMorphPath(ctx, params, unit);
    ctx.clip();
    ctx.filter = filter;
    ctx.drawImage(img, layout.dx - w / 2, layout.dy - h / 2, layout.dw, layout.dh);
    ctx.filter = 'none';
    ctx.restore();

    ctx.save();
    ctx.translate(w / 2 + px, h / 2 + py);
    ctx.scale(scale * bulge, scale * bulge);
    ctx.beginPath();
    traceMorphPath(ctx, params, unit);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3 + shapeMorph * 4;
    ctx.stroke();
    ctx.restore();
  }

  draw(ctx) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, this.width, this.height);

    const img = this.image;
    if (!img?.complete || !img.naturalWidth) {
      this._drawPlaceholder(ctx);
      return;
    }

    const z = this.damped.zoom;
    const m = this.damped.motion;
    const c = this.damped.color;
    const g = this.damped.glitch;
    const wv = this.damped.wave;
    const sm = this.damped.shapeMorph;

    const layout = coverRect(img.naturalWidth, img.naturalHeight, this.width, this.height);
    const scale = 1.04 + z * 0.42;
    const px = this.panX + m * 55;
    const py = this.panY + m * 42;

    const hue = (this.hue + c * 90) % 360;
    const filter = `hue-rotate(${hue}deg) saturate(${1 + c * 1.1}) contrast(${1 + c * 0.55}) brightness(${0.9 + z * 0.2})`;

    const useShapeTiles = sm > 0.45;
    const useShapeClip = sm > 0.08 && !useShapeTiles;
    const useWave = wv > 0.12 && sm < 0.35;
    const useGlitch = g > 0.1 && !useWave && sm < 0.35;

    if (useShapeTiles) {
      this._drawShapeTiles(ctx, img, layout, filter, sm, px, py, scale);
    } else if (useShapeClip) {
      this._drawShapeClip(ctx, img, layout, filter, sm, px, py, scale);
    } else if (useWave) {
      ctx.filter = filter;
      this._drawWave(ctx, img, wv, m);
      ctx.filter = 'none';
    } else if (useGlitch) {
      ctx.filter = filter;
      this._drawGlitchSlices(ctx, img, layout, g, m);
      ctx.filter = 'none';
    } else {
      this._drawImageLayer(ctx, img, layout, filter, px, py, scale);
    }

    if (g > 0.18) {
      const split = g * 22;
      this._drawImageLayer(ctx, img, layout, 'none', px - split, py, scale, 0.55);
      ctx.globalCompositeOperation = 'screen';
      this._drawImageLayer(ctx, img, layout, 'hue-rotate(90deg)', px + split, py, scale, 0.45);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (z > 0.55 || g > 0.7) {
      ctx.fillStyle = `rgba(255,255,255,${z * 0.06})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }
}
