import { PopArtScene } from './popArtScene.js';
import { loadMappingMatrix, cloneMappings, loadViscosity } from './mappingMatrix.js';
import { loadVariation, cloneVariation } from './variationStore.js';
import { loadBackgroundColor, DEFAULT_BG } from './backgroundStore.js';
import { loadSongTitle, loadTitleFrequency } from './titleStore.js';

const WIDTH = 1280;
const HEIGHT = 720;

let scene = null;
let currentMappings = loadMappingMatrix();
let currentViscosity = loadViscosity();
let currentVariation = loadVariation();
let currentPalette = null;
let currentBackground = loadBackgroundColor();
let currentSongTitle = loadSongTitle();
let currentTitleFrequency = loadTitleFrequency();

function applySceneSettings() {
  if (!scene) return;
  scene.setMappings(currentMappings);
  scene.setViscosity(currentViscosity);
  scene.setVariation(currentVariation);
  scene.setBackgroundColor(currentBackground);
  if (currentPalette) scene.setPalette(currentPalette);
  scene.setSongTitle(currentSongTitle);
  scene.setTitleFrequency(currentTitleFrequency);
  if (!scene.shapes.length) scene.regenerate();
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
  scene = new PopArtScene(width, height);
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
    scene = new PopArtScene(ctx.canvas.width || WIDTH, ctx.canvas.height || HEIGHT);
    applySceneSettings();
  }
  scene.update(frame);
  scene.draw(ctx);
}

export function getCanvasSize() {
  return { width: WIDTH, height: HEIGHT };
}

export function drawBackdrop(ctx) {
  ctx.fillStyle = currentBackground || DEFAULT_BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
