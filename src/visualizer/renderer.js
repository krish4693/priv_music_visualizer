import { PopArtScene } from './popArtScene.js';
import { CinematicScene } from './cinematicScene.js';
import { loadMappingMatrix, cloneMappings, loadViscosity } from './mappingMatrix.js';
import { loadVariation, cloneVariation } from './variationStore.js';
import { loadBackgroundColor, DEFAULT_BG } from './backgroundStore.js';
import { loadRendererMode, saveRendererMode, RENDERER_MODES } from './rendererModeStore.js';
import {
  loadCinematicSettings,
  saveCinematicSettings,
  normalizeCinematicSettings,
} from './cinematicSettingsStore.js';
import { AutomationRecorder } from './automationStore.js';
import { applyPalettePreset, getActivePalette } from './paletteStore.js';
import { loadSongTitle, loadTitleFrequency } from './titleStore.js';
import { isLivingSongConcept } from './visualConceptStore.js';
import { initConceptEntities } from './concepts/index.js';
import { livingSongExportTimeline } from './concepts/visualLivingSongConcept.js';

const PREVIEW_WIDTH = 1280;
const PREVIEW_HEIGHT = 720;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

let scene = null;
/** @type {'popart'|'cinematic'} */
let rendererMode = loadRendererMode();
let currentMappings = loadMappingMatrix();
let currentViscosity = loadViscosity();
let currentVariation = loadVariation();
let currentPalette = null;
let currentBackground = loadBackgroundColor();
let currentSongTitle = loadSongTitle();
let currentSongDuration = 0;
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
    scene = createScene(ctx.canvas.width || PREVIEW_WIDTH, ctx.canvas.height || PREVIEW_HEIGHT);
    applySceneSettings();
  }
  scene.update({ ...frame, time });
  scene.draw(ctx);
}

/**
 * Isolated render session for background export — does not touch the live preview scene.
 * @param {number} width
 * @param {number} height
 * @param {import('./automationStore.js').AutomationKeyframe[]} [automationKeyframes]
 */
export function createExportSession(width, height, automationKeyframes = null) {
  const exportAutomation = new AutomationRecorder();
  if (automationKeyframes?.length) {
    exportAutomation.loadKeyframes(automationKeyframes);
  }
  let lastPaletteSig = null;

  const exportScene = rendererMode === 'cinematic'
    ? new CinematicScene(width, height)
    : new PopArtScene(width, height);

  exportScene.setMappings(cloneMappings(currentMappings));
  exportScene.setViscosity(currentViscosity);
  exportScene.setVariation(cloneVariation(currentVariation));
  exportScene.setBackgroundColor(currentBackground);
  if (currentPalette) exportScene.setPalette(currentPalette);
  exportScene.setSongTitle(currentSongTitle);
  exportScene.setSongDuration?.(currentSongDuration);
  exportScene.setTitleFrequency(currentTitleFrequency);
  exportScene.setCinematicSettings?.(normalizeCinematicSettings(currentCinematicSettings));
  if (!exportScene.shapes.length) exportScene.regenerate();

  function syncExportAutomation(time) {
    if (!exportAutomation.isActive) {
      exportScene.setAutomationSample?.(null);
      return;
    }
    const sample = exportAutomation.sampleAt(time);
    if (!sample) {
      exportScene.setAutomationSample?.(null);
      return;
    }
    exportScene.setAutomationSample?.(sample);
    exportScene.setViscosity(sample.viscosity);
    exportScene.setMappings(sample.mappings);
    if (sample.palette?.selectedKeys?.length) {
      const sig = [...sample.palette.selectedKeys].sort().join('|');
      if (sig !== lastPaletteSig) {
        lastPaletteSig = sig;
        const paletteState = applyPalettePreset(sample.palette);
        const active = getActivePalette(paletteState.fullPalette, paletteState.selectedPaletteIndices);
        exportScene.setPalette(active);
      }
    }
  }

  return {
    drawFrameAt(ctx, frame, time, automationTime = time) {
      syncExportAutomation(automationTime);
      exportScene.update({ ...frame, time });
      exportScene.draw(ctx);
    },
    drawBackdrop(ctx) {
      ctx.fillStyle = currentBackground || DEFAULT_BG;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    },
    getLivingSongExportTimeline(clipDuration) {
      if (!isLivingSongConcept(exportScene.variation?.visualConcept)) {
        return {
          completionTime: clipDuration,
          tailSeconds: 0,
          holdSeconds: 0,
          totalDuration: clipDuration,
        };
      }
      if (!exportScene._conceptState?.rivers?.length) {
        initConceptEntities(exportScene, width, height);
      }
      const rivers = exportScene._conceptState?.rivers ?? [];
      const animationSpeed = exportScene.variation?.animationSpeed ?? 1;
      return livingSongExportTimeline(clipDuration, animationSpeed, rivers);
    },
    dispose() {
      exportScene.dispose?.();
    },
  };
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
  scene.setSongDuration?.(currentSongDuration);
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

export function setSongDuration(seconds) {
  currentSongDuration = Math.max(0, seconds || 0);
  scene?.setSongDuration?.(currentSongDuration);
}

export function getSongDuration() {
  return currentSongDuration;
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

export function resetPlayhead(options = {}) {
  scene?.resetPlayhead?.(options);
}

/** Reset motion/damping only — keeps concept paths (e.g. living song rivers) when scrubbing. */
export function resetMotionState() {
  scene?.resetPlayhead?.({ resetConcept: false });
}

/** Run scene updates without drawing (warm damped filters after scrub). */
export function warmScenePreview(frame, steps = 6) {
  if (!scene || steps <= 0) return;
  for (let i = 0; i < steps; i++) {
    scene.update(frame);
  }
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

export function resetRenderer(width = PREVIEW_WIDTH, height = PREVIEW_HEIGHT) {
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
    scene = createScene(ctx.canvas.width || PREVIEW_WIDTH, ctx.canvas.height || PREVIEW_HEIGHT);
    applySceneSettings();
  }
  scene.update(frame);
  scene.draw(ctx);
}

export function getPreviewSize() {
  return { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT };
}

export function getExportSize() {
  return { width: EXPORT_WIDTH, height: EXPORT_HEIGHT };
}

export function getCanvasSize() {
  return getExportSize();
}

export function getRenderCanvas() {
  return scene?.getRenderCanvas?.() ?? null;
}

export function drawBackdrop(ctx) {
  ctx.fillStyle = currentBackground || DEFAULT_BG;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
