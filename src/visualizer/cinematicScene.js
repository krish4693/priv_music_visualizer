import * as THREE from 'three';
import { createAudioSourceState, extractAudioSources, resetAudioSourceState } from '../audio/sources.js';
import { resolveMappedValues, DEFAULT_MAPPINGS, VISUAL_TARGETS } from './mappingMatrix.js';
import { DEFAULT_VARIATION } from './variationStore.js';
import { DEFAULT_BG } from './backgroundStore.js';
import { POP_ART_COLORS, resolvePalette } from './popArtPalette.js';
import { SHAPE_PRESETS } from './shapePresets.js';
import { geometryForShapeType, cinematicMaterial, updateCinematicMaterial, UNIT } from './three/shapeFactory.js';
import { CameraRig } from './three/cameraRig.js';
import { createPostPipeline, resizePostPipeline, disposePostPipeline, applyPostSettings, updatePostTime } from './three/postPipeline.js';
import { loadCinematicSettings, normalizeCinematicSettings } from './cinematicSettingsStore.js';
import { spreadSpinAxis, spreadDriftAxis } from './motionSpread.js';
import { initSoftShapeMotion, updateSoftShapeMotion, syncSoftShapeMotionKind } from './roundShapeMotion.js';
import { CinematicTitleGroup } from './three/cinematicTitle.js';
import { titleTimingFromFrequency } from './titleStore.js';

const MIN_SHAPES = 8;
const MAX_SHAPES = 28;

function lerp(a, b, t) {
  return a + (b - a) * t;
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

function hexToThree(hex) {
  const c = new THREE.Color(hex || DEFAULT_BG);
  return c;
}

/** @param {{ r: number, g: number, b: number }[]} palette @param {number} idx @param {boolean} [snap=false] */
function paletteColorThree(palette, idx, snap = false) {
  const colors = resolvePalette(palette);
  const n = colors.length;
  const i = ((Math.floor(idx) % n) + n) % n;
  if (snap) {
    const c = colors[i];
    return new THREE.Color(c.r / 255, c.g / 255, c.b / 255);
  }
  const j = (i + 1) % n;
  const blend = idx - Math.floor(idx);
  const a = colors[i];
  const b = colors[j];
  return new THREE.Color(
    (a.r + (b.r - a.r) * blend) / 255,
    (a.g + (b.g - a.g) * blend) / 255,
    (a.b + (b.b - a.b) * blend) / 255,
  );
}

function screenToWorld(x, y, z, width, height) {
  return {
    x: (x / width - 0.5) * width * UNIT * 0.95,
    y: -(y / height - 0.5) * height * UNIT * 0.95,
    z: z * UNIT * 2.2,
  };
}

/**
 * WebGL cinematic scene — PBR shapes, bloom, fog, camera rig.
 * Mirrors PopArtScene API for renderer.js compatibility.
 */
export class CinematicScene {
  constructor(width = 1280, height = 720) {
    this.width = width;
    this.height = height;
    this.mappings = { ...DEFAULT_MAPPINGS };
    this.viscosity = 0.38;
    this.variation = { ...DEFAULT_VARIATION, enabledShapes: [...DEFAULT_VARIATION.enabledShapes] };
    this.rng = createRng(this.variation.seed);
    this.sourceState = createAudioSourceState();
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    this._prevFrameTime = null;
    this.bgColor = DEFAULT_BG;
    this.palette = [...POP_ART_COLORS];
    this.colorOffset = 0;
    this._beatFlash = 0;
    this.shapes = [];
    this.songTitle = '';
    this.titleFrequency = 65;
    this.titleColorIdx = 0;
    this.title = {
      opacity: 0,
      shapeIndex: 0,
      wasVisible: false,
      surpriseHold: 0,
    };
    this._titleClock = 0;
    this._cinematicTitle = new CinematicTitleGroup();
    this.liveAnalysis = null;
    this._automationSample = null;
    this._surpriseRush = 1;
    this._sceneTime = 0;
    this._motionTime = 0;
    this.cinematicSettings = normalizeCinematicSettings(loadCinematicSettings());

    this._initThree();
    this.shapes = this._initShapes(width, height);
    this._syncMeshes();
  }

  _initThree() {
    this._threeScene = new THREE.Scene();
    this._applyFog();

    this._camera = new THREE.PerspectiveCamera(42, this.width / this.height, 0.1, 120);
    this._cameraRig = new CameraRig(this._camera);
    this._cameraRig.setOrbitAmount(this.cinematicSettings.cameraOrbit);

    this._renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this._renderer.setSize(this.width, this.height, false);
    this._renderer.setPixelRatio(1);
    this._renderer.shadowMap.enabled = this.cinematicSettings.shadows;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this._renderer.toneMappingExposure = 1.08;
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    this._shapeRoot = new THREE.Group();
    this._threeScene.add(this._shapeRoot);

    this._ambient = new THREE.AmbientLight(0x8899bb, 0.42);
    this._keyLight = new THREE.DirectionalLight(0xfff4e8, 1.35);
    this._keyLight.position.set(2.5, 7, 10);
    this._keyLight.castShadow = true;
    this._keyLight.shadow.mapSize.set(1024, 1024);
    this._keyLight.shadow.camera.near = 1;
    this._keyLight.shadow.camera.far = 40;
    this._keyLight.shadow.camera.left = -12;
    this._keyLight.shadow.camera.right = 12;
    this._keyLight.shadow.camera.top = 12;
    this._keyLight.shadow.camera.bottom = -12;

    this._rimLight = new THREE.DirectionalLight(0x88bbff, 0.85);
    this._rimLight.position.set(-6, 3, -8);

    this._fillLight = new THREE.DirectionalLight(0xe8eeff, 0.35);
    this._fillLight.position.set(-2, 1, 12);

    this._frontLight = new THREE.DirectionalLight(0xffffff, 1.1);
    this._frontLight.position.set(0, 2.5, 14);

    this._threeScene.add(this._ambient, this._keyLight, this._rimLight, this._fillLight, this._frontLight);

    const floorGeo = new THREE.PlaneGeometry(40, 40);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a12,
      metalness: 0.65,
      roughness: 0.82,
    });
    this._floor = new THREE.Mesh(floorGeo, floorMat);
    this._floor.rotation.x = -Math.PI / 2;
    this._floor.position.y = -2.8;
    this._floor.receiveShadow = true;
    this._threeScene.add(this._floor);

    this._post = createPostPipeline(this._renderer, this._threeScene, this._camera, this.width, this.height, this.cinematicSettings);
    this._applyCinematicSettings();
    this._applyBackgroundColor(this.bgColor);
  }

  _materialOpts() {
    const s = this.cinematicSettings;
    return {
      metalness: s.metalness,
      roughness: s.roughness,
      emissive: s.emissive,
      trueColors: !!s.trueColors,
    };
  }

  _applyFog() {
    const density = (this.cinematicSettings.fog / 100) * 0.12;
    if (density <= 0.001) {
      this._threeScene.fog = null;
      return;
    }
    if (!(this._threeScene.fog instanceof THREE.FogExp2)) {
      this._threeScene.fog = new THREE.FogExp2(hexToThree(this.bgColor), density);
    } else {
      this._threeScene.fog.density = density;
      this._threeScene.fog.color.copy(hexToThree(this.bgColor));
    }
  }

  setCinematicSettings(settings) {
    this.cinematicSettings = normalizeCinematicSettings(settings);
    this._applyCinematicSettings();
  }

  getCinematicSettings() {
    return { ...this.cinematicSettings };
  }

  _applyCinematicSettings() {
    const s = this.cinematicSettings;
    this._renderer.toneMappingExposure = s.exposure / 100;
    this._renderer.shadowMap.enabled = s.shadows;
    this._keyLight.castShadow = s.shadows;
    this._keyLight.intensity = (s.keyLight / 100) * 2;
    this._fillLight.intensity = (s.fillLight / 100) * 1;
    this._frontLight.intensity = (s.frontLight / 100) * 1.8;
    this._rimLight.intensity = (s.rimLight / 100) * 1.5;
    this._ambient.intensity = (s.ambient / 100) * 1;
    this._floor.material.metalness = s.floorGloss / 100;
    this._floor.material.roughness = 1 - (s.floorGloss / 100) * 0.55;
    this._floor.visible = s.showFloor;
    this._cameraRig.setOrbitAmount(s.cameraOrbit);
    this._applyFog();
    if (this._post) applyPostSettings(this._post, s);
    this._updateMeshMaterials();
  }

  _updateMeshMaterials() {
    const opts = this._materialOpts();
    const snapColors = opts.trueColors && this.variation.colorMode === 'manual';
    for (const s of this.shapes) {
      const mesh = this._meshByShape.get(s);
      if (!mesh?.material) continue;
      const color = paletteColorThree(this.palette, s.colorIdx + this.colorOffset, snapColors);
      updateCinematicMaterial(mesh.material, color, opts);
    }
  }

  _applyBackgroundColor(color) {
    const c = hexToThree(color);
    this._threeScene.background = c;
    this._renderer.setClearColor(c, 1);
    if (this._threeScene.fog instanceof THREE.FogExp2) {
      this._threeScene.fog.color.copy(c);
    }
  }

  getRenderCanvas() {
    return this._renderer.domElement;
  }

  setAutomationSample(sample) {
    this._automationSample = sample;
  }

  getLiveAnalysisState() {
    return this.liveAnalysis;
  }

  setSongTitle(text) {
    this.songTitle = (text || '').trim().slice(0, 80);
    this.title.wasVisible = false;
    this._rebuildTitleMesh();
  }

  setTitleFrequency(freq) {
    this.titleFrequency = Math.min(100, Math.max(0, freq));
  }

  _rebuildTitleMesh() {
    if (!this.songTitle) {
      this._cinematicTitle.clear();
      return;
    }
    const color = paletteColorThree(this.palette, this.titleColorIdx + this.colorOffset);
    this._cinematicTitle.rebuild(this.songTitle, color, this._materialOpts());
  }

  _pickTitleHostIndex() {
    const preferred = new Set(['rectangle', 'cube', 'pillar']);
    const candidates = [];
    for (let i = 0; i < this.shapes.length; i++) {
      const s = this.shapes[i];
      const type = s.morphT < 0.5 ? s.type : s.morphTarget;
      if (preferred.has(type)) candidates.push(i);
    }
    if (candidates.length) return candidates[Math.floor(this.rng() * candidates.length)];
    return Math.floor(this.rng() * this.shapes.length);
  }

  _updateTitle(frame, dt = 1 / 30) {
    if (!this.songTitle || !this.shapes.length) {
      this.title.opacity = 0;
      this.title.wasVisible = false;
      this._cinematicTitle.setOpacity(0);
      return;
    }

    if (this.title.surpriseHold > 0) {
      this.title.surpriseHold = Math.max(0, this.title.surpriseHold - dt);
      this.title.opacity = 1;
      this.title.wasVisible = true;
      if (frame.beat) {
        this.titleColorIdx = (this.titleColorIdx + 1) % this.palette.length;
        this._rebuildTitleMesh();
      }
      this._syncTitleMesh();
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
      this._rebuildTitleMesh();
    }

    if (frame.beat && inWindow && opacity > 0.5) {
      this.titleColorIdx = (this.titleColorIdx + 1) % this.palette.length;
      this._rebuildTitleMesh();
    }

    this.title.wasVisible = inWindow;
    this.title.opacity = opacity;
    this._syncTitleMesh();
  }

  _syncTitleMesh() {
    const host = this.shapes[this.title.shapeIndex];
    const hostMesh = host ? this._meshByShape.get(host) : null;
    if (!host || !hostMesh || this.title.opacity <= 0.02) {
      this._cinematicTitle.syncToHost(null, null);
      this._cinematicTitle.setOpacity(0);
      return;
    }
    this._cinematicTitle.syncToHost(hostMesh, host);
    this._cinematicTitle.setOpacity(this.title.opacity);
  }

  setPalette(palette) {
    this.palette = palette?.length ? palette.map((c) => ({ ...c })) : [...POP_ART_COLORS];
    this._updateMeshColors();
    this._rebuildTitleMesh();
  }

  setMappings(mappings) {
    this.mappings = mappings;
  }

  setViscosity(v) {
    this.viscosity = Math.min(1, Math.max(0, v));
  }

  setBackgroundColor(color) {
    this.bgColor = color || DEFAULT_BG;
    this._applyBackgroundColor(this.bgColor);
  }

  setVariation(settings) {
    const prevEnabled = [...(this.variation.enabledShapes ?? [])].sort().join(',');
    this.variation = {
      ...settings,
      enabledShapes: settings.enabledShapes?.length ? [...settings.enabledShapes] : ['cube'],
      shapeCount: Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, settings.shapeCount ?? DEFAULT_VARIATION.shapeCount)),
    };
    this.rng = createRng(this.variation.seed);
    const nextEnabled = [...this.variation.enabledShapes].sort().join(',');
    if (prevEnabled !== nextEnabled) {
      this.regenerate();
    }
  }

  resetPlayhead() {
    this._prevFrameTime = null;
    this._motionTime = 0;
    resetAudioSourceState(this.sourceState);
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
  }

  regenerate() {
    this._clearMeshes();
    this.rng = createRng(this.variation.seed);
    this.shapes = this._initShapes(this.width, this.height);
    this.colorOffset = 0;
    this._surpriseRush = 1;
    this._syncMeshes();
  }

  reset(width = this.width, height = this.height) {
    this.width = width;
    this.height = height;
    this._prevFrameTime = null;
    resetAudioSourceState(this.sourceState);
    this.damped = { geometry: 0, color: 0, motion: 0, morphing: 0 };
    this.colorOffset = 0;
    this._surpriseRush = 1;
    this.rng = createRng(this.variation.seed);
    this._resizeThree(width, height);
    this._clearMeshes();
    this.shapes = this._initShapes(width, height);
    this._syncMeshes();
  }

  _resizeThree(width, height) {
    this._camera.aspect = width / height;
    this._camera.updateProjectionMatrix();
    this._renderer.setSize(width, height, false);
    resizePostPipeline(this._post, width, height);
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
    }
    if (!enabled.has(s.morphTarget)) {
      s.morphTarget = this._pickNextType(s.type);
    }
  }

  _activeShapeType(s) {
    return s.morphT < 0.5 ? s.type : s.morphTarget;
  }

  _updateMeshGeometryForShape(s) {
    const mesh = this._meshByShape.get(s);
    if (!mesh) return;
    const activeType = this._activeShapeType(s);
    mesh.geometry.dispose();
    mesh.geometry = geometryForShapeType(activeType, s.sizeMul);
  }

  _advanceMorph(s) {
    if (s.morphT < 1) return;
    s.type = s.morphTarget;
    s.morphTarget = this._pickNextType(s.type);
    this._enforceEnabledTypes(s);
    s.morphT = 0;
    syncSoftShapeMotionKind(s, SHAPE_PRESETS[s.type]?.kind ?? 'box');
    this._updateMeshGeometryForShape(s);
  }

  _initShapes(width, height) {
    const rng = this.rng;
    const count = Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, this.variation.shapeCount));
    const spread = this.variation.layoutSpread / 100;
    const sizeSpread = this.variation.sizeSpread / 100;
    const spin = this.variation.spinIntensity / 100;
    const speedSpread = (this.variation.speedSpread ?? DEFAULT_VARIATION.speedSpread) / 100;
    const depth = this.variation.depthRange / 100;
    const enabled = this._enabledShapeIds();
    const positions = curatedLayout(count, width, height, spread, rng);

    return positions.map((pos, i) => {
      const type = enabled[Math.floor(rng() * enabled.length)];
      const morphTarget = this._pickNextType(type, rng);
      const sizeMul = 1 + (rng() - 0.5) * sizeSpread * 0.55;
      const zRange = 80 + depth * 200;
      const spinMul = 0.35 + spin * 0.85;
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
        sizeMul,
        scale: 1,
        targetScale: 1,
        colorIdx: i % this.palette.length,
        surpriseSpinBoost: 1,
        surpriseScale: 1,
      };
      initSoftShapeMotion(rng, shape, SHAPE_PRESETS[type]?.kind ?? 'box');
      return shape;
    });
  }

  _clearMeshes() {
    this._cinematicTitle.syncToHost(null, null);
    for (const child of [...this._shapeRoot.children]) {
      child.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
      this._shapeRoot.remove(child);
    }
    this._meshByShape = new Map();
  }

  _syncMeshes() {
    this._meshByShape = new Map();
    for (let i = 0; i < this.shapes.length; i++) {
      const s = this.shapes[i];
      const color = paletteColorThree(this.palette, s.colorIdx + this.colorOffset);
      const geo = geometryForShapeType(this._activeShapeType(s), s.sizeMul);
      const mat = cinematicMaterial(color, this._materialOpts());
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._shapeRoot.add(mesh);
      this._meshByShape.set(s, mesh);
    }
    this._applyShapeTransforms();
  }

  _updateMeshColors() {
    this._updateMeshMaterials();
  }

  _applyShapeTransforms() {
    for (const s of this.shapes) {
      const mesh = this._meshByShape.get(s);
      if (!mesh) continue;
      const w = screenToWorld(
        s.x + (s.wobbleX ?? 0),
        s.y + (s.wobbleY ?? 0),
        s.z + (s.wobbleZ ?? 0),
        this.width,
        this.height,
      );
      mesh.position.set(w.x, w.y, w.z);
      mesh.rotation.set(s.rotX + (s.tiltX ?? 0), s.rotY, s.rotZ + (s.tiltZ ?? 0));
      const sc = s.scale * (s.surpriseScale ?? 1);
      const preset = SHAPE_PRESETS[this._activeShapeType(s)];
      let scaleX = sc * (s.squashX ?? 1);
      let scaleY = sc * (s.squashY ?? 1);
      let scaleZ = sc * (s.squashZ ?? 1);
      if (preset?.kind === 'torus') scaleZ *= preset.rz / preset.rx;
      mesh.scale.set(scaleX, scaleY, scaleZ);
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
    this._updateMeshColors();
  }

  _snapshotLiveAnalysis(sources, raw, frame, geo, mot, morph) {
    const snapSources = this._automationSample?.sources ?? sources;
    let colorDrive = this.damped.color;
    if (this._automationSample?.effective) {
      colorDrive = this._automationSample.effective.color;
    }
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
      effective: { geometry: geo, color: colorDrive, motion: mot, morphing: morph },
      flags: {
        manualMotion: !!this.variation.manualSpeed,
        manualColor: this.variation.colorMode === 'manual',
        colorFromMode: this.variation.colorMode !== 'manual',
      },
    };
  }

  update(frame) {
    let dt = 1 / 30;
    if (frame.time != null) {
      if (this._prevFrameTime != null) dt = Math.max(1 / 120, Math.min(0.1, frame.time - this._prevFrameTime));
      this._prevFrameTime = frame.time;
      this._sceneTime = frame.time;
    }
    const motionDt = dt * (this.variation.animationSpeed ?? 1);
    this._motionTime += motionDt;

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
        this._updateMeshColors();
      }
    } else {
      this._updateColorVariation(sources, frame, dt);
    }

    const geo = this.damped.geometry;
    let mot = this.damped.motion;
    let morph = this.damped.morphing;
    const depth = this.variation.depthRange / 100;

    if (this.variation.manualSpeed) {
      mot = this.variation.manualSpeedValue / 100;
      morph = mot * 0.8;
    }
    mot *= this._surpriseRush;

    const drag = 0.978 + visc * 0.018;
    const driftSpeed = 16 + (1 - visc) * 62 + mot * 78;
    const spinMul = 0.35 + (this.variation.spinIntensity / 100) * 0.85;
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

      s.rotX += s.rotSpeedX * rotRate * motionDt * (s.surpriseSpinBoost ?? 1);
      s.rotY += s.rotSpeedY * rotRate * motionDt * (s.surpriseSpinBoost ?? 1);
      s.rotZ += s.rotSpeedZ * rotRate * motionDt * (s.surpriseSpinBoost ?? 1);
      s.morphT = Math.min(1, s.morphT + (0.015 + morph * 0.07) * motionDt);
      const prevActive = this._activeShapeType(s);
      this._advanceMorph(s);
      const nextActive = this._activeShapeType(s);
      if (prevActive !== nextActive) {
        this._updateMeshGeometryForShape(s);
      }
      syncSoftShapeMotionKind(s, SHAPE_PRESETS[this._activeShapeType(s)]?.kind ?? 'box');
      updateSoftShapeMotion(s, mot, motionDt);
    }

    this._cameraRig.update(this._motionTime, mot);
    this._updateTitle(frame, motionDt);
    this._applyShapeTransforms();
    this._snapshotLiveAnalysis(sources, raw, frame, geo, mot, morph);
  }

  _letterboxAmount() {
    return (this.cinematicSettings.letterbox / 100) * 0.12;
  }

  _drawLetterbox(ctx) {
    const bar = Math.round(this.height * this._letterboxAmount());
    if (bar < 2) return;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, bar);
    ctx.fillRect(0, this.height - bar, this.width, bar);
  }

  draw(ctx) {
    updatePostTime(this._post, this._motionTime);
    // EffectComposer output does not reach the default framebuffer when blitting
    // WebGL into the 2D preview canvas — render the scene directly instead.
    this._renderer.setRenderTarget(null);
    this._renderer.clear(true, true, true);
    this._renderer.render(this._threeScene, this._camera);
    const gl = this._renderer.getContext();
    gl.finish();

    ctx.drawImage(this._renderer.domElement, 0, 0, this.width, this.height);
    this._drawLetterbox(ctx);
  }

  dispose() {
    this._clearMeshes();
    this._cinematicTitle.dispose();
    disposePostPipeline(this._post);
    this._floor.geometry.dispose();
    this._floor.material.dispose();
    this._renderer.dispose();
  }
}
