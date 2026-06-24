import { createAudioSourceState, extractAudioSources, resetAudioSourceState } from '../audio/sources.js';
import { resolveMappedValues, DEFAULT_MAPPINGS, VISUAL_TARGETS } from './mappingMatrix.js';
import { DEFAULT_VARIATION } from './variationStore.js';
import { elementMotionScale, elementTurnScale, element3dScale, elementSizeMultiplier } from './elementMotion.js';
import { elementDistanceRange, applyShapeBalloonSeparation } from './elementBalloonPhysics.js';
import { DEFAULT_BG } from './backgroundStore.js';
import { loadCinematicSettings, normalizeCinematicSettings } from './cinematicSettingsStore.js';
import { SHAPE_PRESETS, getShapeKind } from './shapePresets.js';
import { CHARCOAL_BG, popArtColor, POP_ART_ALPHA, POP_ART_COLORS } from './popArtPalette.js';
import { TitleLetters3D } from './titleText3d.js';
import { titleTimingFromFrequency, DEFAULT_TITLE_FREQUENCY } from './titleStore.js';
import {
  transformVertex,
  rotateNormal,
  projectPoint,
  shadeFactor,
  flatMeshForPreset,
} from './math3d.js';
import { zoomProjectedPoints } from './sceneCore/drawHelpers.js';
import { spreadSpinAxis, spreadDriftAxis } from './motionSpread.js';
import { initSoftShapeMotion, updateSoftShapeMotion, syncSoftShapeMotionKind } from './roundShapeMotion.js';
import {
  getActiveConceptId,
  initConceptEntities,
  updateConceptExtras,
  drawConceptScene,
  isGeometricConcept,
  resetLivingSongState,
} from './concepts/index.js';
import { isCanvasFluidConcept, isLivingSongConcept } from './visualConceptStore.js';
import { drawLivingSongSpaceBackground } from './sceneCore/spaceBackground.js';
import { drawLivingSongOverlays } from './concepts/conceptRenderers.js';
import { resetLiquidSim } from './concepts/liquidsOnCanvasConcept.js';
import { applyViewZoom } from './viewZoom.js';

const WIDTH = 1280;
const HEIGHT = 720;
const MIN_SHAPES = 1;
const MAX_SHAPES = 28;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function createRng(seed) {
  let s = (Math.abs(Math.floor(seed)) || 1) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function curatedLayout(n, w, h, spread = 0.5, rng = Math.random) {
  const cols = 5;
  const rows = Math.ceil(n / cols);
  const positions = [];
  const jitterScale = 0.35 + spread * 1.65;
  for (let i = 0; i < n; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const cx = ((col + 0.5) / cols) * w;
    const cy = ((row + 0.5) / rows) * h;
    const jitterX = (((i * 47) % 90 - 45) + (rng() - 0.5) * 40) * jitterScale;
    const jitterY = (((i * 83) % 90 - 45) + (rng() - 0.5) * 40) * jitterScale;
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
  const f = Math.min(1, Math.max(0.85, factor));
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

function edgeStrokeColor(css, factor = 0.38) {
  const { r, g, b } = parseRgb(css);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
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
    this.variation = { ...DEFAULT_VARIATION, enabledShapes: [...DEFAULT_VARIATION.enabledShapes] };
    this.rng = createRng(this.variation.seed);
    this.sourceState = createAudioSourceState();
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    this._prevFrameTime = null;
    this._bgCanvas = null;
    this.bgColor = DEFAULT_BG;
    this.palette = [...POP_ART_COLORS];
    this.colorOffset = 0;
    this._beatFlash = 0;
    this.shapes = [];
    this.songTitle = '';
    this.songDuration = 0;
    this.titleFrequency = DEFAULT_TITLE_FREQUENCY;
    this.titleLetters = new TitleLetters3D();
    this.titleColorIdx = 0;
    this.title = {
      opacity: 0,
      shapeIndex: 0,
      wasVisible: false,
      surpriseHold: 0,
    };
    this._titleClock = 0;
    this._surpriseRush = 1;
    this._surpriseFlash = 0;
    this._surpriseCooldown = 1.5;
    this._surpriseTimer = 0;
    this.liveAnalysis = null;
    this._automationSample = null;
    this.cinematicSettings = normalizeCinematicSettings(loadCinematicSettings());
  }

  _cameraZoom() {
    return this.cinematicSettings?.cameraZoom ?? 50;
  }

  setCinematicSettings(settings) {
    this.cinematicSettings = normalizeCinematicSettings(settings);
  }

  setAutomationSample(sample) {
    this._automationSample = sample;
  }

  getLiveAnalysisState() {
    return this.liveAnalysis;
  }

  _computeColorDrive(sources, frame) {
    const shift = this.variation.colorShift / 100;
    const mode = this.variation.colorMode;
    if (mode === 'manual') return null;
    if (mode === 'tempo') {
      return Math.min(1, Math.max(0, (sources.tempoPhase ?? 0) * shift));
    }
    if (mode === 'energy') {
      const amp = sources.amplitude ?? 0;
      const pulse = frame.beatPulse ?? 0;
      return Math.min(1, Math.max(0, amp * shift * 0.4 + this._beatFlash * shift * 0.6 + pulse * shift * 0.25));
    }
    return null;
  }

  _snapshotLiveAnalysis(sources, raw, frame, geo, mot, morph) {
    const snapSources = this._automationSample?.sources ?? sources;
    let colorDrive = this._computeColorDrive(snapSources, frame);
    if (this._automationSample?.effective) {
      colorDrive = this._automationSample.effective.color;
    }
    const manualMotion = !!this.variation.manualSpeed;
    /** @type {Record<string, number|null>} */
    const sourceInputs = {};
    for (const { id } of VISUAL_TARGETS) {
      const entry = this.mappings[id] ?? DEFAULT_MAPPINGS[id];
      const src = entry?.source ?? 'none';
      sourceInputs[id] = src === 'none' ? null : (snapSources[src] ?? 0);
    }

    this.liveAnalysis = {
      sources: { ...snapSources },
      mapped: { ...raw },
      damped: { ...this.damped },
      sourceInputs,
      effective: {
        geometry: geo,
        color: colorDrive ?? this.damped.color,
        motion: mot,
        morphing: morph,
      },
      flags: {
        manualMotion,
        manualColor: this.variation.colorMode === 'manual',
        colorFromMode: this.variation.colorMode !== 'manual',
      },
    };
  }

  setSongTitle(text) {
    this.songTitle = (text || '').trim().slice(0, 80);
    this.title.wasVisible = false;
    this._rebuildTitleLetters();
    if (getActiveConceptId(this.variation) === 'typography') {
      this.regenerate();
    }
  }

  setSongDuration(seconds) {
    this.songDuration = Math.max(0, seconds || 0);
  }

  setTitleFrequency(freq) {
    this.titleFrequency = Math.min(100, Math.max(0, freq));
  }

  _rebuildTitleLetters() {
    if (!this.songTitle) {
      this.titleLetters.rebuild('');
      return;
    }
    const fill = popArtColor(this.palette, this.titleColorIdx, 0, 1);
    this.titleLetters.rebuild(this.songTitle, fill);
  }

  setPalette(palette) {
    this.palette = palette?.length ? palette.map((c) => ({ ...c })) : [...POP_ART_COLORS];
    if (isCanvasFluidConcept(getActiveConceptId(this.variation)) && this._conceptState?.sim) {
      resetLiquidSim(
        this._conceptState.sim,
        this.palette,
        this.rng,
        this.variation.liquidSourceMode,
      );
    } else if (isLivingSongConcept(getActiveConceptId(this.variation)) && this._conceptState) {
      resetLivingSongState(this.variation, this._conceptState, this.rng, this.palette.length);
    } else {
      const n = this.palette.length;
      for (let i = 0; i < this.shapes.length; i++) {
        this.shapes[i].colorIdx = i % n;
      }
    }
    this._rebuildTitleLetters();
  }

  setMappings(mappings) {
    this.mappings = mappings;
  }

  setViscosity(v) {
    this.viscosity = Math.min(1, Math.max(0, v));
  }

  setBackgroundColor(color) {
    const next = color || DEFAULT_BG;
    if (this.bgColor !== next) {
      this.bgColor = next;
      this._bgCanvas = null;
    }
  }

  setVariation(settings) {
    const prevEnabled = [...(this.variation.enabledShapes ?? [])].sort().join(',');
    const prevConcept = getActiveConceptId(this.variation);
    const prevCount = this.variation.shapeCount;
    this.variation = {
      ...settings,
      enabledShapes: settings.enabledShapes?.length ? [...settings.enabledShapes] : ['cube'],
      shapeCount: Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, settings.shapeCount ?? DEFAULT_VARIATION.shapeCount)),
    };
    this.rng = createRng(this.variation.seed);
    const nextEnabled = [...this.variation.enabledShapes].sort().join(',');
    const nextConcept = getActiveConceptId(this.variation);
    if (prevEnabled !== nextEnabled || prevConcept !== nextConcept || prevCount !== this.variation.shapeCount) {
      this.regenerate();
    } else if (isGeometricConcept(nextConcept)) {
      for (const s of this.shapes) this._enforceEnabledTypes(s);
    }
  }

  _rebuildEntities(width = this.width, height = this.height) {
    const conceptEntities = initConceptEntities(this, width, height);
    this.shapes = conceptEntities ?? this._initShapes(width, height);
  }

  /** Rebuild scene with current variation (e.g. after seed or shape change). */
  resetPlayhead(options = {}) {
    const resetConcept = options.resetConcept !== false;
    this._prevFrameTime = null;
    this._titleClock = 0;
    resetAudioSourceState(this.sourceState);
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    if (resetConcept && isLivingSongConcept(getActiveConceptId(this.variation)) && this._conceptState) {
      resetLivingSongState(this.variation, this._conceptState, this.rng, this.palette.length);
    }
  }

  regenerate() {
    this._prevFrameTime = null;
    this.colorOffset = 0;
    this._beatFlash = 0;
    this._surpriseRush = 1;
    this._surpriseFlash = 0;
    this._surpriseCooldown = 1.5;
    this._surpriseTimer = 0;
    this._titleClock = 0;
    this.title.wasVisible = false;
    this.title.surpriseHold = 0;
    this.rng = createRng(this.variation.seed);
    this._rebuildEntities(this.width, this.height);
  }

  reset(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    this._prevFrameTime = null;
    this._bgCanvas = null;
    resetAudioSourceState(this.sourceState);
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    this.colorOffset = 0;
    this._beatFlash = 0;
    this._surpriseRush = 1;
    this._surpriseFlash = 0;
    this._surpriseCooldown = 1.5;
    this._surpriseTimer = 0;
    this._titleClock = 0;
    this.title.wasVisible = false;
    this.title.surpriseHold = 0;
    this.rng = createRng(this.variation.seed);
    this._rebuildEntities(width, height);
  }

  _enabledShapeIds() {
    const enabled = this.variation.enabledShapes.filter((id) => SHAPE_PRESETS[id]);
    return enabled.length ? enabled : ['cube'];
  }

  _pickNextType(current, rng = this.rng) {
    const options = this._enabledShapeIds().filter((t) => t !== current);
    if (!options.length) return current;
    return options[Math.floor(rng() * options.length)];
  }

  _enforceEnabledTypes(s) {
    const enabled = new Set(this._enabledShapeIds());
    if (enabled.has(s.type) && enabled.has(s.morphTarget)) return;

    if (!enabled.has(s.type)) {
      s.type = this._pickNextType(s.type);
      const preset = SHAPE_PRESETS[s.type];
      s.fromRx = preset.rx * s.sizeMul;
      s.fromRy = preset.ry * s.sizeMul;
      s.fromRz = preset.rz * s.sizeMul;
      s.fromRound = preset.round ?? 0;
    }

    if (!enabled.has(s.morphTarget)) {
      s.morphTarget = this._pickNextType(s.type);
      const target = SHAPE_PRESETS[s.morphTarget];
      s.toRx = target.rx * s.sizeMul;
      s.toRy = target.ry * s.sizeMul;
      s.toRz = target.rz * s.sizeMul;
      s.toRound = target.round ?? 0;
    }
  }

  _initShapes(width, height) {
    const rng = this.rng;
    const count = Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, this.variation.shapeCount));
    const spread = (this.variation.layoutSpread / 100) * elementDistanceRange(this.variation, Math.min(width, height) * 0.5).orbitScale;
    const spin = this.variation.spinIntensity / 100;
    const speedSpread = (this.variation.speedSpread ?? DEFAULT_VARIATION.speedSpread) / 100;
    const depth = this.variation.depthRange / 100;
    const turnMul = elementTurnScale(this.variation);
    const dim3Mul = element3dScale(this.variation);
    const motion = elementMotionScale(this.variation);
    const enabled = this._enabledShapeIds();
    const positions = curatedLayout(count, width, height, spread, rng);

    return positions.map((pos, i) => {
      const type = enabled[Math.floor(rng() * enabled.length)];
      const preset = SHAPE_PRESETS[type];
      const morphTarget = this._pickNextType(type, rng);
      const target = SHAPE_PRESETS[morphTarget];
      const sizeMul = elementSizeMultiplier(this.variation, i, count, rng);
      const zRange = (80 + depth * 200) * dim3Mul * motion;
      const spinMul = (0.35 + spin * 0.85) * turnMul * motion;

      const z = (rng() - 0.5) * zRange * 2;

      const shape = {
        x: pos.x,
        y: pos.y,
        z,
        homeX: pos.x,
        homeY: pos.y,
        homeZ: z,
        vx: spreadDriftAxis(rng, 0.3, speedSpread),
        vy: spreadDriftAxis(rng, 0.3, speedSpread),
        vz: spreadDriftAxis(rng, 0.16, speedSpread, 0.5 + depth),
        rotX: rng() * Math.PI * 2,
        rotY: rng() * Math.PI * 2,
        rotZ: rng() * Math.PI * 2,
        rotSpeedX: spreadSpinAxis(rng, 0.76, spinMul, speedSpread),
        rotSpeedY: spreadSpinAxis(rng, 0.64, spinMul, speedSpread),
        rotSpeedZ: spreadSpinAxis(rng, 0.84, spinMul, speedSpread),
        type,
        morphTarget,
        morphT: rng() * 0.4,
        fromRx: preset.rx * sizeMul,
        fromRy: preset.ry * sizeMul,
        fromRz: preset.rz * sizeMul,
        fromRound: preset.round ?? 0,
        toRx: target.rx * sizeMul,
        toRy: target.ry * sizeMul,
        toRz: target.rz * sizeMul,
        toRound: target.round ?? 0,
        colorIdx: i % this.palette.length,
        colorBlend: 0,
        sizeMul,
        scale: 1,
        targetScale: 1,
        surpriseSpinBoost: 1,
        surpriseScale: 1,
        alpha: POP_ART_ALPHA,
      };
      initSoftShapeMotion(rng, shape, preset.kind);
      return shape;
    });
  }

  _ensureBackground() {
    if (this._bgCanvas?.width === this.width && this._bgCanvasColor === this.bgColor) return;
    const c = document.createElement('canvas');
    c.width = this.width;
    c.height = this.height;
    const b = c.getContext('2d');
    b.fillStyle = this.bgColor || CHARCOAL_BG;
    b.fillRect(0, 0, this.width, this.height);

    b.globalAlpha = 0.035;
    for (let i = 0; i < 600; i++) {
      const v = 22 + (i * 17 % 18);
      b.fillStyle = `rgb(${v}, ${v}, ${v + 2})`;
      b.fillRect((i * 73) % this.width, (i * 131) % this.height, 1, 1);
    }
    b.globalAlpha = 1;
    this._bgCanvas = c;
    this._bgCanvasColor = this.bgColor;
  }

  _advanceMorph(s) {
    if (s.morphT >= 1) {
      s.type = s.morphTarget;
      s.morphTarget = this._pickNextType(s.type);
      const enabled = new Set(this._enabledShapeIds());
      if (!enabled.has(s.type)) {
        s.type = this._pickNextType(s.type);
      }
      if (!enabled.has(s.morphTarget)) {
        s.morphTarget = this._pickNextType(s.type);
      }
      const preset = SHAPE_PRESETS[s.type];
      const target = SHAPE_PRESETS[s.morphTarget];
      s.fromRx = preset.rx * s.sizeMul;
      s.fromRy = preset.ry * s.sizeMul;
      s.fromRz = preset.rz * s.sizeMul;
      s.fromRound = preset.round ?? 0;
      s.toRx = target.rx * s.sizeMul;
      s.toRy = target.ry * s.sizeMul;
      s.toRz = target.rz * s.sizeMul;
      s.toRound = target.round ?? 0;
      s.morphT = 0;
      syncSoftShapeMotionKind(s, SHAPE_PRESETS[s.type]?.kind ?? 'box');
    }
  }

  _updateColorVariation(sources, frame, dt) {
    const shift = this.variation.colorShift / 100;
    const mode = this.variation.colorMode;

    if (mode === 'manual') return;

    if (mode === 'tempo') {
      const phase = sources.tempoPhase ?? 0;
      this.colorOffset = lerp(this.colorOffset, phase * shift * this.palette.length * 0.35, 0.04);
    } else if (mode === 'energy') {
      const amp = sources.amplitude ?? 0;
      const pulse = frame.beatPulse ?? 0;
      if (frame.beat) this._beatFlash = 1;
      this._beatFlash = Math.max(0, this._beatFlash - dt * 3.5);
      const target = amp * shift * 0.4 + this._beatFlash * shift * 0.6 + pulse * shift * 0.25;
      this.colorOffset = lerp(this.colorOffset, target * this.palette.length, 0.06);
    }
  }

  _effectiveColorIdx(s) {
    return s.colorIdx + this.colorOffset;
  }

  _pickTitleHostIndex() {
    if (!isGeometricConcept(getActiveConceptId(this.variation))) {
      return Math.floor(this.rng() * Math.max(1, this.shapes.length));
    }
    const preferred = new Set(['rectangle', 'cube', 'pillar']);
    const candidates = [];

    for (let i = 0; i < this.shapes.length; i++) {
      const s = this.shapes[i];
      const type = s.morphT < 0.5 ? s.type : s.morphTarget;
      if (preferred.has(type)) candidates.push(i);
    }

    if (candidates.length) {
      return candidates[Math.floor(this.rng() * candidates.length)];
    }
    return Math.floor(this.rng() * this.shapes.length);
  }

  _snapMorphShape(s) {
    s.type = s.morphTarget;
    s.morphTarget = this._pickNextType(s.type);
    const enabled = new Set(this._enabledShapeIds());
    if (!enabled.has(s.type)) s.type = this._pickNextType(s.type);
    if (!enabled.has(s.morphTarget)) s.morphTarget = this._pickNextType(s.type);
    const preset = SHAPE_PRESETS[s.type];
    const target = SHAPE_PRESETS[s.morphTarget];
    s.fromRx = preset.rx * s.sizeMul;
    s.fromRy = preset.ry * s.sizeMul;
    s.fromRz = preset.rz * s.sizeMul;
    s.fromRound = preset.round ?? 0;
    s.toRx = target.rx * s.sizeMul;
    s.toRy = target.ry * s.sizeMul;
    s.toRz = target.rz * s.sizeMul;
    s.toRound = target.round ?? 0;
    s.morphT = 0;
  }

  _fireSurprise(frame) {
    const types = ['turbo', 'whirl', 'pop', 'slingshot', 'morph-flip', 'palette-jolt', 'flash'];
    if (this.songTitle) types.push('title-pop');
    const type = types[Math.floor(this.rng() * types.length)];
    const si = Math.floor(this.rng() * this.shapes.length);
    const s = this.shapes[si];

    switch (type) {
      case 'turbo':
        this._surpriseRush = 3.4;
        this._surpriseFlash = 0.18;
        break;
      case 'whirl':
        s.surpriseSpinBoost = 7 + this.rng() * 5;
        break;
      case 'pop':
        s.surpriseScale = 2.1 + this.rng() * 0.7;
        break;
      case 'slingshot':
        if (!this.variation.fixedLayout) {
          s.vx += (this.rng() - 0.5) * 3.2;
          s.vy += (this.rng() - 0.5) * 3.2;
          s.vz += (this.rng() - 0.5) * 2.4;
        } else {
          s.surpriseSpinBoost = 4 + this.rng() * 3;
        }
        break;
      case 'morph-flip':
        this._snapMorphShape(s);
        s.surpriseScale = 1.35 + this.rng() * 0.25;
        break;
      case 'palette-jolt':
        this.colorOffset += (Math.floor(this.rng() * 4) + 2) * (this.rng() > 0.5 ? 1 : -1);
        this._surpriseFlash = 0.42;
        if (frame.beat) this._beatFlash = 1;
        break;
      case 'title-pop':
        this.title.surpriseHold = 2.4;
        this.title.shapeIndex = this._pickTitleHostIndex();
        this.titleColorIdx = Math.floor(this.rng() * this.palette.length);
        this._rebuildTitleLetters();
        this.title.opacity = 1;
        this.title.wasVisible = true;
        break;
      case 'flash':
        this._surpriseFlash = 0.62;
        break;
      default:
        break;
    }
  }

  _updateSurprises(sources, frame, dt) {
    if (!isGeometricConcept(getActiveConceptId(this.variation))) return;
    if (this._surpriseRush > 1) {
      this._surpriseRush = Math.max(1, this._surpriseRush - dt * 2.4);
    }
    this._surpriseFlash = Math.max(0, this._surpriseFlash - dt * 2.6);

    for (const s of this.shapes) {
      if (s.surpriseSpinBoost > 1) {
        s.surpriseSpinBoost = Math.max(1, s.surpriseSpinBoost - dt * 3.2);
      }
      if (s.surpriseScale > 1.01) {
        s.surpriseScale = lerp(s.surpriseScale, 1, Math.min(1, dt * 2.8));
      } else {
        s.surpriseScale = 1;
      }
    }

    if (!this.variation.surprises) return;
    const rate = (this.variation.surpriseRate ?? 55) / 100;
    if (rate <= 0) return;

    this._surpriseCooldown = Math.max(0, this._surpriseCooldown - dt);
    if (this._surpriseCooldown > 0) return;

    const beatBoost = frame.beat ? 0.45 : 0;
    const energyBoost = (sources.amplitude ?? 0) * 0.3;
    const interval = 5 + (1 - rate) * 16;

    this._surpriseTimer -= dt;
    const roll = this.rng();
    const beatGate = frame.beat || this._surpriseTimer <= 0;
    const chance = dt * (0.12 + rate * 0.38 + beatBoost + energyBoost);

    if (!beatGate && roll > chance) return;

    this._fireSurprise(frame);
    this._surpriseCooldown = interval * (0.45 + this.rng() * 0.75);
    this._surpriseTimer = 0.35 + this.rng() * 0.55;
  }

  _updateTitle(frame, dt = 1 / 30) {
    if (getActiveConceptId(this.variation) === 'typography') {
      this.title.opacity = 0;
      this.title.wasVisible = false;
      return;
    }
    if (!this.songTitle || !this.shapes.length) {
      this.title.opacity = 0;
      this.title.wasVisible = false;
      this.title.surpriseHold = 0;
      return;
    }

    if (this.title.surpriseHold > 0) {
      this.title.surpriseHold = Math.max(0, this.title.surpriseHold - dt);
      this.title.opacity = 1;
      this.title.wasVisible = true;
      if (frame.beat) {
        this.titleColorIdx = (this.titleColorIdx + 1) % this.palette.length;
        this._rebuildTitleLetters();
      }
      return;
    }

    let t = frame.time;
    if (t == null || !Number.isFinite(t)) {
      this._titleClock += dt;
      t = this._titleClock;
    }

    const { cycleSec, showSec, fadeSec } = titleTimingFromFrequency(this.titleFrequency);
    const phaseOffset = ((this.variation.seed % 100) / 100) * Math.max(0, cycleSec - showSec - 0.5);
    const pos = (t + phaseOffset) % cycleSec;
    const inWindow = pos < showSec;

    let opacity = 0;
    if (inWindow) {
      if (pos < fadeSec) opacity = pos / fadeSec;
      else if (pos > showSec - fadeSec) opacity = (showSec - pos) / fadeSec;
      else opacity = 1;
    }

    if (inWindow && !this.title.wasVisible) {
      this.title.shapeIndex = this._pickTitleHostIndex();
      this.titleColorIdx = Math.floor(this.rng() * this.palette.length);
      this._rebuildTitleLetters();
    }

    if (frame.beat && inWindow && opacity > 0.5) {
      this.titleColorIdx = (this.titleColorIdx + 1) % this.palette.length;
      this._rebuildTitleLetters();
    }

    this.title.wasVisible = inWindow;
    this.title.opacity = opacity;
  }

  _collectTitleDrawables(s, shapeParams) {
    if (this.title.opacity <= 0.01 || !this.songTitle) {
      return { solids: [] };
    }

    const w = this.width;
    const h = this.height;
    const rot = [s.rotX, s.rotY, s.rotZ];
    const offset = [s.x - w / 2, s.y - h / 2, s.z];
    const faceFill = popArtColor(this.palette, this.titleColorIdx, 0, 1);
    const sideFill = popArtColor(this.palette, this.titleColorIdx + 1, 0, 1);
    const edgeFill = popArtColor(this.palette, this.titleColorIdx + 2, 0, 1);

    return this.titleLetters.collectDrawables(
      rot,
      offset,
      shapeParams,
      w,
      h,
      faceFill,
      sideFill,
      edgeFill,
      !!this.variation.kanten,
    );
  }

  update(frame) {
    let dt = 1 / 30;
    if (frame.time != null) {
      if (this._prevFrameTime != null) dt = Math.max(1 / 120, Math.min(0.1, frame.time - this._prevFrameTime));
      this._prevFrameTime = frame.time;
    }
    const motionDt = dt * (this.variation.animationSpeed ?? 1);

    const sources = extractAudioSources(frame, this.sourceState, dt);
    const raw = resolveMappedValues(sources, this.mappings);

    const visc = this.viscosity;
    const dampRate = 0.028 + (1 - visc) * 0.065;

    for (const key of Object.keys(this.damped)) {
      this.damped[key] = lerp(this.damped[key], raw[key] ?? 0, dampRate);
    }

    if (this._automationSample?.effective) {
      const e = this._automationSample.effective;
      this.damped.geometry = e.geometry;
      this.damped.color = e.color;
      this.damped.motion = e.motion;
      this.damped.morphing = e.morphing;
      if (this.variation.colorMode !== 'manual') {
        const target = e.color * this.palette.length;
        this.colorOffset = lerp(this.colorOffset, target, 0.12);
      }
    } else {
      this._updateColorVariation(sources, frame, dt);
    }
    this._updateSurprises(sources, frame, motionDt);

    const geo = this.damped.geometry;
    let mot = this.damped.motion;
    let morph = this.damped.morphing;
    const depth = this.variation.depthRange / 100;
    const useConcept = !isGeometricConcept(getActiveConceptId(this.variation));

    if (this.variation.manualSpeed) {
      const manual = this.variation.manualSpeedValue / 100;
      mot = manual;
      morph = manual * 0.8;
    }

    mot *= this._surpriseRush;

    const drag = 0.978 + visc * 0.018;
    const driftSpeed = 16 + (1 - visc) * 62 + mot * 78;
    const morphRate = 0.015 + morph * 0.07 + (1 - visc) * 0.018;
    const spinMul = (0.35 + (this.variation.spinIntensity / 100) * 0.85)
      * elementTurnScale(this.variation)
      * elementMotionScale(this.variation);
    const rotRate = (0.24 + mot * 0.72) * spinMul;
    const breathe = 1 + geo * 0.22;
    const zLimit = 180 + depth * 140;
    const fixedLayout = this.variation.fixedLayout !== false;

    for (const s of this.shapes) {
      s.targetScale = breathe + Math.sin(s.rotY * 0.5) * geo * 0.06;
      s.scale = lerp(s.scale, s.targetScale, 0.055);

      if (fixedLayout) {
        s.vx = 0;
        s.vy = 0;
        s.vz = 0;
        s.x = s.homeX;
        s.y = s.homeY;
        s.z = s.homeZ;
      } else {
        const angle = s.rotY + mot * 0.9;
        s.vx += Math.cos(angle) * mot * 0.012;
        s.vy += Math.sin(angle * 0.7) * mot * 0.012;
        s.vz += Math.sin(angle * 0.5) * mot * 0.008 * (0.6 + depth * 0.6);
        s.vx *= drag;
        s.vy *= drag;
        s.vz *= drag;

        s.x += s.vx * driftSpeed * motionDt;
        s.y += s.vy * driftSpeed * motionDt;
        s.z += s.vz * driftSpeed * motionDt * 0.85;

        const pad = 220;
        if (s.x < -pad) s.x = this.width + pad;
        if (s.x > this.width + pad) s.x = -pad;
        if (s.y < -pad) s.y = this.height + pad;
        if (s.y > this.height + pad) s.y = -pad;
        if (s.z > zLimit) s.z = -zLimit;
        if (s.z < -zLimit) s.z = zLimit;
      }

      s.rotX += s.rotSpeedX * rotRate * motionDt * s.surpriseSpinBoost;
      s.rotY += s.rotSpeedY * rotRate * motionDt * s.surpriseSpinBoost;
      s.rotZ += s.rotSpeedZ * rotRate * motionDt * s.surpriseSpinBoost;

      if (!useConcept) {
        s.morphT = Math.min(1, s.morphT + morphRate * motionDt);
        this._advanceMorph(s);
        syncSoftShapeMotionKind(s, getShapeKind(s.morphT < 0.5 ? s.type : s.morphTarget));
        updateSoftShapeMotion(s, mot, motionDt);
      }
    }

    if (this.shapes.length && isGeometricConcept(getActiveConceptId(this.variation))) {
      applyShapeBalloonSeparation(
        this.shapes,
        this.variation,
        elementMotionScale(this.variation) * mot,
        motionDt,
        this.width,
        this.height,
      );
    }

    if (useConcept) {
      updateConceptExtras(this, {
        mot,
        geo,
        morph,
        motionDt,
        beat: frame.beat,
        sources,
        songTime: frame.time ?? 0,
        tempo: frame.tempo ?? 0.5,
        songDuration: this.songDuration ?? 0,
      });
    }

    this._updateTitle(frame, motionDt);
    this._snapshotLiveAnalysis(sources, raw, frame, geo, mot, morph);
  }

  _shapeRenderParams(s) {
    const t = easeInOut(s.morphT);
    const activeType = t < 0.5 ? s.type : s.morphTarget;
    const kind = getShapeKind(activeType);
    const sizeScale = s.scale * (s.surpriseScale ?? 1);
    const rounded = !!this.variation.roundedEdges;
    const cornerAmt = (this.variation.cornerRound ?? 45) / 100;

    let round = 0;
    if (rounded) {
      if (kind === 'ellipsoid' || kind === 'egg') {
        round = Math.min(1, lerp(s.fromRound, s.toRound, t));
      } else {
        round = cornerAmt * 0.55;
      }
    }

    return {
      kind,
      rx: lerp(s.fromRx, s.toRx, t) * sizeScale * (s.squashX ?? 1),
      ry: lerp(s.fromRy, s.toRy, t) * sizeScale * (s.squashY ?? 1),
      rz: lerp(s.fromRz, s.toRz, t) * sizeScale * (s.squashZ ?? 1),
      round,
      roundedEdges: rounded,
    };
  }

  _meshForShape(params) {
    const { kind, rx, ry, rz, round, roundedEdges } = params;
    return flatMeshForPreset(kind, rx, ry, rz, round, roundedEdges);
  }

  _shapeDepth(s) {
    const w = this.width;
    const h = this.height;
    const params = this._shapeRenderParams(s);
    const mesh = this._meshForShape(params);
    const offset = [s.x - w / 2, s.y - h / 2, s.z];
    const rot = [s.rotX, s.rotY, s.rotZ];
    let sum = 0;
    let count = 0;

    for (const face of mesh) {
      const worldVerts = face.verts.map((v) => transformVertex(v, rot, offset));
      const viewNormal = rotateNormal(face.normal, rot);
      if (viewNormal[2] <= 0.05) continue;
      sum += worldVerts.reduce((acc, v) => acc + v[2], 0) / worldVerts.length;
      count++;
    }

    return count ? sum / count : s.z;
  }

  _collectShapeDrawables(s) {
    const w = this.width;
    const h = this.height;
    const params = this._shapeRenderParams(s);
    const mesh = this._meshForShape(params);
    const offset = [
      s.x - w / 2 + (s.wobbleX ?? 0) + (s.balloonX ?? 0),
      s.y - h / 2 + (s.wobbleY ?? 0) + (s.balloonY ?? 0),
      s.z + (s.wobbleZ ?? 0) + (s.balloonZ ?? 0),
    ];
    const rot = [s.rotX + (s.tiltX ?? 0), s.rotY, s.rotZ + (s.tiltZ ?? 0)];
    const colorIdx = this._effectiveColorIdx(s);
    const colorBlend = colorIdx - Math.floor(colorIdx);
    const baseFill = popArtColor(this.palette, colorIdx, colorBlend, 1);
    const drawables = [];
    const showEdges = !!this.variation.kanten;

    for (const face of mesh) {
      const worldVerts = face.verts.map((v) => transformVertex(v, rot, offset));
      const viewNormal = rotateNormal(face.normal, rot);
      if (viewNormal[2] <= 0.05) continue;

      const projected = zoomProjectedPoints(
        worldVerts.map((v) => projectPoint(v, w, h)),
        w,
        h,
        this._cameraZoom(),
      );
      const avgZ = projected.reduce((acc, p) => acc + p.z, 0) / projected.length;
      const shade = shadeFactor(viewNormal);
      const fill = shadeColor(baseFill, shade);

      drawables.push({
        avgZ,
        projected,
        fill,
        stroke: showEdges ? edgeStrokeColor(fill) : null,
      });
    }

    drawables.sort((a, b) => a.avgZ - b.avgZ);
    return drawables;
  }

  _ensureShapeLayer() {
    if (!this._shapeLayer || this._shapeLayer.width !== this.width || this._shapeLayer.height !== this.height) {
      this._shapeLayer = document.createElement('canvas');
      this._shapeLayer.width = this.width;
      this._shapeLayer.height = this.height;
    }
    return this._shapeLayer;
  }

  _drawShapeLayer(lc, s, shapeIndex, clearLayer = true) {
    if (clearLayer) lc.clearRect(0, 0, this.width, this.height);

    const shapeParams = this._shapeRenderParams(s);
    const drawables = this._collectShapeDrawables(s);
    const titleOnShape = shapeIndex === this.title.shapeIndex && this.title.opacity > 0.01;
    const letterDrawables = titleOnShape ? this._collectTitleDrawables(s, shapeParams) : { solids: [] };

    for (const d of drawables) {
      const pts = d.projected;
      lc.beginPath();
      lc.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) lc.lineTo(pts[i].x, pts[i].y);
      lc.closePath();
      lc.fillStyle = d.fill;
      lc.fill();
      if (d.stroke) {
        lc.strokeStyle = d.stroke;
        lc.lineWidth = 1.15;
        lc.stroke();
      }
    }

    if (titleOnShape) {
      const combined = [...letterDrawables.solids].sort((a, b) => a.avgZ - b.avgZ);
      for (const d of combined) {
        const pts = d.projected;
        lc.beginPath();
        lc.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) lc.lineTo(pts[i].x, pts[i].y);
        lc.closePath();
        lc.globalAlpha = this.title.opacity;
        lc.fillStyle = d.fill;
        lc.fill();
        if (d.stroke) {
          lc.strokeStyle = d.stroke;
          lc.lineWidth = 1;
          lc.stroke();
        }
      }
      lc.globalAlpha = 1;
    }
  }

  draw(ctx) {
    this._ensureBackground();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    if (isLivingSongConcept(getActiveConceptId(this.variation))) {
      drawLivingSongSpaceBackground(this, ctx);
      drawConceptScene(this, ctx);
      drawLivingSongOverlays(this, ctx);
    } else {
      ctx.drawImage(this._bgCanvas, 0, 0);

      if (!isGeometricConcept(getActiveConceptId(this.variation))) {
        drawConceptScene(this, ctx);
      } else {
      const layer = this._ensureShapeLayer();
      const lc = layer.getContext('2d');
      lc.globalAlpha = 1;
      lc.globalCompositeOperation = 'source-over';

      const sortedEntries = this.shapes
        .map((s, i) => ({ s, i, depth: this._shapeDepth(s) }))
        .sort((a, b) => a.depth - b.depth);

      lc.clearRect(0, 0, this.width, this.height);
      for (const { s, i } of sortedEntries) {
        this._drawShapeLayer(lc, s, i, false);
      }
      ctx.drawImage(layer, 0, 0);
      }
    }

    if (this._surpriseFlash > 0.01) {
      const flashColor = popArtColor(this.palette, this.colorOffset + 2, 0, 1);
      ctx.globalAlpha = this._surpriseFlash * 0.28;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.globalAlpha = 1;
    }
  }
}
