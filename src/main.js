import { analyzeAudioBuffer, decodeAudioFile, liveFrameFromAnalyser, resetLiveBeatState, FPS } from './audio/analyzer.js';
import {
  drawFrame,
  drawBackdrop,
  resetRenderer,
  resetPlayhead,
  getLiveAnalysisState,
  getVariationSettings,
  setAutomationSample,
  clearAutomationSample,
  setMappingMatrix,
  setViscosity,
  setVisualizerPalette,
  setVariationSettings,
  regenerateVariation,
  setBackgroundColor,
  getRendererMode,
  setRendererMode,
  RENDERER_MODES,
  syncAutomationAtTime,
  setPlaybackAutomation,
  clearAutomationPaletteCache,
  getCinematicSettings,
  setCinematicSettings,
} from './visualizer/renderer.js';
import {
  AUDIO_SOURCES,
  VISUAL_TARGETS,
  DEFAULT_MAPPINGS,
  DEFAULT_VISCOSITY,
  loadMappingMatrix,
  saveMappingMatrix,
  loadViscosity,
  saveViscosity,
  cloneMappings,
  formatAnalysisPercent,
} from './visualizer/mappingMatrix.js';
import { exportToMp4 } from './export/ffmpegExport.js';
import { saveAudio, loadAudio } from './storage/db.js';
import { POP_ART_COLORS } from './visualizer/popArtPalette.js';
import {
  loadFullPalette,
  saveCustomColors,
  loadSelectedIndices,
  saveSelectedIndices,
  getActivePalette,
  hexToRgb,
  colorKey,
  applyPalettePreset,
} from './visualizer/paletteStore.js';
import {
  SHAPE_OPTIONS,
  COLOR_MODES,
  ANIMATION_SPEEDS,
  DEFAULT_VARIATION,
  loadVariation,
  saveVariation,
  cloneVariation,
} from './visualizer/variationStore.js';
import { AutomationRecorder } from './visualizer/automationStore.js';
import { buildAppConfig, downloadAppConfig, parseAppConfig, suggestConfigFilename } from './visualizer/configStore.js';
import { loadBackgroundColor, saveBackgroundColor } from './visualizer/backgroundStore.js';
import {
  CINEMATIC_SLIDERS,
  DEFAULT_CINEMATIC_SETTINGS,
  normalizeCinematicSettings,
} from './visualizer/cinematicSettingsStore.js';

const BUNDLED_AUDIO_URL = '/samples/aboud-vs-flab.wav';
const BUNDLED_AUDIO_NAME = '02 AboudVsFlab.wav';

const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');
const fileNameEl = document.getElementById('file-name');
const canvas = document.getElementById('visualizer');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const playheadSlider = document.getElementById('playhead-slider');
const recordBtn = document.getElementById('record-btn');
const clearAutomationBtn = document.getElementById('clear-automation-btn');
const saveConfigBtn = document.getElementById('save-config-btn');
const openConfigBtn = document.getElementById('open-config-btn');
const openConfigInput = document.getElementById('open-config-input');
const configStatus = document.getElementById('config-status');
const clipFromInput = document.getElementById('clip-from');
const clipToInput = document.getElementById('clip-to');
const previewExportBtn = document.getElementById('preview-export-btn');
const automationStatus = document.getElementById('automation-status');
const timeDisplay = document.getElementById('time-display');
const speedControl = document.getElementById('speed-control');
const speedControlPanel = document.getElementById('speed-control-panel');
const exportBtn = document.getElementById('export-btn');
const uploadProgressWrap = document.getElementById('upload-progress-wrap');
const uploadProgressFill = document.getElementById('upload-progress-fill');
const uploadProgressLabel = document.getElementById('upload-progress-label');
const uploadProgressPercent = document.getElementById('upload-progress-percent');
const createProgressWrap = document.getElementById('create-progress-wrap');
const createProgressFill = document.getElementById('create-progress-fill');
const createProgressLabel = document.getElementById('create-progress-label');
const createProgressPercent = document.getElementById('create-progress-percent');
const mappingBody = document.getElementById('mapping-body');
const mappingResetBtn = document.getElementById('mapping-reset');
const audioSourcesList = document.getElementById('audio-sources-list');
const colorDriveVal = document.getElementById('color-drive-val');
const motionDriveVal = document.getElementById('motion-drive-val');
const viscositySlider = document.getElementById('viscosity-slider');
const viscosityVal = document.getElementById('viscosity-val');
const paletteSwatches = document.getElementById('palette-swatches');
const colorPicker = document.getElementById('color-picker');
const addColorBtn = document.getElementById('add-color-btn');
const bgColorPicker = document.getElementById('bg-color-picker');
const shapeToggles = document.getElementById('shape-toggles');
const colorModeSelect = document.getElementById('color-mode-select');
const colorShiftSlider = document.getElementById('color-shift-slider');
const colorShiftVal = document.getElementById('color-shift-val');
const shapeCountSlider = document.getElementById('shape-count-slider');
const shapeCountVal = document.getElementById('shape-count-val');
const sizeSpreadSlider = document.getElementById('size-spread-slider');
const sizeSpreadVal = document.getElementById('size-spread-val');
const spinIntensitySlider = document.getElementById('spin-intensity-slider');
const spinIntensityVal = document.getElementById('spin-intensity-val');
const speedSpreadSlider = document.getElementById('speed-spread-slider');
const speedSpreadVal = document.getElementById('speed-spread-val');
const layoutSpreadSlider = document.getElementById('layout-spread-slider');
const layoutSpreadVal = document.getElementById('layout-spread-val');
const fixedLayoutCheck = document.getElementById('fixed-layout-check');
const depthRangeSlider = document.getElementById('depth-range-slider');
const depthRangeVal = document.getElementById('depth-range-val');
const manualSpeedCheck = document.getElementById('manual-speed-check');
const manualSpeedSlider = document.getElementById('manual-speed-slider');
const manualSpeedVal = document.getElementById('manual-speed-val');
const surprisesCheck = document.getElementById('surprises-check');
const surpriseRateSlider = document.getElementById('surprise-rate-slider');
const surpriseRateVal = document.getElementById('surprise-rate-val');
const roundedEdgesCheck = document.getElementById('rounded-edges-check');
const roundedEdgesToggle = document.getElementById('rounded-edges-toggle');
const kantenCheck = document.getElementById('kanten-check');
const kantenToggle = document.getElementById('kanten-toggle');
const cornerRoundSlider = document.getElementById('corner-round-slider');
const cornerRoundVal = document.getElementById('corner-round-val');
const variationResetBtn = document.getElementById('variation-reset');
const rendererModeSelect = document.getElementById('renderer-mode-select');
const cinematicSection = document.getElementById('cinematic-section');
const cinematicSliders = document.getElementById('cinematic-sliders');
const cinematicShadowsCheck = document.getElementById('cinematic-shadows-check');
const cinematicShadowsToggle = document.getElementById('cinematic-shadows-toggle');
const cinematicFloorCheck = document.getElementById('cinematic-floor-check');
const cinematicFloorToggle = document.getElementById('cinematic-floor-toggle');
const cinematicResetBtn = document.getElementById('cinematic-reset-btn');

const ctx = canvas.getContext('2d');

let fullPalette = loadFullPalette();
let selectedPaletteIndices = loadSelectedIndices(fullPalette);

let audioFile = null;
let audioBuffer = null;
let analysis = null;
let audioContext = null;
let sourceNode = null;
let analyserNode = null;
let gainNode = null;
let previewRAF = null;
let isPlaying = false;
let playStartTime = 0;
let playOffset = 0;

const automation = new AutomationRecorder();
let mappingPanel = null;
let variationController = null;

const ACCEPTED_EXTENSIONS = /\.(mp3|wav)$/i;
const ACCEPTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
]);

function isAcceptedAudioFile(file) {
  if (!file) return false;
  if (ACCEPTED_EXTENSIONS.test(file.name)) return true;
  return ACCEPTED_MIME_TYPES.has(file.type);
}

function silentFrame() {
  return { rms: 0, bass: 0, mid: 0, high: 0, bars: new Float32Array(48), beat: false, beatPulse: 0, tempo: 0.5, pitch: 0.5, time: 0 };
}

setupDropzone();
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
playBtn.addEventListener('click', togglePlay);
stopBtn.addEventListener('click', stopPlayback);
setupPlayheadControl();
setupAutomationControls();
setupConfigControls();
setupCinematicPanel();
setupRendererMode();
exportBtn.addEventListener('click', () => handleExport(false));
previewExportBtn?.addEventListener('click', () => handleExport(true));

mappingPanel = setupMappingPanel();
setupPaletteControls();
setupBackgroundControl();
variationController = setupVariationPanel();
applyActivePalette();
setBackgroundColor(loadBackgroundColor());
bgColorPicker.value = loadBackgroundColor();
setMappingMatrix(loadMappingMatrix());
setViscosity(loadViscosity());
setVariationSettings(loadVariation());
viscositySlider.value = String(Math.round(loadViscosity() * 100));
viscosityVal.textContent = `${viscositySlider.value}%`;
variationController?.syncFromStores?.();
initFromStorage();

async function initFromStorage() {
  showUploadProgress(true);
  setUploadProgress(0, 'Loading song…');

  if (await tryLoadBundledAudio()) return;

  try {
    const storedAudio = await loadAudio();
    if (storedAudio && await processAudioFile(storedAudio, false, `${storedAudio.name} (saved)`, { quiet: true })) {
      return;
    }
  } catch (err) {
    console.warn('Could not restore saved audio', err);
  }

  showUploadProgress(false);
  fileNameEl.textContent = 'No audio loaded — drop MP3 / WAV';
}

async function tryLoadBundledAudio() {
  try {
    const file = await fetchAsFile(BUNDLED_AUDIO_URL, BUNDLED_AUDIO_NAME, 'audio/wav');
    return await processAudioFile(file, true, `${file.name} (bundled sample)`, { quiet: true });
  } catch (err) {
    console.warn('Bundled sample not available', err);
    return false;
  }
}

function setupDropzone() {
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
}

async function handleFile(file) {
  if (!isAcceptedAudioFile(file)) {
    alert('Please select an MP3 or WAV file.');
    return;
  }
  await processAudioFile(file, true);
}

async function fetchAsFile(url, name, type) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || type });
}

async function processAudioFile(file, persist, displayName, { quiet = false } = {}) {
  stopPlayback();
  resetState(false);
  setUploadProgress(0, 'Starting…');
  showUploadProgress(true);
  dropzone.classList.add('loading');

  try {
    audioFile = file;
    fileNameEl.textContent = displayName ?? (persist ? file.name : `${file.name} (saved)`);

    const onUploadProgress = (pct, label) => setUploadProgress(pct, label);

    if (persist) await saveAudio(file);

    audioBuffer = await decodeAudioFile(file, onUploadProgress);
    analysis = await analyzeAudioBuffer(audioBuffer, onUploadProgress);

    resetRenderer(canvas.width, canvas.height);
    resetLiveBeatState();
    drawBackdrop(ctx);

    playBtn.disabled = false;
    stopBtn.disabled = false;
    exportBtn.disabled = false;
    syncClipRangeInputs();
    updateTimeDisplay(0, audioBuffer.duration);
    syncPlayheadSlider(0, audioBuffer.duration);
    previewAtPlayhead();
    syncAutomationControls();
    setUploadProgress(100, 'Ready to play');
    return true;
  } catch (err) {
    console.error(err);
    if (!quiet) {
      alert(`Could not process this file: ${err.message}\n\nWAV files are often large — try an MP3, or a shorter clip.`);
    }
    resetState(true);
    return false;
  } finally {
    dropzone.classList.remove('loading');
    setTimeout(() => showUploadProgress(false), 1200);
  }
}

function updateAnalysisDisplays() {
  mappingPanel?.updateLiveValues?.();
}

function snapshotPaletteForAutomation() {
  const baseKeys = new Set(POP_ART_COLORS.map(colorKey));
  return {
    selectedKeys: [...selectedPaletteIndices].map((i) => colorKey(fullPalette[i])).filter(Boolean),
    customColors: fullPalette.filter((c) => !baseKeys.has(colorKey(c))).map((c) => ({ ...c })),
  };
}

function notifyAutomationEdit() {
  if (automation.isRecording) {
    captureAutomationKeyframe(getCurrentSongTime(), true);
  }
}

function clearAutomationPaletteCacheLocal() {
  clearAutomationPaletteCache();
}

function collectCurrentLook() {
  return {
    variation: getVariationSettings(),
    mappings: mappingPanel?.getMappings() ?? loadMappingMatrix(),
    viscosity: mappingPanel?.getViscosity() ?? loadViscosity(),
    bgColor: loadBackgroundColor(),
    palette: snapshotPaletteForAutomation(),
    cinematic: getCinematicSettings(),
  };
}

function applyLookSettings(look) {
  if (!look) return;

  saveVariation(look.variation);
  setVariationSettings(look.variation);
  regenerateVariation();
  variationController?.syncFromStores?.();

  mappingPanel?.applyPresetState?.({
    mappings: look.mappings,
    viscosity: look.viscosity,
  });

  saveBackgroundColor(look.bgColor);
  setBackgroundColor(look.bgColor);
  bgColorPicker.value = look.bgColor;

  const paletteState = applyPalettePreset(look.palette);
  fullPalette = paletteState.fullPalette;
  selectedPaletteIndices = paletteState.selectedPaletteIndices;
  renderPaletteSwatches();
  applyActivePalette();

  if (look.cinematic) {
    setCinematicSettings(look.cinematic);
    syncCinematicPanelFromSettings(look.cinematic);
  }

  resetPlayhead();
  refreshPreview();
}

function flashConfigStatus(message) {
  if (!configStatus) return;
  configStatus.textContent = message;
  configStatus.hidden = false;
  clearTimeout(flashConfigStatus._t);
  flashConfigStatus._t = setTimeout(() => {
    configStatus.hidden = true;
  }, 2800);
}

function syncClipRangeInputs() {
  if (!audioBuffer) {
    clipFromInput.disabled = true;
    clipToInput.disabled = true;
    previewExportBtn.disabled = true;
    return;
  }
  const dur = audioBuffer.duration;
  clipFromInput.disabled = false;
  clipToInput.disabled = false;
  previewExportBtn.disabled = false;
  clipFromInput.max = String(dur);
  clipToInput.max = String(dur);
  if (Number(clipToInput.value) <= 0 || Number(clipToInput.value) > dur) {
    clipToInput.value = String(Math.round(dur * 10) / 10);
  }
}

function getClipRange() {
  if (!audioBuffer) return { startTime: 0, endTime: 0 };
  const dur = audioBuffer.duration;
  let startTime = Math.max(0, Number(clipFromInput?.value) || 0);
  let endTime = Number(clipToInput?.value) || dur;
  if (endTime <= 0) endTime = dur;
  startTime = Math.min(startTime, dur - 0.1);
  endTime = Math.max(startTime + 0.1, Math.min(endTime, dur));
  return { startTime, endTime };
}

function setupConfigControls() {
  saveConfigBtn?.addEventListener('click', () => {
    const config = buildAppConfig({
      rendererMode: getRendererMode(),
      look: collectCurrentLook(),
      automationKeyframes: automation.exportData(),
      songName: audioFile?.name,
    });
    const filename = suggestConfigFilename(audioFile?.name);
    downloadAppConfig(config, filename);
    flashConfigStatus(`Saved ${filename}`);
  });

  openConfigBtn?.addEventListener('click', () => openConfigInput?.click());

  openConfigInput?.addEventListener('change', async () => {
    const file = openConfigInput.files?.[0];
    openConfigInput.value = '';
    if (!file) return;

    let parsed;
    try {
      parsed = parseAppConfig(await file.text());
    } catch {
      alert('Could not read config file.');
      return;
    }

    if (!parsed) {
      alert('Invalid config file.');
      return;
    }

    if (parsed.look) {
      applyLookSettings(parsed.look);
    }

    if (parsed.renderer && parsed.renderer !== getRendererMode()) {
      setRendererMode(parsed.renderer);
      if (rendererModeSelect) rendererModeSelect.value = parsed.renderer;
      resetRenderer(canvas.width, canvas.height);
      updateExportButtonLabel();
    }

    if (parsed.automation?.keyframes?.length) {
      automation.loadKeyframes(parsed.automation.keyframes);
      clearAutomationPaletteCacheLocal();
      syncAutomationToRenderer();
    } else if (!parsed.legacyTake) {
      automation.clear();
      syncAutomationToRenderer();
    }

    syncAutomationControls();
    refreshPreview();
    flashConfigStatus(`Loaded ${file.name}`);
  });
}

function buildAutomationCaptureState() {
  const live = getLiveAnalysisState();
  if (!live) return null;
  return {
    effective: { ...live.effective },
    sources: { ...live.sources },
    mappings: mappingPanel?.getMappings() ?? loadMappingMatrix(),
    viscosity: mappingPanel?.getViscosity() ?? loadViscosity(),
    palette: snapshotPaletteForAutomation(),
  };
}

function captureAutomationKeyframe(time, force = false) {
  const state = buildAutomationCaptureState();
  if (!state) return;
  automation.capture(time, state, force);
  updateAutomationStatus();
}

function syncAutomationToRenderer() {
  setPlaybackAutomation(automation.exportData());
}

function applyAutomationAtTime(time, syncUi = false) {
  syncAutomationToRenderer();
  const { sample, paletteState } = syncAutomationAtTime(time);
  if (!sample) return;
  if (syncUi) {
    mappingPanel?.applyAutomationState?.({
      mappings: sample.mappings,
      viscosity: sample.viscosity,
    });
    if (paletteState) {
      fullPalette = paletteState.fullPalette;
      selectedPaletteIndices = paletteState.selectedPaletteIndices;
      renderPaletteSwatches();
    }
  }
}

function updateAutomationStatus() {
  if (!automationStatus) return;
  if (automation.isRecording) {
    automationStatus.textContent = `Recording… ${automation.count}`;
    return;
  }
  if (!automation.count) {
    automationStatus.textContent = '';
    return;
  }
  automationStatus.textContent = `Take: ${automation.count} points`;
}

function syncAutomationControls() {
  const hasAudio = !!audioBuffer;
  const hasTake = automation.count > 0;
  recordBtn.disabled = !hasAudio;
  clearAutomationBtn.disabled = !hasTake;
  recordBtn.classList.toggle('recording', automation.isRecording);
  recordBtn.textContent = automation.isRecording ? 'Stop' : 'Record';
  updateAutomationStatus();
}

function setupAutomationControls() {
  recordBtn?.addEventListener('click', async () => {
    if (!audioBuffer) return;

    if (automation.isRecording) {
      automation.stop();
      syncAutomationControls();
      if (automation.count) {
        flashAutomationHint('Recording saved in session — use Save config');
      }
      if (!isPlaying) previewAtPlayhead();
      return;
    }

    automation.clear();
    clearAutomationSample();
    clearAutomationPaletteCacheLocal();
    syncAutomationToRenderer();
    automation.start();
    syncAutomationControls();
    captureAutomationKeyframe(getCurrentSongTime(), true);

    if (!isPlaying) {
      await togglePlay();
    }
  });

  clearAutomationBtn?.addEventListener('click', () => {
    automation.clear();
    clearAutomationSample();
    clearAutomationPaletteCacheLocal();
    syncAutomationToRenderer();
    syncAutomationControls();
    if (!isPlaying) previewAtPlayhead();
  });
}

function flashAutomationHint(message) {
  if (!automationStatus) return;
  automationStatus.textContent = message;
  clearTimeout(flashAutomationHint._t);
  flashAutomationHint._t = setTimeout(updateAutomationStatus, 2800);
}

function getCurrentSongTime() {
  if (isPlaying && audioContext) {
    return playOffset + (audioContext.currentTime - playStartTime);
  }
  return playOffset;
}

function syncPlayheadSlider(current, total) {
  if (!playheadSlider) return;
  playheadSlider.disabled = !audioBuffer || !total;
  if (!audioBuffer || !total) return;
  playheadSlider.max = String(total);
  playheadSlider.value = String(Math.min(total, Math.max(0, current)));
}

function analysisFrameAtTime(seconds) {
  if (!analysis?.frames?.length) return null;
  const idx = Math.min(analysis.frames.length - 1, Math.floor(seconds * FPS));
  return analysis.frames[idx];
}

function previewAtPlayhead() {
  applyAutomationAtTime(playOffset, true);
  drawBackdrop(ctx);
  const frame = analysisFrameAtTime(playOffset);
  if (frame) {
    resetPlayhead();
    const payload = { ...frame, time: playOffset };
    for (let i = 0; i < 8; i++) drawFrame(ctx, payload);
  } else {
    drawFrame(ctx, { ...silentFrame(), time: 0 });
  }
  updateAnalysisDisplays();
}

function seekToTime(seconds) {
  if (!audioBuffer) return;
  playOffset = Math.min(audioBuffer.duration, Math.max(0, seconds));
  syncPlayheadSlider(playOffset, audioBuffer.duration);
  updateTimeDisplay(playOffset, audioBuffer.duration);

  if (isPlaying) {
    restartPlaybackAtOffset();
  } else {
    previewAtPlayhead();
  }
}

function restartPlaybackAtOffset() {
  if (!audioContext || !audioBuffer) return;
  sourceNode?.stop();
  sourceNode = null;
  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(analyserNode);
  sourceNode.onended = () => {
    if (isPlaying) stopPlayback();
  };
  playStartTime = audioContext.currentTime;
  sourceNode.start(0, playOffset);
}

function setupPlayheadControl() {
  playheadSlider?.addEventListener('input', () => {
    seekToTime(Number(playheadSlider.value));
  });
}

function syncCinematicPanelVisibility() {
  const cinematic = getRendererMode() === 'cinematic';
  if (cinematicSection) cinematicSection.hidden = !cinematic;
}

function syncCinematicPanelFromSettings(settings) {
  const s = normalizeCinematicSettings(settings);
  cinematicSliders?.querySelectorAll('input[data-cinematic-key]').forEach((input) => {
    const key = input.dataset.cinematicKey;
    if (key in s) input.value = String(s[key]);
    if (key === 'floorGloss') {
      input.disabled = !s.showFloor;
      input.closest('.cinematic-field')?.classList.toggle('disabled', !s.showFloor);
    }
  });
  cinematicSliders?.querySelectorAll('.cinematic-val').forEach((el) => {
    const key = el.dataset.cinematicKey;
    if (key in s) el.textContent = key === 'exposure' ? String(s[key]) : `${s[key]}%`;
  });
  if (cinematicFloorCheck) {
    cinematicFloorCheck.checked = s.showFloor;
    cinematicFloorToggle?.classList.toggle('active', s.showFloor);
  }
  if (cinematicShadowsCheck) {
    cinematicShadowsCheck.checked = s.shadows;
    cinematicShadowsToggle?.classList.toggle('active', s.shadows);
  }
}

function setupCinematicPanel() {
  if (!cinematicSliders) return;

  cinematicSliders.innerHTML = CINEMATIC_SLIDERS.map(({ key, label, min, max }) => {
    const val = getCinematicSettings()[key];
    const display = key === 'exposure' ? String(val) : `${val}%`;
    return `<label class="variation-field cinematic-field">
      <span class="variation-field-label">${label}</span>
      <div class="variation-slider-row">
        <input type="range" data-cinematic-key="${key}" min="${min}" max="${max}" step="1" value="${val}" aria-label="${label}" />
        <span class="variation-val cinematic-val" data-cinematic-key="${key}">${display}</span>
      </div>
    </label>`;
  }).join('');

  let cinematicSettings = getCinematicSettings();

  function applyCinematic(partial) {
    cinematicSettings = normalizeCinematicSettings({ ...cinematicSettings, ...partial });
    setCinematicSettings(cinematicSettings);
    refreshPreview();
  }

  cinematicSliders.querySelectorAll('input[data-cinematic-key]').forEach((input) => {
    input.addEventListener('input', () => {
      const key = input.dataset.cinematicKey;
      const value = Number(input.value);
      applyCinematic({ [key]: value });
      const valEl = cinematicSliders.querySelector(`.cinematic-val[data-cinematic-key="${key}"]`);
      if (valEl) valEl.textContent = key === 'exposure' ? String(value) : `${value}%`;
    });
  });

  cinematicFloorCheck?.addEventListener('change', () => {
    cinematicFloorToggle?.classList.toggle('active', cinematicFloorCheck.checked);
    applyCinematic({ showFloor: cinematicFloorCheck.checked });
    syncCinematicPanelFromSettings(cinematicSettings);
  });

  cinematicShadowsCheck?.addEventListener('change', () => {
    cinematicShadowsToggle?.classList.toggle('active', cinematicShadowsCheck.checked);
    applyCinematic({ shadows: cinematicShadowsCheck.checked });
  });

  cinematicResetBtn?.addEventListener('click', () => {
    cinematicSettings = { ...DEFAULT_CINEMATIC_SETTINGS };
    setCinematicSettings(cinematicSettings);
    syncCinematicPanelFromSettings(cinematicSettings);
    refreshPreview();
  });

  syncCinematicPanelFromSettings(cinematicSettings);
  syncCinematicPanelVisibility();
}

function updateExportButtonLabel() {
  if (!exportBtn) return;
  const mode = getRendererMode();
  exportBtn.textContent = mode === 'cinematic'
    ? 'Export MP4 (1080p · Cinematic)'
    : 'Export MP4 (1080p · Pop Art)';
}

function setupRendererMode() {
  if (!rendererModeSelect) return;
  rendererModeSelect.value = getRendererMode();
  updateExportButtonLabel();

  rendererModeSelect.addEventListener('change', () => {
    const mode = rendererModeSelect.value;
    if (mode !== 'popart' && mode !== 'cinematic') return;
    setRendererMode(mode);
    resetRenderer(canvas.width, canvas.height);
    updateExportButtonLabel();
    syncCinematicPanelVisibility();
    refreshPreview();
  });
}

function refreshPreview() {
  if (!audioBuffer || isPlaying) return;
  previewAtPlayhead();
}

function setupMappingPanel() {
  let mappings = loadMappingMatrix();
  let viscosity = loadViscosity();

  function applyMappings() {
    saveMappingMatrix(mappings);
    setMappingMatrix(mappings);
    notifyAutomationEdit();
    refreshPreview();
  }

  function applyViscosity() {
    saveViscosity(viscosity);
    setViscosity(viscosity);
    notifyAutomationEdit();
    refreshPreview();
  }

  viscositySlider.addEventListener('input', () => {
    viscosity = Number(viscositySlider.value) / 100;
    viscosityVal.textContent = `${viscositySlider.value}%`;
    applyViscosity();
  });

  function renderMappingTable() {
    mappingBody.innerHTML = VISUAL_TARGETS.map(({ id, label, hint }) => {
      const entry = mappings[id] ?? DEFAULT_MAPPINGS[id];
      const sensPct = Math.round((entry.sensitivity ?? 1) * 100);
      return `
        <tr data-target="${id}" title="${hint}">
          <td class="mapping-target">${label}</td>
          <td>
            <select class="mapping-source" data-target="${id}" aria-label="${label} source">
              ${AUDIO_SOURCES.map(({ id: sid, label: slabel }) =>
                `<option value="${sid}"${entry.source === sid ? ' selected' : ''}>${slabel}</option>`,
              ).join('')}
            </select>
          </td>
          <td class="mapping-sens-cell">
            <input type="range" class="mapping-sens" data-target="${id}"
              min="0" max="200" step="5" value="${sensPct}" aria-label="${label} sensitivity" />
            <span class="mapping-sens-val" data-target="${id}">${sensPct}%</span>
          </td>
          <td class="mapping-live-cell">
            <span class="mapping-live-val" data-target="${id}">—</span>
            <span class="mapping-live-src" data-target="${id}"></span>
          </td>
        </tr>`;
    }).join('');

    mappingBody.querySelectorAll('.mapping-source').forEach((select) => {
      select.addEventListener('change', () => {
        const target = select.dataset.target;
        mappings[target] = { ...mappings[target], source: select.value };
        applyMappings();
      });
    });

    mappingBody.querySelectorAll('.mapping-sens').forEach((slider) => {
      slider.addEventListener('input', () => {
        const target = slider.dataset.target;
        const pct = Number(slider.value);
        mappings[target] = { ...mappings[target], sensitivity: pct / 100 };
        const label = mappingBody.querySelector(`.mapping-sens-val[data-target="${target}"]`);
        if (label) label.textContent = `${pct}%`;
        applyMappings();
      });
    });
  }

  mappingResetBtn.addEventListener('click', () => {
    mappings = cloneMappings(DEFAULT_MAPPINGS);
    viscosity = DEFAULT_VISCOSITY;
    viscositySlider.value = String(Math.round(DEFAULT_VISCOSITY * 100));
    viscosityVal.textContent = `${viscositySlider.value}%`;
    applyViscosity();
    applyMappings();
    renderMappingTable();
  });

  renderMappingTable();

  if (audioSourcesList && !audioSourcesList.childElementCount) {
    audioSourcesList.innerHTML = AUDIO_SOURCES.filter(({ id }) => id !== 'none').map(({ id, label }) => `
      <li class="audio-source-row" data-source="${id}">
        <span class="audio-source-label">${label}</span>
        <div class="audio-source-bar" aria-hidden="true"><div class="audio-source-fill"></div></div>
        <span class="audio-source-pct">0%</span>
      </li>
    `).join('');
  }

  function updateLiveValues() {
    const live = getLiveAnalysisState();
    if (!live) return;

    for (const { id } of VISUAL_TARGETS) {
      const valEl = mappingBody.querySelector(`.mapping-live-val[data-target="${id}"]`);
      const srcEl = mappingBody.querySelector(`.mapping-live-src[data-target="${id}"]`);
      if (!valEl) continue;

      let display = formatAnalysisPercent(live.effective[id]);
      if (id === 'color' && live.flags.manualColor) display = 'manual';
      else if (id === 'color' && live.flags.colorFromMode) display = formatAnalysisPercent(live.effective.color);
      if ((id === 'motion' || id === 'morphing') && live.flags.manualMotion) display += ' · manual';

      valEl.textContent = display;

      if (srcEl) {
        const srcVal = live.sourceInputs[id];
        srcEl.textContent = srcVal == null ? '' : `← ${formatAnalysisPercent(srcVal)}`;
      }
    }

    audioSourcesList?.querySelectorAll('[data-source]').forEach((row) => {
      const key = row.dataset.source;
      const v = live.sources[key] ?? 0;
      const pct = Math.round(v * 100);
      const fill = row.querySelector('.audio-source-fill');
      const label = row.querySelector('.audio-source-pct');
      if (fill) fill.style.width = `${pct}%`;
      if (label) label.textContent = `${pct}%`;
    });

    if (colorDriveVal) {
      if (live.flags.manualColor) colorDriveVal.textContent = 'manual';
      else colorDriveVal.textContent = formatAnalysisPercent(live.effective.color);
    }

    if (motionDriveVal) {
      motionDriveVal.textContent = live.flags.manualMotion
        ? `${formatAnalysisPercent(live.effective.motion)} · manual`
        : formatAnalysisPercent(live.effective.motion);
    }
  }

  return {
    applyPresetState({ mappings: nextMappings, viscosity: nextViscosity }) {
      mappings = cloneMappings(nextMappings);
      viscosity = nextViscosity;
      viscositySlider.value = String(Math.round(viscosity * 100));
      viscosityVal.textContent = `${viscositySlider.value}%`;
      saveViscosity(viscosity);
      saveMappingMatrix(mappings);
      setViscosity(viscosity);
      setMappingMatrix(mappings);
      renderMappingTable();
      refreshPreview();
    },
    applyAutomationState({ mappings: nextMappings, viscosity: nextViscosity }) {
      mappings = cloneMappings(nextMappings);
      viscosity = nextViscosity;
      viscositySlider.value = String(Math.round(viscosity * 100));
      viscosityVal.textContent = `${viscositySlider.value}%`;
      setViscosity(viscosity);
      setMappingMatrix(mappings);
      renderMappingTable();
    },
    getMappings: () => cloneMappings(mappings),
    getViscosity: () => viscosity,
    updateLiveValues,
  };
}

function getCustomColors() {
  const baseKeys = new Set(POP_ART_COLORS.map(colorKey));
  return fullPalette.filter((c) => !baseKeys.has(colorKey(c)));
}

function applyActivePalette() {
  const active = getActivePalette(fullPalette, selectedPaletteIndices);
  setVisualizerPalette(active);
  refreshPreview();
}

function renderPaletteSwatches() {
  paletteSwatches.innerHTML = fullPalette
    .map((c, i) => {
      const selected = selectedPaletteIndices.has(i);
      const title = c.name ? `${c.name} (${c.r}, ${c.g}, ${c.b})` : `rgb(${c.r}, ${c.g}, ${c.b})`;
      return `<button type="button" class="swatch${selected ? ' selected' : ''}" data-index="${i}" style="background: rgb(${c.r}, ${c.g}, ${c.b})" title="${title}" aria-label="${title}${selected ? ' — active' : ''}"></button>`;
    })
    .join('');

  paletteSwatches.querySelectorAll('.swatch').forEach((btn) => {
    btn.addEventListener('click', () => togglePaletteColor(Number(btn.dataset.index)));
  });
}

function togglePaletteColor(index) {
  if (selectedPaletteIndices.has(index)) {
    if (selectedPaletteIndices.size <= 1) return;
    selectedPaletteIndices.delete(index);
  } else {
    selectedPaletteIndices.add(index);
  }
  saveSelectedIndices(fullPalette, selectedPaletteIndices);
  applyActivePalette();
  renderPaletteSwatches();
  notifyAutomationEdit();
  refreshPreview();
}

function setupPaletteControls() {
  renderPaletteSwatches();

  addColorBtn.addEventListener('click', () => {
    const rgb = hexToRgb(colorPicker.value);
    if (!rgb) return;

    const key = colorKey(rgb);
    const existing = fullPalette.findIndex((c) => colorKey(c) === key);
    if (existing >= 0) {
      selectedPaletteIndices.add(existing);
    } else {
      fullPalette.push(rgb);
      selectedPaletteIndices.add(fullPalette.length - 1);
      saveCustomColors(getCustomColors());
    }

    saveSelectedIndices(fullPalette, selectedPaletteIndices);
    applyActivePalette();
    renderPaletteSwatches();
    notifyAutomationEdit();
    refreshPreview();
  });
}

function setupBackgroundControl() {
  bgColorPicker.value = loadBackgroundColor();
  bgColorPicker.addEventListener('input', () => {
    saveBackgroundColor(bgColorPicker.value);
    setBackgroundColor(bgColorPicker.value);
    if (audioBuffer) {
      refreshPreview();
    } else {
      drawBackdrop(ctx);
      drawFrame(ctx, silentFrame());
      updateAnalysisDisplays();
    }
  });
}

function setupVariationPanel() {
  let variation = loadVariation();
  let regenerateOnNextApply = false;

  function syncSliderLabels() {
    colorShiftVal.textContent = `${variation.colorShift}%`;
    shapeCountVal.textContent = String(variation.shapeCount);
    sizeSpreadVal.textContent = `${variation.sizeSpread}%`;
    spinIntensityVal.textContent = `${variation.spinIntensity}%`;
    speedSpreadVal.textContent = `${variation.speedSpread}%`;
    layoutSpreadVal.textContent = `${variation.layoutSpread}%`;
    depthRangeVal.textContent = `${variation.depthRange}%`;
    manualSpeedVal.textContent = `${variation.manualSpeedValue}%`;
    surpriseRateVal.textContent = `${variation.surpriseRate}%`;
    cornerRoundVal.textContent = `${variation.cornerRound}%`;
    colorShiftSlider.disabled = variation.colorMode === 'manual';
    manualSpeedSlider.disabled = !variation.manualSpeed;
    surpriseRateSlider.disabled = !variation.surprises;
    cornerRoundSlider.disabled = !variation.roundedEdges;
  }

  function renderSpeedControls() {
    const speed = variation.animationSpeed ?? 1;
    const html = ANIMATION_SPEEDS.map(({ value, label }) =>
      `<button type="button" class="speed-btn${speed === value ? ' active' : ''}" data-speed="${value}" aria-pressed="${speed === value}">${label}</button>`,
    ).join('');

    for (const root of [speedControl, speedControlPanel]) {
      if (!root) continue;
      root.innerHTML = html;
      root.querySelectorAll('.speed-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const next = Number(btn.dataset.speed);
          if (next === variation.animationSpeed) return;
          variation.animationSpeed = next;
          saveVariation(variation);
          setVariationSettings(variation);
          renderSpeedControls();
          refreshPreview();
        });
      });
    }
  }

  function renderShapeToggles() {
    shapeToggles.innerHTML = SHAPE_OPTIONS.map(({ id, label }) => {
      const on = variation.enabledShapes.includes(id);
      return `<label class="shape-toggle${on ? ' active' : ''}">
        <input type="checkbox" data-shape="${id}"${on ? ' checked' : ''} />
        <span>${label}</span>
      </label>`;
    }).join('');

    shapeToggles.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const id = cb.dataset.shape;
        if (cb.checked) {
          if (!variation.enabledShapes.includes(id)) variation.enabledShapes.push(id);
        } else if (variation.enabledShapes.length > 1) {
          variation.enabledShapes = variation.enabledShapes.filter((s) => s !== id);
        } else {
          cb.checked = true;
          return;
        }
        applyVariation(true);
        renderShapeToggles();
      });
    });
  }

  function renderColorModeSelect() {
    colorModeSelect.innerHTML = COLOR_MODES.map(({ id, label }) =>
      `<option value="${id}"${variation.colorMode === id ? ' selected' : ''}>${label}</option>`,
    ).join('');
  }

  function applyVariation(forceRegenerate = regenerateOnNextApply) {
    saveVariation(variation);
    setVariationSettings(variation);
    if (forceRegenerate) {
      regenerateVariation();
      regenerateOnNextApply = false;
    }
    syncSliderLabels();
    refreshPreview();
  }

  function bindSlider(slider, key, suffix = '%', needsRegenerate = false) {
    const valEl = document.getElementById(`${slider.id.replace('-slider', '-val')}`);
    const updateLabel = () => {
      if (valEl) valEl.textContent = suffix === '' ? String(variation[key]) : `${variation[key]}${suffix}`;
    };

    slider.addEventListener('input', () => {
      variation[key] = Number(slider.value);
      updateLabel();
      applyVariation(false);
    });

    if (needsRegenerate) {
      slider.addEventListener('change', () => {
        variation[key] = Number(slider.value);
        updateLabel();
        applyVariation(true);
      });
    }
  }

  colorShiftSlider.value = String(variation.colorShift);
  shapeCountSlider.value = String(variation.shapeCount);
  sizeSpreadSlider.value = String(variation.sizeSpread);
  spinIntensitySlider.value = String(variation.spinIntensity);
  speedSpreadSlider.value = String(variation.speedSpread);
  layoutSpreadSlider.value = String(variation.layoutSpread);
  fixedLayoutCheck.checked = variation.fixedLayout !== false;
  depthRangeSlider.value = String(variation.depthRange);
  manualSpeedCheck.checked = variation.manualSpeed;
  manualSpeedSlider.value = String(variation.manualSpeedValue);
  surprisesCheck.checked = variation.surprises;
  surpriseRateSlider.value = String(variation.surpriseRate);
  roundedEdgesCheck.checked = variation.roundedEdges;
  roundedEdgesToggle?.classList.toggle('active', variation.roundedEdges);
  kantenCheck.checked = variation.kanten;
  kantenToggle?.classList.toggle('active', variation.kanten);
  cornerRoundSlider.value = String(variation.cornerRound);
  renderColorModeSelect();
  renderShapeToggles();
  renderSpeedControls();
  syncSliderLabels();

  function syncVariationUI() {
    colorShiftSlider.value = String(variation.colorShift);
    shapeCountSlider.value = String(variation.shapeCount);
    sizeSpreadSlider.value = String(variation.sizeSpread);
    spinIntensitySlider.value = String(variation.spinIntensity);
    speedSpreadSlider.value = String(variation.speedSpread);
    layoutSpreadSlider.value = String(variation.layoutSpread);
    fixedLayoutCheck.checked = variation.fixedLayout !== false;
    depthRangeSlider.value = String(variation.depthRange);
    manualSpeedCheck.checked = variation.manualSpeed;
    manualSpeedSlider.value = String(variation.manualSpeedValue);
    surprisesCheck.checked = variation.surprises;
    surpriseRateSlider.value = String(variation.surpriseRate);
    roundedEdgesCheck.checked = variation.roundedEdges;
    roundedEdgesToggle?.classList.toggle('active', variation.roundedEdges);
    kantenCheck.checked = variation.kanten;
    kantenToggle?.classList.toggle('active', variation.kanten);
    cornerRoundSlider.value = String(variation.cornerRound);
    colorModeSelect.value = variation.colorMode;
    renderColorModeSelect();
    renderShapeToggles();
    renderSpeedControls();
    syncSliderLabels();
  }

  colorModeSelect.addEventListener('change', () => {
    variation.colorMode = colorModeSelect.value;
    applyVariation(false);
    syncSliderLabels();
  });

  bindSlider(colorShiftSlider, 'colorShift', '%', false);
  bindSlider(shapeCountSlider, 'shapeCount', '', true);
  bindSlider(sizeSpreadSlider, 'sizeSpread', '%', true);
  bindSlider(spinIntensitySlider, 'spinIntensity', '%', false);
  bindSlider(speedSpreadSlider, 'speedSpread', '%', true);
  bindSlider(layoutSpreadSlider, 'layoutSpread', '%', true);
  bindSlider(depthRangeSlider, 'depthRange', '%', true);

  fixedLayoutCheck.addEventListener('change', () => {
    variation.fixedLayout = fixedLayoutCheck.checked;
    applyVariation(false);
  });

  bindSlider(manualSpeedSlider, 'manualSpeedValue', '%', false);

  manualSpeedCheck.addEventListener('change', () => {
    variation.manualSpeed = manualSpeedCheck.checked;
    applyVariation(false);
    syncSliderLabels();
  });

  surprisesCheck.addEventListener('change', () => {
    variation.surprises = surprisesCheck.checked;
    applyVariation(false);
    syncSliderLabels();
  });

  bindSlider(surpriseRateSlider, 'surpriseRate', '%', false);

  roundedEdgesCheck.addEventListener('change', () => {
    variation.roundedEdges = roundedEdgesCheck.checked;
    roundedEdgesToggle?.classList.toggle('active', variation.roundedEdges);
    syncSliderLabels();
    applyVariation(false);
  });

  bindSlider(cornerRoundSlider, 'cornerRound', '%', false);

  kantenCheck.addEventListener('change', () => {
    variation.kanten = kantenCheck.checked;
    kantenToggle?.classList.toggle('active', variation.kanten);
    applyVariation(false);
  });

  variationResetBtn.addEventListener('click', () => {
    variation = cloneVariation(DEFAULT_VARIATION);
    colorShiftSlider.value = String(variation.colorShift);
    shapeCountSlider.value = String(variation.shapeCount);
    sizeSpreadSlider.value = String(variation.sizeSpread);
    spinIntensitySlider.value = String(variation.spinIntensity);
    speedSpreadSlider.value = String(variation.speedSpread);
    layoutSpreadSlider.value = String(variation.layoutSpread);
    fixedLayoutCheck.checked = variation.fixedLayout !== false;
    depthRangeSlider.value = String(variation.depthRange);
    manualSpeedCheck.checked = variation.manualSpeed;
    manualSpeedSlider.value = String(variation.manualSpeedValue);
    surprisesCheck.checked = variation.surprises;
    surpriseRateSlider.value = String(variation.surpriseRate);
    roundedEdgesCheck.checked = variation.roundedEdges;
    roundedEdgesToggle?.classList.toggle('active', variation.roundedEdges);
    kantenCheck.checked = variation.kanten;
    kantenToggle?.classList.toggle('active', variation.kanten);
    cornerRoundSlider.value = String(variation.cornerRound);
    colorModeSelect.value = variation.colorMode;
    renderShapeToggles();
    regenerateOnNextApply = true;
    resetPlayhead();
    applyVariation(true);
  });

  return {
    syncFromStores() {
      variation = loadVariation();
      syncVariationUI();
    },
  };
}

function drawIdleFrame() {
  const frame = analysisFrameAtTime(playOffset);
  if (frame) {
    drawFrame(ctx, { ...frame, time: playOffset });
  } else {
    drawBackdrop(ctx);
    drawFrame(ctx, { ...silentFrame(), time: 0 });
  }
}

function ensureAudioGraph() {
  if (!audioContext) {
    audioContext = new AudioContext();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.75;
    gainNode = audioContext.createGain();
    analyserNode.connect(gainNode);
    gainNode.connect(audioContext.destination);
  }
}

async function togglePlay() {
  if (!audioBuffer) return;

  if (isPlaying) {
    pausePlayback();
    return;
  }

  ensureAudioGraph();
  if (audioContext.state === 'suspended') await audioContext.resume();

  resetLiveBeatState();

  sourceNode = audioContext.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(analyserNode);
  sourceNode.onended = () => {
    if (isPlaying) stopPlayback();
  };

  playStartTime = audioContext.currentTime;
  sourceNode.start(0, playOffset);
  isPlaying = true;
  playBtn.textContent = 'Pause';
  startPreviewLoop();
}

function pausePlayback() {
  if (!isPlaying || !audioContext) return;
  playOffset += audioContext.currentTime - playStartTime;
  sourceNode?.stop();
  sourceNode = null;
  isPlaying = false;
  playBtn.textContent = 'Play';
  cancelAnimationFrame(previewRAF);
  if (automation.isRecording) {
    automation.stop();
    syncAutomationControls();
  }
  previewAtPlayhead();
}

function stopPlayback() {
  if (sourceNode) {
    try { sourceNode.stop(); } catch { /* already stopped */ }
    sourceNode = null;
  }
  isPlaying = false;
  playOffset = 0;
  playBtn.textContent = 'Play';
  cancelAnimationFrame(previewRAF);
  resetLiveBeatState();
  if (audioBuffer) {
    syncPlayheadSlider(0, audioBuffer.duration);
    updateTimeDisplay(0, audioBuffer.duration);
    resetPlayhead();
    refreshPreview();
  }
}

function startPreviewLoop() {
  function loop() {
    if (!isPlaying) return;

    const elapsed = playOffset + (audioContext.currentTime - playStartTime);
    applyAutomationAtTime(elapsed);
    const frame = liveFrameFromAnalyser(analyserNode, 128);
    frame.time = elapsed;
    drawFrame(ctx, frame);
    if (automation.isRecording) {
      captureAutomationKeyframe(elapsed);
    }
    syncPlayheadSlider(elapsed, audioBuffer.duration);
    updateTimeDisplay(elapsed, audioBuffer.duration);
    updateAnalysisDisplays();
    previewRAF = requestAnimationFrame(loop);
  }

  previewRAF = requestAnimationFrame(loop);
}

function updateTimeDisplay(current, total) {
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;
  syncPlayheadSlider(current, total);
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function handleExport(preview = false) {
  if (!audioFile || !analysis) return;

  const { startTime, endTime } = preview ? getClipRange() : { startTime: 0, endTime: null };
  if (preview && endTime - startTime < 0.2) {
    alert('Preview clip must be at least 0.2 seconds.');
    return;
  }

  stopPlayback();
  exportBtn.disabled = true;
  previewExportBtn.disabled = true;
  playBtn.disabled = true;
  showCreateProgress(true);
  setCreateProgress(0, preview ? 'Starting preview export…' : 'Starting full export…');

  try {
    const mp4 = await exportToMp4({
      analysis,
      audioFile,
      onProgress: (pct, label) => setCreateProgress(pct, label),
      startTime,
      endTime,
      preview,
      automationKeyframes: automation.exportData(),
    });

    const url = URL.createObjectURL(mp4);
    const a = document.createElement('a');
    a.href = url;
    const base = audioFile.name.replace(/\.(mp3|wav)$/i, '');
    const suffix = preview
      ? `-preview_${Math.round(startTime)}s-${Math.round(endTime)}s`
      : '-visualizer';
    a.download = `${base}${suffix}.mp4`;
    a.click();
    URL.revokeObjectURL(url);
    setCreateProgress(100, 'Download started');
  } catch (err) {
    console.error(err);
    alert(`Export failed: ${err.message}\n\nTry a shorter clip, or use Chrome/Edge for best results.`);
    setCreateProgress(0, 'Export failed');
  } finally {
    exportBtn.disabled = false;
    previewExportBtn.disabled = !audioBuffer;
    playBtn.disabled = false;
    refreshPreview();
    setTimeout(() => {
      showCreateProgress(false);
      setCreateProgress(0, '');
    }, 2000);
  }
}

function showUploadProgress(visible) {
  uploadProgressWrap.hidden = !visible;
}

function showCreateProgress(visible) {
  createProgressWrap.hidden = !visible;
}

function setUploadProgress(pct, label) {
  const clamped = Math.min(100, Math.max(0, pct));
  uploadProgressFill.style.width = `${clamped}%`;
  uploadProgressLabel.textContent = label;
  uploadProgressPercent.textContent = `${Math.round(clamped)}%`;
}

function setCreateProgress(pct, label) {
  const clamped = Math.min(100, Math.max(0, pct));
  createProgressFill.style.width = `${clamped}%`;
  createProgressLabel.textContent = label;
  createProgressPercent.textContent = `${Math.round(clamped)}%`;
}

function resetState(clearAudioLabel = true) {
  audioFile = null;
  audioBuffer = null;
  analysis = null;
  playOffset = 0;
  automation.clear();
  clearAutomationSample();
  syncAutomationControls();
  syncPlayheadSlider(0, 0);
  if (clearAudioLabel) fileNameEl.textContent = 'No audio loaded';
  playBtn.disabled = true;
  stopBtn.disabled = true;
  exportBtn.disabled = true;
  syncClipRangeInputs();
  setUploadProgress(0, '');
  showUploadProgress(false);
}

drawBackdrop(ctx);
drawFrame(ctx, silentFrame());
updateAnalysisDisplays();
syncAutomationControls();
