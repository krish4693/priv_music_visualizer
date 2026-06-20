import { PopArtScene } from './popArtScene.js';
import { loadMappingMatrix, cloneMappings, loadViscosity } from './mappingMatrix.js';

const WIDTH = 1280;
const HEIGHT = 720;

let scene = null;
let currentMappings = loadMappingMatrix();
let currentViscosity = loadViscosity();
let currentPalette = null;

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
  scene.setMappings(currentMappings);
  scene.setViscosity(currentViscosity);
  if (currentPalette) scene.setPalette(currentPalette);
}

export function drawFrame(ctx, frame, _title = '') {
  if (!scene) {
    scene = new PopArtScene(ctx.canvas.width || WIDTH, ctx.canvas.height || HEIGHT);
    scene.setMappings(currentMappings);
    scene.setViscosity(currentViscosity);
    if (currentPalette) scene.setPalette(currentPalette);
  }
  scene.update(frame);
  scene.draw(ctx);
}

export function getCanvasSize() {
  return { width: WIDTH, height: HEIGHT };
}

export function drawBackdrop(ctx) {
  ctx.fillStyle = '#1c1c1e';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
