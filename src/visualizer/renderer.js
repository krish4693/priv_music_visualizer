import { ImageMusicScene } from './imageMusicScene.js';
import { loadMappingMatrix, cloneMappings, loadViscosity } from './mappingMatrix.js';

const WIDTH = 1280;
const HEIGHT = 720;
const BG = '#0a0a0a';

let scene = null;
let currentMappings = loadMappingMatrix();
let currentViscosity = loadViscosity();
let currentImage = null;

export function setVisualizerImage(img) {
  currentImage = img ?? null;
  scene?.setImage(currentImage);
}

export function getVisualizerImage() {
  return currentImage;
}

/** @deprecated kept for compat — no-op */
export function setVisualizerPalette(_palette) {}

export function getVisualizerPalette() {
  return [];
}

export function setBackgroundImages(_images) {}

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
  scene = new ImageMusicScene(width, height);
  scene.setImage(currentImage);
  scene.setMappings(currentMappings);
  scene.setViscosity(currentViscosity);
}

export function drawFrame(ctx, frame, _title = '') {
  if (!scene) {
    scene = new ImageMusicScene(ctx.canvas.width || WIDTH, ctx.canvas.height || HEIGHT);
    scene.setImage(currentImage);
    scene.setMappings(currentMappings);
    scene.setViscosity(currentViscosity);
  }
  scene.update(frame);
  scene.draw(ctx);
}

export function getCanvasSize() {
  return { width: WIDTH, height: HEIGHT };
}

export function drawBackdrop(ctx) {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
