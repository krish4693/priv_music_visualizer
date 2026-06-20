import { PopArtScene } from './popArtScene.js';
import { CinematicScene } from './cinematicScene.js';
import { loadMappingMatrix, cloneMappings, loadViscosity } from './mappingMatrix.js';
import { loadVariation, cloneVariation } from './variationStore.js';
import { loadBackgroundColor, DEFAULT_BG } from './backgroundStore.js';
import { loadSongTitle, loadTitleFrequency } from './titleStore.js';
import { loadRendererMode, saveRendererMode, RENDERER_MODES } from './rendererModeStore.js';
import {
  loadCinematicSettings,
  saveCinematicSettings,
  normalizeCinematicSettings,
} from './cinematicSettingsStore.js';
import { AutomationRecorder } from './automationStore.js';
import { applyPalettePreset, getActivePalette } from './paletteStore.js';

const WIDTH = 1280;
const HEIGHT = 720;

let scene = null;
/** @type {'popart'|'cinematic'} */
let rendererMode = loadRendererMode();
let currentMappings = loadMappingMatrix();
let currentViscosity = loadViscosity();
let currentVariation = loadVariation();
let currentPalette = null;
let currentBackground = loadBackgroundColor();
let currentSongTitle = loadSongTitle();
let currentTitleFrequency = loadTitleFrequency();
let currentCinematicSettings = loadCinematicSettings();
const playbackAutomation = new AutomationRecorder();
/** @type {string|null} */
let lastAutomationPaletteSig = null;

function applyPaletteFromAutomation(palette) {
  if (!palette?.selectedKeys?.length) return null;
  const sig = [...palette.selectedKeys].sort().join('|');
  if (sig === lastAutomationPaletteSig) return null;
  lastAutomationPaletteSig = sig;
  const paletteState = applyPalettePreset(palette);
  const active = getActivePalette(paletteState.fullPalette, paletteState.selectedPaletteIndices);
  setVisualizerPalette(active);
  return paletteState;
}

export function clearAutomationPaletteCache() {
  lastAutomationPaletteSig = null;
}

/** @param {import('./automationStore.js').AutomationKeyframe[]} keyframes */
export function setPlaybackAutomation(keyframes) {
  clearAutomationPaletteCache();
  if (!keyframes?.length) {
    playbackAutomation.clear();
    clearAutomationSample();
    return;
  }
  playbackAutomation.loadKeyframes(keyframes);
}

export function getPlaybackAutomation() {
  return playbackAutomation.exportData();
}

/** @returns {{ sample: import('./automationStore.js').AutomationKeyframe|null, paletteState: ReturnType<typeof applyPalettePreset>|null }} */
export function syncAutomationAtTime(time) {
  if (!playbackAutomation.isActive) {
    clearAutomationSample();
    return { sample: null, paletteState: null };
  }
  const sample = playbackAutomation.sampleAt(time);
  if (!sample) {
    clearAutomationSample();
    return { sample: null, paletteState: null };
  }
  setAutomationSample(sample);
  setViscosity(sample.viscosity);
  setMappingMatrix(sample.mappings);
  const paletteState = applyPaletteFromAutomation(sample.palette);
  return { sample, paletteState };
}

export function drawFrameAt(ctx, frame, time) {
  syncAutomationAtTime(time);
  if (!scene) {
    scene = createScene(ctx.canvas.width || WIDTH, ctx.canvas.height || HEIGHT);
    applySceneSettings();
  }
  scene.update({ ...frame, time });
  scene.draw(ctx);
}

function createScene(width, height) {
  return rendererMode === 'cinematic'
    ? new CinematicScene(width, height)
    : new PopArtScene(width, height);
}

function disposeScene() {
  scene?.dispose?.();
  scene = null;
}

function applySceneSettings() {
  if (!scene) return;
  scene.setMappings(currentMappings);
  scene.setViscosity(currentViscosity);
  scene.setVariation(currentVariation);
  scene.setBackgroundColor(currentBackground);
  if (currentPalette) scene.setPalette(currentPalette);
  scene.setSongTitle(currentSongTitle);
  scene.setTitleFrequency(currentTitleFrequency);
  scene.setCinematicSettings?.(currentCinematicSettings);
  if (!scene.shapes.length) scene.regenerate();
}

export { RENDERER_MODES };

export function getRendererMode() {
  return rendererMode;
}

/** @param {'popart'|'cinematic'} mode */
export function setRendererMode(mode) {
  if (mode !== 'popart' && mode !== 'cinematic') return;
  if (rendererMode === mode) return;
  rendererMode = mode;
  saveRendererMode(mode);
  disposeScene();
}

export function setVisualizerImage(_img) {}

export function getVisualizerImage() {
  return null;
}

export function setVisualizerPalette(palette) {
  currentPalette = palette?.length ? palette : null;
  scene?.setPalette(currentPalette);
}

export function getVisualizerPalette() {
  return currentPalette;
}

export function setBackgroundImages(_images) {}

export function setBackgroundColor(color) {
  currentBackground = color || DEFAULT_BG;
  scene?.setBackgroundColor(currentBackground);
}

export function getBackgroundColor() {
  return currentBackground;
}

export function setSongTitle(title) {
  currentSongTitle = (title || '').trim().slice(0, 80);
  scene?.setSongTitle(currentSongTitle);
}

export function getSongTitle() {
  return currentSongTitle;
}

export function setTitleFrequency(freq) {
  currentTitleFrequency = Math.min(100, Math.max(0, Math.round(freq)));
  scene?.setTitleFrequency(currentTitleFrequency);
}

export function getTitleFrequency() {
  return currentTitleFrequency;
}

export function setCinematicSettings(settings) {
  currentCinematicSettings = normalizeCinematicSettings(settings);
  saveCinematicSettings(currentCinematicSettings);
  scene?.setCinematicSettings?.(currentCinematicSettings);
}

export function getCinematicSettings() {
  return { ...currentCinematicSettings };
}

export function setVariationSettings(settings) {
  currentVariation = cloneVariation(settings);
  scene?.setVariation(currentVariation);
}

export function getVariationSettings() {
  return cloneVariation(currentVariation);
}

/** Rebuild the scene with the current variation seed and shape settings. */
export function regenerateVariation() {
  scene?.regenerate();
}

export function resetPlayhead() {
  scene?.resetPlayhead();
}

export function setMappingMatrix(mappings) {
  currentMappings = cloneMappings(mappings);
  scene?.setMappings(currentMappings);
}

export function getMappingMatrix() {
  return cloneMappings(currentMappings);
}

export function setViscosity(v) {
  currentViscosity = Math.min(1, Math.max(0, v));
  scene?.setViscosity(currentViscosity);
}

export function getViscosity() {
  return currentViscosity;
}

export function resetRenderer(width = WIDTH, height = HEIGHT) {
  disposeScene();
  scene = createScene(width, height);
  applySceneSettings();
}

export function getLiveAnalysisState() {
  return scene?.getLiveAnalysisState?.() ?? null;
}

export function setAutomationSample(sample) {
  scene?.setAutomationSample(sample ?? null);
}

export function clearAutomationSample() {
  scene?.setAutomationSample(null);
}

export function drawFrame(ctx, frame, _title = '') {
  if (!scene) {
    scene = createScene(ctx.canvas.width || WIDTH, ctx.canvas.height || HEIGHT);
    applySceneSettings();
  }
  scene.update(frame);
  scene.draw(ctx);
}

export function getCanvasSize() {
  return { width: WIDTH, height: HEIGHT };
}

export function getRenderCanvas() {
  return scene?.getRenderCanvas?.() ?? null;
}

export function drawBackdrop(ctx) {
  ctx.fillStyle = currentBackground || DEFAULT_BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
