import { DEFAULT_PALETTE, rgba } from '../images/palette.js';
import { DEFAULT_PARAM_WEIGHTS } from './paramWeights.js';

const WIDTH = 1280;
const HEIGHT = 720;
const STROKE_COUNT = 96;

function rand(a = 0, b = 1) {
  return a + Math.random() * (b - a);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function zoneAtY(yNorm) {
  if (yNorm < 0.38) return 'high';
  if (yNorm > 0.72) return 'bass';
  return 'mid';
}

/**
 * Impasto cityscape — scattered knife strokes across the canvas (not EQ bars).
 * Audio parameters are mixed via user-controlled weights from paramWeights.js.
 */
export class BrushstrokeCity {
  constructor(width = WIDTH, height = HEIGHT) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.animTime = 0;
    this.palette = [...DEFAULT_PALETTE];
    this.paletteShift = 0;
    this.backgroundImages = [];
    this.paramWeights = { ...DEFAULT_PARAM_WEIGHTS };

    this.strokeEnergy = new Float32Array(STROKE_COUNT).fill(0.15);
    this.strokeFast = new Float32Array(STROKE_COUNT).fill(0);
    this.strokes = this._initStrokes(width, height);

    this.smoothRms = 0.1;
    this.smoothCentroid = 0.5;
    this.smoothSpread = 0.35;
    this.smoothTexture = 0.25;
    this.smoothMid = 0.5;
    this.smoothPitch = 0.5;
    this.smoothTempo = 0.5;
    this.smoothBeatPulse = 0;
    this.skyShift = 0;

    this.panels = this._initPanels();
    this.streetlights = Array.from({ length: 8 }, (_, i) => ({
      x: rand(0.08, 0.92),
      phase: i * 1.4,
      reach: rand(0.12, 0.38),
    }));

    this._strokeSeed = rand(0, 1000);
  }

  _initStrokes(width, height) {
    return Array.from({ length: STROKE_COUNT }, (_, i) => {
      const yNorm = rand(0.08, 0.88);
      return {
        xNorm: rand(0.02, 0.98),
        yNorm,
        angle: rand(-0.55, 0.55),
        phase: rand(0, Math.PI * 2),
        bandIdx: Math.floor((i / STROKE_COUNT) * 47) % 48,
        sizeBase: rand(28, 92),
        depth: rand(0, 1),
        zone: zoneAtY(yNorm),
        chips: 4 + Math.floor(rand(0, 8)),
      };
    });
  }

  _initPanels() {
    return Array.from({ length: 6 }, (_, i) => ({
      x: rand(0.04, 0.72),
      y: rand(0.02, 0.42),
      w: rand(0.16, 0.34),
      h: rand(0.18, 0.4),
      rot: rand(-0.1, 0.1),
      imgIdx: i,
      phase: rand(0, Math.PI * 2),
    }));
  }

  setPalette(palette) {
    this.palette = palette?.length ? palette : [...DEFAULT_PALETTE];
  }

  setBackgroundImages(images) {
    this.backgroundImages = images ?? [];
  }

  setParamWeights(weights) {
    this.paramWeights = { ...DEFAULT_PARAM_WEIGHTS, ...weights };
  }

  w(key) {
    return this.paramWeights[key] ?? 0;
  }

  pickColor(offset = 0, alpha = 1, boost = 0) {
    const n = this.palette.length;
    const idx = ((Math.floor(this.paletteShift + offset) % n) + n) % n;
    return rgba(this.palette, idx, alpha, boost);
  }

  paletteIndexForStroke(stroke) {
    const edge = Math.abs(stroke.xNorm - 0.5) * 2;
    const n = this.palette.length;
    const pitchShift = Math.floor(this.smoothPitch * this.w('pitch') * (n - 1) * 0.25);
    if (edge > 0.48) {
      return Math.min(n - 1, Math.floor(edge * (n - 1)));
    }
    return Math.min(n - 1, Math.floor(n / 2 + (0.5 - edge) * (n / 2 - 1)) + pitchShift);
  }

  reset(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    this.time = 0;
    this.animTime = 0;
    this.strokeEnergy.fill(0.15);
    this.strokeFast.fill(0);
    this.strokes = this._initStrokes(width, height);
    this.skyShift = 0;
    this.panels = this._initPanels();
  }

  update(frame) {
    if (frame.time != null) {
      this.time = frame.time;
    } else {
      this.time += 1 / 30;
    }

    const {
      rms, bass, mid, high, bars, beat,
      beatPulse = 0, tempo = 0.5, pitch = 0.5,
      centroid = 0.5, spread = 0.35, texture = 0.25,
    } = frame;

    this.smoothRms = lerp(this.smoothRms, rms, 0.07);
    this.smoothCentroid = lerp(this.smoothCentroid, centroid, 0.09);
    this.smoothSpread = lerp(this.smoothSpread, spread, 0.08);
    this.smoothTexture = lerp(this.smoothTexture, texture, 0.1);
    this.smoothMid = lerp(this.smoothMid, mid, 0.1);
    this.smoothPitch = lerp(this.smoothPitch, pitch, 0.08);
    this.smoothTempo = lerp(this.smoothTempo, tempo, 0.04);
    this.smoothBeatPulse = lerp(this.smoothBeatPulse, beatPulse, beat ? 0.55 : 0.2);

    const tempoW = this.w('tempo');
    const animRate = 0.45 + this.smoothTempo * tempoW * 1.65;
    this.animTime += (1 / 30) * animRate;

    const pitchW = this.w('pitch');
    this.skyShift = lerp(
      this.skyShift,
      this.smoothPitch * pitchW * this.width * 0.35,
      0.04,
    );
    this.paletteShift = (
      this.paletteShift
      + 0.01
      + this.smoothTexture * this.w('texture') * 0.035
      + this.smoothPitch * pitchW * 0.02
    ) % this.palette.length;

    const bandW = this.w('frequencyBands');
    const rhythmW = this.w('rhythm');
    const loudW = this.w('loudness');
    const spreadW = this.w('spread');
    const bassW = this.w('bass');
    const midW = this.w('mid');
    const highW = this.w('high');

    for (let i = 0; i < STROKE_COUNT; i++) {
      const stroke = this.strokes[i];
      const barIdx = Math.min(bars.length - 1, stroke.bandIdx);
      const bar = bars[barIdx] ?? 0;
      const zoneVal = stroke.zone === 'bass' ? bass : stroke.zone === 'high' ? high : mid;
      const zoneW = stroke.zone === 'bass' ? bassW : stroke.zone === 'high' ? highW : midW;

      const organic = Math.sin(this.animTime * 0.4 + stroke.phase) * 0.035 * (0.3 + tempoW);
      const rhythmBoost = this.smoothBeatPulse * rhythmW * 0.16;
      const spreadLift = this.smoothSpread * spreadW * 0.12;

      const target = bar * bandW * 0.48
        + zoneVal * zoneW * 0.28
        + this.smoothRms * loudW * 0.22
        + rhythmBoost
        + spreadLift
        + organic
        + 0.06;

      this.strokeFast[i] = bar * bandW * 0.7 + rhythmBoost * 0.55;
      this.strokeEnergy[i] = lerp(this.strokeEnergy[i], target, 0.11);
    }

    this._frame = {
      rms, bass, mid, high, bars, beat, beatPulse, tempo, pitch, texture,
      smoothRms: this.smoothRms,
      smoothCentroid: this.smoothCentroid,
      smoothSpread: this.smoothSpread,
      smoothTexture: this.smoothTexture,
      smoothMid: this.smoothMid,
      smoothPitch: this.smoothPitch,
      smoothTempo: this.smoothTempo,
      smoothBeatPulse: this.smoothBeatPulse,
      animRate,
    };
  }

  draw(ctx, title = '') {
    const f = this._frame ?? {};

    ctx.fillStyle = `rgba(6, 4, 14, ${0.14 + f.smoothRms * this.w('loudness') * 0.07})`;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawDeepBackground(ctx, f);
    this.drawPopPanels(ctx, f);
    this.drawSkyWash(ctx, f);
    this.drawImpastoStrokes(ctx, false, 0, 0.45);
    this.drawImpastoStrokes(ctx, false, 1, 1);
    this.drawWetStreet(ctx, f);
    this.drawStreetlightArcs(ctx, f);
    this.drawKnifeHighlights(ctx, f);
    this.drawPaintSplatter(ctx, f);
    this.drawHorizonSmear(ctx, f);

    if (title && f.smoothTexture * this.w('texture') < 0.75) {
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(title, 18, this.height - 16);
    }
  }

  drawDeepBackground(ctx, f) {
    const loudW = this.w('loudness');
    for (let i = 0; i < STROKE_COUNT; i += 3) {
      const stroke = this.strokes[i];
      const energy = this.strokeEnergy[i];
      const x = stroke.xNorm * this.width;
      const y = stroke.yNorm * this.height;
      const w = stroke.sizeBase * (0.35 + energy * 0.5);
      const h = w * rand(1.8, 3.2);

      ctx.fillStyle = this.pickColor(this.paletteIndexForStroke(stroke), 0.07 + f.smoothRms * loudW * 0.05, -30);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(stroke.angle);
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  drawPopPanels(ctx, f) {
    if (!this.backgroundImages.length) return;
    ctx.globalCompositeOperation = 'screen';
    const speed = f.animRate ?? 1;
    const spreadW = this.w('spread');

    for (const panel of this.panels) {
      const imgEntry = this.backgroundImages[panel.imgIdx % this.backgroundImages.length];
      if (!imgEntry?.img?.complete) continue;

      const drift = Math.sin(this.animTime * 0.22 * speed + panel.phase) * 16 * f.smoothSpread * spreadW;
      const px = panel.x * this.width + drift;
      const py = panel.y * this.height;
      const pw = panel.w * this.width;
      const ph = panel.h * this.height;

      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate(panel.rot + Math.sin(this.animTime * 0.12 * speed + panel.phase) * 0.03);
      ctx.globalAlpha = 0.1 + f.smoothMid * this.w('mid') * 0.12 + f.smoothBeatPulse * this.w('rhythm') * 0.06;
      ctx.drawImage(imgEntry.img, -pw / 2, -ph / 2, pw, ph);
      ctx.strokeStyle = this.pickColor(panel.imgIdx, 0.4, 25);
      ctx.lineWidth = 4;
      ctx.strokeRect(-pw / 2, -ph / 2, pw, ph);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Horizontal sky wash — no radial / circular glow. */
  drawSkyWash(ctx, f) {
    const pitchW = this.w('pitch');
    const loudW = this.w('loudness');
    const horizon = this.height * 0.58;
    const shift = this.skyShift;

    ctx.save();
    ctx.translate(shift, 0);

    const g = ctx.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, this.pickColor(Math.floor(f.smoothPitch * pitchW * 2), 0.22 + f.smoothRms * loudW * 0.12, 35));
    g.addColorStop(0.45, this.pickColor(2, 0.1 + f.smoothMid * this.w('mid') * 0.1));
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-Math.abs(shift) - 20, 0, this.width + Math.abs(shift) * 2 + 40, horizon);

    const bandH = horizon / 5;
    for (let b = 0; b < 5; b++) {
      const alpha = 0.04 + f.smoothSpread * this.w('spread') * 0.06;
      ctx.fillStyle = this.pickColor(b, alpha);
      ctx.fillRect(-Math.abs(shift), b * bandH, this.width + Math.abs(shift) * 2, bandH * 0.85);
    }
    ctx.restore();
  }

  drawImpastoStrokes(ctx, mirror, layer, alphaScale) {
    const f = this._frame ?? {};
    const t = this.animTime + this._strokeSeed;
    const tempoW = this.w('tempo');
    const pitchW = this.w('pitch');
    const spreadW = this.w('spread');
    const textureW = this.w('texture');

    const sorted = this.strokes
      .map((stroke, i) => ({ stroke, i, energy: this.strokeEnergy[i] }))
      .sort((a, b) => a.stroke.depth - b.stroke.depth);

    for (const { stroke, i } of sorted) {
      const blend = layer === 0
        ? this.strokeEnergy[i]
        : lerp(this.strokeEnergy[i], this.strokeFast[i], 0.55);
      if (blend < 0.04) continue;

      const driftX = Math.sin(t * 0.55 + stroke.phase) * (8 + f.smoothSpread * spreadW * 22) * (mirror ? -0.5 : 1);
      const driftY = Math.sin(t * 0.38 + stroke.phase * 1.3) * (4 + f.smoothPitch * pitchW * 14);
      let x = stroke.xNorm * this.width + driftX;
      let y = stroke.yNorm * this.height + driftY * (mirror ? -1 : 1);

      if (mirror) {
        y = this.height * 0.78 + (y - this.height * 0.78) * 0.35;
      }

      const size = stroke.sizeBase * (0.42 + blend * 1.15) * (layer === 0 ? 0.85 : 1);
      const chips = layer === 0
        ? stroke.chips
        : stroke.chips + Math.floor(f.smoothTexture * textureW * 8);
      const colorBase = this.paletteIndexForStroke(stroke);
      const angle = stroke.angle + Math.sin(t * 0.35 + i * 0.5) * 0.18 * tempoW;

      for (let c = 0; c < chips; c++) {
        const chipW = size * rand(0.22, 0.42);
        const chipH = (size / chips) * rand(0.85, 1.2) * (1.4 + layer * 0.2);
        const ox = (c - chips / 2) * chipW * 0.35 + Math.sin(t * 0.6 + c) * 3;
        const oy = (c - chips / 2) * chipH * 0.12;
        const depthBoost = layer === 1 ? rand(-5, 40) : -25;

        ctx.save();
        ctx.translate(x + ox, y + oy);
        ctx.rotate(angle + Math.sin(t + c) * 0.08);
        ctx.fillStyle = this.pickColor(
          colorBase + (c % 3),
          (mirror ? 0.1 : 0.48 + (c / chips) * 0.42) * alphaScale,
          depthBoost,
        );
        ctx.fillRect(-chipW / 2, -chipH / 2, chipW, chipH);

        if (layer === 1 && c % 3 === 0 && textureW > 0) {
          ctx.fillStyle = this.pickColor(colorBase, 0.22 * alphaScale * textureW, 60);
          ctx.fillRect(-chipW * 0.35, -chipH * 0.25, chipW * 0.4, chipH * 0.35);
        }
        ctx.restore();
      }
    }
  }

  drawWetStreet(ctx, f) {
    const baseY = this.height * 0.78;
    const loudW = this.w('loudness');
    const rhythmW = this.w('rhythm');

    ctx.save();
    ctx.globalAlpha = 0.14 + f.smoothRms * loudW * 0.14 + f.smoothBeatPulse * rhythmW * 0.06;
    this.drawImpastoStrokes(ctx, true, 0, 0.55);
    ctx.globalAlpha = 1;
    ctx.restore();

    const wet = ctx.createLinearGradient(0, baseY, 0, this.height);
    wet.addColorStop(0, `rgba(0,0,0,${0.05 + f.smoothRms * loudW * 0.1})`);
    wet.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = wet;
    ctx.fillRect(0, baseY, this.width, this.height - baseY);
  }

  drawStreetlightArcs(ctx, f) {
    const textureW = this.w('texture');
    const rhythmW = this.w('rhythm');
    if (f.smoothTexture * textureW < 0.1 && f.smoothBeatPulse * rhythmW < 0.05) return;

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const speed = f.animRate ?? 1;
    const tempoW = this.w('tempo');
    const pitchW = this.w('pitch');
    const midW = this.w('mid');

    for (const sl of this.streetlights) {
      const x0 = sl.x * this.width;
      const y0 = this.height * 0.78;
      const reach = sl.reach * this.width * (0.75 + f.smoothMid * midW * 0.5 + f.smoothPitch * pitchW * 0.2);
      const sway = Math.sin(this.animTime * 0.28 * speed + sl.phase) * (18 + f.smoothTempo * tempoW * 22) * f.smoothTexture * textureW;

      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + sway, y0 - reach * 0.45, x0 + sway * 1.4, y0 - reach);
      ctx.strokeStyle = this.pickColor(0, 0.12 + f.smoothTexture * textureW * 0.28 + f.smoothBeatPulse * rhythmW * 0.15, 45);
      ctx.lineWidth = 2 + f.smoothTexture * textureW * 3 + f.smoothBeatPulse * rhythmW * 2;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawKnifeHighlights(ctx, f) {
    ctx.globalCompositeOperation = 'overlay';
    const rhythmW = this.w('rhythm');

    for (let i = 0; i < STROKE_COUNT; i += 4) {
      const energy = this.strokeEnergy[i];
      if (energy < 0.12) continue;
      const stroke = this.strokes[i];
      const x = stroke.xNorm * this.width;
      const y = stroke.yNorm * this.height;
      const h = stroke.sizeBase * energy * 0.55;
      ctx.fillStyle = this.pickColor(i % this.palette.length, 0.04 + f.smoothBeatPulse * rhythmW * 0.08, 70);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(stroke.angle);
      ctx.fillRect(-2, -h / 2, 4, h * 0.4);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawPaintSplatter(ctx, f) {
    const textureW = this.w('texture');
    const rhythmW = this.w('rhythm');
    const amount = f.smoothTexture * textureW + f.smoothBeatPulse * rhythmW * 0.4;
    if (amount < 0.15) return;

    ctx.globalCompositeOperation = 'screen';
    const splats = 3 + Math.floor(amount * 14);
    const pitchW = this.w('pitch');
    for (let i = 0; i < splats; i++) {
      const x = rand(0, this.width);
      const y = rand(this.height * 0.2, this.height * 0.95);
      const r = rand(3, 18) * amount;
      ctx.fillStyle = this.pickColor(i + Math.floor(f.smoothPitch * pitchW * 3), rand(0.05, 0.18), rand(-5, 35));
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * rand(0.25, 2.2), rand(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawHorizonSmear(ctx, f) {
    const y = this.height * 0.68;
    ctx.globalCompositeOperation = 'multiply';
    const tempoW = this.w('tempo');
    const rhythmW = this.w('rhythm');
    const loudW = this.w('loudness');
    const strokes = 10 + Math.floor(f.smoothTempo * tempoW * 8);
    for (let i = 0; i < strokes; i++) {
      const x = rand(0, this.width);
      const w = rand(50, 240) * (0.8 + f.smoothBeatPulse * rhythmW * 0.3);
      ctx.fillStyle = this.pickColor(i % this.palette.length, 0.07 + f.smoothRms * loudW * 0.1);
      ctx.fillRect(x, y + rand(-10, 10), w, rand(3, 9));
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
