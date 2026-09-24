import { analyzeAudioBuffer, decodeAudioFile, liveFrameFromAnalyser, resetLiveBeatState, deserializeAnalysis, audioFileFingerprint, serializeAnalysis, FPS } from './audio/analyzer.js';
import {
  drawFrame,
  drawBackdrop,
  resetRenderer,
  resetPlayhead,
  resetMotionState,
  warmScenePreview,
  setSongDuration,
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
  setSongTitle,
  setTitleFrequency,
  getSongTitle,
  getTitleFrequency,
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
import { saveAudio, loadAudio, saveAudioAnalysis } from './storage/db.js';
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
import { VISUAL_CONCEPTS, isGeometricConcept, isLavaConcept, isLivingSongConcept, isGlobeConcept } from './visualizer/visualConceptStore.js';
import { livingSongVisualTimeAt, LIVING_SONG_HOLD_SECONDS } from './visualizer/concepts/visualLivingSongConcept.js';
import { GLOBE_SHAPE_MODES } from './visualizer/globeShapeModes.js';
import { GLOBE_TUBE_PROFILES } from './visualizer/globeTubeProfile.js';
import { GLOBE_JOINT_STYLES } from './visualizer/globeJointStyle.js';
import { AutomationRecorder } from './visualizer/automationStore.js';
import { buildAppConfig, downloadAppConfig, parseAppConfig, suggestConfigFilename } from './visualizer/configStore.js';
import { loadBackgroundColor, saveBackgroundColor } from './visualizer/backgroundStore.js';
import {
  loadSongTitle,
  saveSongTitle,
  loadTitleFrequency,
  saveTitleFrequency,
  titleFromFilename,
} from './visualizer/titleStore.js';
import { setupHelpPanel } from './help/setupHelpPanel.js';
import {
  CINEMATIC_SLIDERS,
  DEFAULT_CINEMATIC_SETTINGS,
  normalizeCinematicSettings,
} from './visualizer/cinematicSettingsStore.js';

const BUNDLED_AUDIO_URL = '/samples/the-blue-monk.mp3';
const BUNDLED_AUDIO_NAME = '09 TheBlueMonk.mp3';

function setupUiToggles() {
  const root = document.documentElement;
  const modeBtn = document.getElementById('ui-mode-toggle-btn');
  const modeLabel = document.getElementById('ui-mode-toggle-label');
  const themeBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-toggle-icon');

  function syncModeUi() {
    const mode = root.getAttribute('data-ui-mode') || 'redesign';
    if (modeLabel) modeLabel.textContent = mode === 'classic' ? 'Classic UI' : 'New UI';
    if (modeBtn) modeBtn.title = mode === 'classic' ? 'Switch to the redesigned UI' : 'Switch to the classic UI';
  }

  function syncThemeUi() {
    const theme = root.getAttribute('data-theme') || 'dark';
    if (themeIcon) themeIcon.textContent = theme === 'light' ? '☀' : '☽';
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(theme === 'light'));
  }

  modeBtn?.addEventListener('click', () => {
    const next = (root.getAttribute('data-ui-mode') || 'redesign') === 'classic' ? 'redesign' : 'classic';
    root.setAttribute('data-ui-mode', next);
    try { localStorage.setItem('ui-mode', next); } catch { /* storage unavailable */ }
    syncModeUi();
  });

  themeBtn?.addEventListener('click', () => {
    const next = (root.getAttribute('data-theme') || 'dark') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ui-theme', next); } catch { /* storage unavailable */ }
    syncThemeUi();
  });

  syncModeUi();
  syncThemeUi();
}
setupUiToggles();

const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');
const loadSampleBtn = document.getElementById('load-sample-btn');
const fileNameEl = document.getElementById('file-name');
const canvas = document.getElementById('visualizer');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const muteBtn = document.getElementById('mute-btn');
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
const exportAudioCheck = document.getElementById('export-audio-check');
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
const visualConceptSelect = document.getElementById('visual-concept-select');
const shapeTypesBlock = document.getElementById('shape-types-block');
const shapeTypesLabel = document.getElementById('shape-types-label');
const colorModeSelect = document.getElementById('color-mode-select');
const colorShiftSlider = document.getElementById('color-shift-slider');
const colorShiftVal = document.getElementById('color-shift-val');
const shapeCountSlider = document.getElementById('shape-count-slider');
const shapeCountInput = document.getElementById('shape-count-input');
const shapeCountVal = document.getElementById('shape-count-val');
const sizeSpreadSlider = document.getElementById('size-spread-slider');
const sizeSpreadVal = document.getElementById('size-spread-val');
const elementSizeFromSlider = document.getElementById('element-size-from-slider');
const elementSizeFromVal = document.getElementById('element-size-from-val');
const elementSizeToSlider = document.getElementById('element-size-to-slider');
const elementSizeToVal = document.getElementById('element-size-to-val');
const elementDistanceFromSlider = document.getElementById('element-distance-from-slider');
const elementDistanceFromVal = document.getElementById('element-distance-from-val');
const elementDistanceToSlider = document.getElementById('element-distance-to-slider');
const elementDistanceToVal = document.getElementById('element-distance-to-val');
const spinIntensitySlider = document.getElementById('spin-intensity-slider');
const spinIntensityVal = document.getElementById('spin-intensity-val');
const speedSpreadSlider = document.getElementById('speed-spread-slider');
const speedSpreadVal = document.getElementById('speed-spread-val');
const layoutSpreadSlider = document.getElementById('layout-spread-slider');
const layoutSpreadVal = document.getElementById('layout-spread-val');
const fixedLayoutCheck = document.getElementById('fixed-layout-check');
const elementUnicolorCheck = document.getElementById('element-unicolor-check');
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
const liquidControlsGroup = document.getElementById('liquid-controls-group');
const lavaControlsLabel = document.getElementById('lava-controls-label');
const lavaControlsHint = document.getElementById('lava-controls-hint');
const liquidFlowSpeedSlider = document.getElementById('liquid-flow-speed-slider');
const liquidFlowSpeedVal = document.getElementById('liquid-flow-speed-val');
const liquidThicknessSlider = document.getElementById('liquid-thickness-slider');
const liquidThicknessVal = document.getElementById('liquid-thickness-val');
const liquidReliefSlider = document.getElementById('liquid-relief-slider');
const liquidReliefVal = document.getElementById('liquid-relief-val');
const liquidTurbulenceSlider = document.getElementById('liquid-turbulence-slider');
const liquidTurbulenceVal = document.getElementById('liquid-turbulence-val');
const globeControlsGroup = document.getElementById('globe-controls-group');
const globeShapeSelect = document.getElementById('globe-shape-select');
const globeDetailSlider = document.getElementById('globe-detail-slider');
const globeDetailVal = document.getElementById('globe-detail-val');
const globeTubeProfileSelect = document.getElementById('globe-tube-profile-select');
const globeJointStyleSelect = document.getElementById('globe-joint-style-select');
const livingSongControlsGroup = document.getElementById('living-song-controls-group');
const elementMotionSlider = document.getElementById('element-motion-slider');
const elementMotionVal = document.getElementById('element-motion-val');
const elementTurnSlider = document.getElementById('element-turn-slider');
const elementTurnVal = document.getElementById('element-turn-val');
const element3dMotionSlider = document.getElementById('element-3d-motion-slider');
const element3dMotionVal = document.getElementById('element-3d-motion-val');
const surfaceWobbleSlider = document.getElementById('surface-wobble-slider');
const surfaceWobbleVal = document.getElementById('surface-wobble-val');
const backgroundDepthSlider = document.getElementById('background-depth-slider');
const backgroundDepthVal = document.getElementById('background-depth-val');
const variationResetBtn = document.getElementById('variation-reset');
const rendererModeSelect = document.getElementById('renderer-mode-select');
const cameraZoomSlider = document.getElementById('camera-zoom-slider');
const cameraZoomVal = document.getElementById('camera-zoom-val');
const cinematicSection = document.getElementById('cinematic-section');
const cinematicSectionToggle = document.getElementById('cinematic-section-toggle');
const cinematicSectionBody = document.getElementById('cinematic-section-body');
const mappingSection = document.getElementById('mapping-section');
const mappingSectionToggle = document.getElementById('mapping-section-toggle');
const mappingSectionBody = document.getElementById('mapping-section-body');
const audioSourcesSection = document.getElementById('audio-sources-section');
const audioSourcesSectionToggle = document.getElementById('audio-sources-section-toggle');
const audioSourcesSectionBody = document.getElementById('audio-sources-section-body');
const cinematicSliders = document.getElementById('cinematic-sliders');
const cinematicShadowsCheck = document.getElementById('cinematic-shadows-check');
const cinematicShadowsToggle = document.getElementById('cinematic-shadows-toggle');
const cinematicTrueColorsCheck = document.getElementById('cinematic-true-colors-check');
const cinematicTrueColorsToggle = document.getElementById('cinematic-true-colors-toggle');
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
let lastAnalysisUiUpdate = 0;
let isPlaying = false;
let isMuted = false;
let playStartTime = 0;
let playOffset = 0;

const automation = new AutomationRecorder();
let mappingPanel = null;
let variationController = null;
let exportInProgress = false;
/** @type {string|null} Source URL when audio was loaded from fetch (bundled or config). */
let audioSourceUrl = null;

const ACCEPTED_EXTENSIONS = /\.(mp3|wav)$/i;
const ACCEPTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
]);

const CINEMATIC_PANEL_OPEN_KEY = 'visualizer-cinematic-panel-open';
const MAPPING_PANEL_OPEN_KEY = 'visualizer-mapping-panel-open';
const SONG_ANALYSIS_PANEL_OPEN_KEY = 'visualizer-song-analysis-panel-open';

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
loadSampleBtn?.addEventListener('click', () => tryLoadBundledAudio());
playBtn.addEventListener('click', togglePlay);
stopBtn.addEventListener('click', stopPlayback);
muteBtn?.addEventListener('click', toggleMute);
setupPlayheadControl();
setupAutomationControls();
setupConfigControls();
setupCinematicPanel();
setupRendererMode();
setupCameraZoom();
exportBtn.addEventListener('click', () => handleExport(false));
previewExportBtn?.addEventListener('click', () => handleExport(true));

mappingPanel = setupMappingPanel();
setupCollapsiblePanels();
setupHelpPanel({
  getVariation: getVariationSettings,
  getCinematic: getCinematicSettings,
  getViscosity: () => mappingPanel?.getViscosity?.() ?? loadViscosity(),
  hasAudio: () => !!audioBuffer,
});
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
void tryLoadPresetFromQuery();
initFromStorage();

async function initFromStorage() {
  showUploadProgress(true);
  setUploadProgress(0, 'Loading song…');

  if (await tryLoadBundledAudio()) return;

  try {
    const storedAudio = await loadAudio();
    if (storedAudio?.file && await processAudioFile(storedAudio.file, false, `${storedAudio.file.name} (saved)`, {
      quiet: true,
      cachedAnalysis: storedAudio.analysis,
      cachedFingerprint: storedAudio.fingerprint,
    })) {
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
    const file = await fetchAsFile(BUNDLED_AUDIO_URL, BUNDLED_AUDIO_NAME, 'audio/mpeg');
    return await processAudioFile(file, true, `${file.name} (bundled sample)`, {
      quiet: true,
      sourceUrl: BUNDLED_AUDIO_URL,
    });
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

async function processAudioFile(file, persist, displayName, { quiet = false, cachedAnalysis = null, cachedFingerprint = null, sourceUrl = null } = {}) {
  stopPlayback();
  resetState(false);
  audioSourceUrl = sourceUrl;
  setUploadProgress(0, 'Starting…');
  showUploadProgress(true);
  dropzone.classList.add('loading');

  try {
    audioFile = file;
    fileNameEl.textContent = displayName ?? (persist ? file.name : `${file.name} (saved)`);

    const onUploadProgress = (pct, label) => setUploadProgress(pct, label);
    const fingerprint = cachedFingerprint ?? audioFileFingerprint(file);

    audioBuffer = await decodeAudioFile(file, onUploadProgress);

    let restored = cachedAnalysis && fingerprint === audioFileFingerprint(file)
      ? deserializeAnalysis(cachedAnalysis)
      : null;

    if (!restored) {
      try {
        const stored = await loadAudio();
        if (stored?.fingerprint === fingerprint && stored.analysis) {
          restored = deserializeAnalysis(stored.analysis);
        }
      } catch {
        /* no stored cache */
      }
    }

    if (restored) {
      analysis = restored;
      onUploadProgress(100, 'Using cached analysis');
    } else {
      analysis = await analyzeAudioBuffer(audioBuffer, onUploadProgress);
      if (persist) {
        await saveAudio(file, analysis);
      } else {
        await saveAudioAnalysis(analysis);
      }
    }

    resetRenderer(canvas.width, canvas.height);
    setSongDuration(audioBuffer.duration);
    resetLiveBeatState();
    drawBackdrop(ctx);

    playBtn.disabled = false;
    stopBtn.disabled = false;
    if (muteBtn) muteBtn.disabled = false;
    exportBtn.disabled = false;
    syncClipRangeInputs();
    updateTimeDisplay(0, clipDisplayDuration());
    syncPlayheadSlider(0, clipDisplayDuration());
    previewAtPlayhead();
    syncAutomationControls();
    setUploadProgress(100, 'Ready to play');

    if (!getSongTitle()) {
      const fromName = titleFromFilename(file.name);
      if (fromName) applyTitleSettings(fromName, loadTitleFrequency());
    }

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

function updateAnalysisDisplays(force = false) {
  const now = performance.now();
  if (!force && now - lastAnalysisUiUpdate < 120) return;
  lastAnalysisUiUpdate = now;
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
  const title = getSongTitle() || loadSongTitle();
  const titleFrequency = getTitleFrequency() ?? loadTitleFrequency();
  return {
    variation: getVariationSettings(),
    mappings: mappingPanel?.getMappings() ?? loadMappingMatrix(),
    viscosity: mappingPanel?.getViscosity() ?? loadViscosity(),
    bgColor: loadBackgroundColor(),
    title,
    titleFrequency,
    palette: snapshotPaletteForAutomation(),
    cinematic: getCinematicSettings(),
  };
}

function collectCurrentExportSettings() {
  return {
    clipFrom: parseClipSeconds(clipFromInput?.value, 0),
    clipTo: clipToInput?.value === '' ? null : parseClipSeconds(clipToInput?.value, 0),
    includeAudio: exportAudioCheck?.checked !== false,
  };
}

function collectCurrentAudioRef() {
  if (!audioFile) return null;
  return {
    fileName: audioFile.name,
    displayName: fileNameEl?.textContent || audioFile.name,
    fingerprint: audioFileFingerprint(audioFile),
    url: audioSourceUrl,
    duration: audioBuffer?.duration ?? null,
    analysis: analysis ? serializeAnalysis(analysis) : null,
  };
}

function applyExportSettings(exportSettings) {
  if (!exportSettings) return;
  if (clipFromInput) clipFromInput.value = String(exportSettings.clipFrom ?? 0);
  if (clipToInput && exportSettings.clipTo != null) {
    clipToInput.value = String(exportSettings.clipTo);
  }
  if (exportAudioCheck) exportAudioCheck.checked = exportSettings.includeAudio !== false;
  syncClipRangeInputs();
}

function applyTitleSettings(title, titleFrequency) {
  const resolvedTitle = typeof title === 'string' ? title : '';
  const resolvedFreq = Number.isFinite(titleFrequency)
    ? Math.min(100, Math.max(0, Math.round(titleFrequency)))
    : loadTitleFrequency();
  saveSongTitle(resolvedTitle);
  saveTitleFrequency(resolvedFreq);
  setSongTitle(resolvedTitle);
  setTitleFrequency(resolvedFreq);
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
  syncCameraZoomUI(look.cinematic ?? getCinematicSettings());

  applyTitleSettings(look.title, look.titleFrequency);

  resetPlayhead();
  refreshPreview();
}

async function restoreAudioFromConfig(audioRef) {
  if (!audioRef) return false;

  if (audioRef.url) {
    try {
      const file = await fetchAsFile(
        audioRef.url,
        audioRef.fileName || 'audio.wav',
        'audio/wav',
      );
      audioSourceUrl = audioRef.url;
      const ok = await processAudioFile(file, false, audioRef.displayName || file.name, {
        quiet: true,
        cachedAnalysis: audioRef.analysis,
        cachedFingerprint: audioRef.fingerprint,
        sourceUrl: audioRef.url,
      });
      if (ok) return true;
    } catch (err) {
      console.warn('Could not load audio from config URL', err);
    }
  }

  try {
    const stored = await loadAudio();
    if (stored?.file && (!audioRef.fingerprint || stored.fingerprint === audioRef.fingerprint)) {
      const ok = await processAudioFile(stored.file, false, stored.file.name, {
        quiet: true,
        cachedAnalysis: audioRef.analysis ?? stored.analysis,
        cachedFingerprint: audioRef.fingerprint ?? stored.fingerprint,
      });
      if (ok) return true;
    }
  } catch (err) {
    console.warn('Could not restore audio from storage', err);
  }

  if (audioRef.fileName) {
    flashConfigStatus(`Visual settings loaded — open audio: ${audioRef.fileName}`);
  }
  return false;
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

async function tryLoadPresetFromQuery() {
  const params = new URLSearchParams(location.search);
  const name = params.get('preset');
  if (!name) return;

  try {
    const res = await fetch(`/presets/${encodeURIComponent(name)}.mviz.json`);
    if (!res.ok) return;
    const parsed = parseAppConfig(await res.text());
    if (!parsed) return;

    if (parsed.look) applyLookSettings(parsed.look);
    if (parsed.export) applyExportSettings(parsed.export);

    if (parsed.renderer && parsed.renderer !== getRendererMode()) {
      setRendererMode(parsed.renderer);
      if (rendererModeSelect) rendererModeSelect.value = parsed.renderer;
      resetRenderer(canvas.width, canvas.height);
      updateExportButtonLabel();
    }

    if (parsed.automation?.keyframes?.length) {
      automation.loadKeyframes(parsed.automation.keyframes);
      clearAutomationPaletteCacheLocal();
    }

    flashConfigStatus(`Loaded preset: ${name}`);
  } catch (err) {
    console.warn('Could not load preset', err);
  }
}

/** Default preview clip end for quick export tests (seconds). */
const DEFAULT_CLIP_END_SEC = 10.8;

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
  const clipTo = parseClipSeconds(clipToInput?.value, 0);
  if (clipTo <= 0 || clipTo > dur) {
    clipToInput.value = String(Math.min(DEFAULT_CLIP_END_SEC, Math.round(dur * 10) / 10));
  }
}

function parseClipSeconds(value, fallback = 0) {
  if (value == null || value === '') return fallback;
  const normalized = String(value).trim().replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function getClipRange() {
  if (!audioBuffer) return { startTime: 0, endTime: 0 };
  const dur = audioBuffer.duration;
  let startTime = Math.max(0, parseClipSeconds(clipFromInput?.value, 0));
  let endTime = parseClipSeconds(clipToInput?.value, dur);
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
      export: collectCurrentExportSettings(),
      audio: collectCurrentAudioRef(),
      automationKeyframes: automation.exportData(),
    });
    const filename = suggestConfigFilename(audioFile?.name || getSongTitle());
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

    if (parsed.export) {
      applyExportSettings(parsed.export);
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
    if (parsed.audio) {
      await restoreAudioFromConfig(parsed.audio);
    }
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

function clipDisplayDuration() {
  const songDur = audioBuffer?.duration ?? 0;
  if (songDur > 0 && isLivingSongConcept(getVariationSettings().visualConcept)) {
    return songDur + LIVING_SONG_HOLD_SECONDS;
  }
  return songDur;
}

function livingSongVisualTime(playTime) {
  const songDur = audioBuffer?.duration ?? 0;
  if (!isLivingSongConcept(getVariationSettings().visualConcept) || songDur <= 0) {
    return playTime;
  }
  return livingSongVisualTimeAt(playTime, songDur);
}

function analysisFrameAtTime(seconds) {
  if (!analysis?.frames?.length) return null;
  const idx = Math.min(analysis.frames.length - 1, Math.floor(seconds * FPS));
  return analysis.frames[idx];
}

let playheadPreviewRaf = 0;
let playheadScrubPending = false;

function previewAtPlayhead({ warmSteps = 6, syncAutomationUi = true } = {}) {
  applyAutomationAtTime(Math.min(playOffset, audioBuffer?.duration ?? playOffset), syncAutomationUi);
  drawBackdrop(ctx);
  const songDur = audioBuffer?.duration ?? 0;
  const audioTime = songDur > 0 ? Math.min(playOffset, Math.max(0, songDur - 1 / FPS)) : playOffset;
  const visualTime = livingSongVisualTime(playOffset);
  const frame = analysisFrameAtTime(audioTime);
  const payload = frame
    ? { ...frame, time: visualTime }
    : { ...silentFrame(), time: visualTime };
  resetMotionState();
  warmScenePreview(payload, warmSteps);
  drawFrame(ctx, payload);
  updateAnalysisDisplays(true);
}

function seekToTime(seconds, { scrubbing = false } = {}) {
  if (!audioBuffer) return;
  playOffset = Math.min(clipDisplayDuration(), Math.max(0, seconds));
  syncPlayheadSlider(playOffset, clipDisplayDuration());
  updateTimeDisplay(playOffset, clipDisplayDuration());

  if (isPlaying) {
    restartPlaybackAtOffset();
    return;
  }

  if (scrubbing) {
    playheadScrubPending = true;
    if (playheadPreviewRaf) return;
    playheadPreviewRaf = requestAnimationFrame(() => {
      playheadPreviewRaf = 0;
      if (!playheadScrubPending) return;
      playheadScrubPending = false;
      previewAtPlayhead({ warmSteps: 0, syncAutomationUi: false });
    });
    return;
  }

  playheadScrubPending = false;
  previewAtPlayhead({ warmSteps: 6, syncAutomationUi: true });
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
    seekToTime(Number(playheadSlider.value), { scrubbing: true });
  });
  playheadSlider?.addEventListener('change', () => {
    seekToTime(Number(playheadSlider.value), { scrubbing: false });
  });
}

function syncCinematicPanelVisibility() {
  const cinematic = getRendererMode() === 'cinematic';
  const livingSong = isLivingSongConcept(getVariationSettings().visualConcept);
  if (cinematicSection) cinematicSection.hidden = !(cinematic || livingSong);
  syncCinematicPanelCollapseUi();
}

function isCollapsiblePanelCollapsed(section) {
  return section?.classList.contains('is-collapsed') ?? true;
}

function setCollapsiblePanelCollapsed(section, toggle, body, collapsed, storageKey, { persist = true, onChange } = {}) {
  if (!section || !toggle || !body) return;
  section.classList.toggle('is-collapsed', collapsed);
  body.hidden = collapsed;
  toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  onChange?.();
  if (persist && storageKey) {
    try {
      localStorage.setItem(storageKey, collapsed ? '0' : '1');
    } catch (_) { /* ignore */ }
  }
}

function loadCollapsiblePanelCollapsed(storageKey, defaultCollapsed = true) {
  try {
    if (localStorage.getItem(storageKey) === '1') return false;
  } catch (_) { /* ignore */ }
  return defaultCollapsed;
}

function setupCollapsiblePanel(section, toggle, body, storageKey, { defaultCollapsed = true, onChange } = {}) {
  if (!section || !toggle || !body) return;
  toggle.addEventListener('click', () => {
    setCollapsiblePanelCollapsed(
      section,
      toggle,
      body,
      !isCollapsiblePanelCollapsed(section),
      storageKey,
      { onChange },
    );
  });
  setCollapsiblePanelCollapsed(
    section,
    toggle,
    body,
    loadCollapsiblePanelCollapsed(storageKey, defaultCollapsed),
    storageKey,
    { persist: false, onChange },
  );
}

function setupCollapsiblePanels() {
  setupCollapsiblePanel(
    cinematicSection,
    cinematicSectionToggle,
    cinematicSectionBody,
    CINEMATIC_PANEL_OPEN_KEY,
    { defaultCollapsed: true, onChange: syncStudioLayout },
  );
  setupCollapsiblePanel(
    mappingSection,
    mappingSectionToggle,
    mappingSectionBody,
    MAPPING_PANEL_OPEN_KEY,
    { defaultCollapsed: true, onChange: syncStudioLayout },
  );
  setupCollapsiblePanel(
    audioSourcesSection,
    audioSourcesSectionToggle,
    audioSourcesSectionBody,
    SONG_ANALYSIS_PANEL_OPEN_KEY,
    { defaultCollapsed: false, onChange: syncStudioLayout },
  );
  syncStudioLayout();
}

function isCinematicPanelCollapsed() {
  return isCollapsiblePanelCollapsed(cinematicSection);
}

function setCinematicPanelCollapsed(collapsed, { persist = true } = {}) {
  setCollapsiblePanelCollapsed(
    cinematicSection,
    cinematicSectionToggle,
    cinematicSectionBody,
    collapsed,
    CINEMATIC_PANEL_OPEN_KEY,
    { persist, onChange: syncCinematicPanelCollapseUi },
  );
}

function loadCinematicPanelCollapsed() {
  return loadCollapsiblePanelCollapsed(CINEMATIC_PANEL_OPEN_KEY, true);
}

function syncStudioLayout() {
  // audioSourcesSection now lives in the preview column, not the right rail —
  // its expand state no longer affects how wide the right rail needs to be.
  const visible = [cinematicSection, mappingSection].filter((s) => s && !s.hidden);
  const anyExpanded = visible.some((s) => !isCollapsiblePanelCollapsed(s));
  document.body.classList.toggle('panel-right-expanded', anyExpanded);
}

function syncCinematicPanelCollapseUi() {
  syncStudioLayout();
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
  if (cinematicTrueColorsCheck) {
    cinematicTrueColorsCheck.checked = s.trueColors;
    cinematicTrueColorsToggle?.classList.toggle('active', s.trueColors);
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

  cinematicTrueColorsCheck?.addEventListener('change', () => {
    cinematicTrueColorsToggle?.classList.toggle('active', cinematicTrueColorsCheck.checked);
    applyCinematic({ trueColors: cinematicTrueColorsCheck.checked });
  });

  cinematicResetBtn?.addEventListener('click', () => {
    cinematicSettings = { ...DEFAULT_CINEMATIC_SETTINGS };
    setCinematicSettings(cinematicSettings);
    syncCinematicPanelFromSettings(cinematicSettings);
    syncCameraZoomUI(cinematicSettings);
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

function cameraZoomLabel(value) {
  const v = Math.round(Number(value) || 50);
  if (v <= 12) return `${v} · far`;
  if (v <= 32) return `${v} · wide`;
  if (v >= 88) return `${v} · inside`;
  if (v >= 68) return `${v} · tight`;
  return String(v);
}

function syncCameraZoomUI(settings = getCinematicSettings()) {
  const z = settings?.cameraZoom ?? 50;
  if (cameraZoomSlider) cameraZoomSlider.value = String(z);
  if (cameraZoomVal) cameraZoomVal.textContent = cameraZoomLabel(z);
}

function setupCameraZoom() {
  if (!cameraZoomSlider) return;
  syncCameraZoomUI();

  cameraZoomSlider.addEventListener('input', () => {
    const next = Number(cameraZoomSlider.value);
    setCinematicSettings({ ...getCinematicSettings(), cameraZoom: next });
    if (cameraZoomVal) cameraZoomVal.textContent = cameraZoomLabel(next);
    refreshPreview();
  });
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
  variationController?.refreshLivingControls?.();
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
    variationController?.refreshLivingControls?.();
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

  function renderLivingSongControls() {
    const concept = variation.visualConcept ?? 'geometric';
    livingSongControlsGroup?.toggleAttribute('hidden', !isLivingSongConcept(concept));
    if (surfaceWobbleSlider) surfaceWobbleSlider.value = String(variation.surfaceWobble ?? 0);
    if (backgroundDepthSlider) backgroundDepthSlider.value = String(variation.backgroundDepth ?? 50);
  }

  function syncSliderLabels() {
    colorShiftVal.textContent = `${variation.colorShift}%`;
    shapeCountVal.textContent = String(variation.shapeCount);
    if (shapeCountInput) shapeCountInput.value = String(variation.shapeCount);
    sizeSpreadVal.textContent = `${variation.sizeSpread}%`;
    if (elementSizeFromVal) elementSizeFromVal.textContent = `${variation.elementSizeFrom ?? 45}%`;
    if (elementSizeToVal) elementSizeToVal.textContent = `${variation.elementSizeTo ?? 100}%`;
    if (elementSizeFromSlider) elementSizeFromSlider.value = String(variation.elementSizeFrom ?? 45);
    if (elementSizeToSlider) elementSizeToSlider.value = String(variation.elementSizeTo ?? 100);
    if (elementDistanceFromVal) elementDistanceFromVal.textContent = `${variation.elementDistanceFrom ?? 42}%`;
    if (elementDistanceToVal) elementDistanceToVal.textContent = `${variation.elementDistanceTo ?? 74}%`;
    if (elementDistanceFromSlider) elementDistanceFromSlider.value = String(variation.elementDistanceFrom ?? 42);
    if (elementDistanceToSlider) elementDistanceToSlider.value = String(variation.elementDistanceTo ?? 74);
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
    liquidFlowSpeedVal.textContent = `${variation.liquidFlowSpeed}%`;
    liquidThicknessVal.textContent = `${variation.liquidThickness}%`;
    liquidReliefVal.textContent = `${variation.liquidRelief}%`;
    liquidTurbulenceVal.textContent = `${variation.liquidTurbulence}%`;
    if (elementMotionVal) elementMotionVal.textContent = `${variation.elementMotion ?? 50}%`;
    if (elementTurnVal) elementTurnVal.textContent = `${variation.elementTurn ?? 50}%`;
    if (element3dMotionVal) element3dMotionVal.textContent = `${variation.element3dMotion ?? 50}%`;
    if (surfaceWobbleVal) surfaceWobbleVal.textContent = `${variation.surfaceWobble ?? 0}%`;
    if (backgroundDepthVal) backgroundDepthVal.textContent = `${variation.backgroundDepth ?? 50}%`;
    renderLivingSongControls();
  }

  function renderGlobeControls() {
    const concept = variation.visualConcept ?? 'geometric';
    const show = isGlobeConcept(concept);
    globeControlsGroup?.toggleAttribute('hidden', !show);
    if (!show || !globeShapeSelect) return;

    globeShapeSelect.innerHTML = GLOBE_SHAPE_MODES.map(({ id, label }) =>
      `<option value="${id}"${variation.globeShapeMode === id ? ' selected' : ''}>${label}</option>`,
    ).join('');

    if (globeDetailSlider) globeDetailSlider.value = String(variation.globeDetail ?? 50);
    if (globeDetailVal) globeDetailVal.textContent = `${variation.globeDetail ?? 50}%`;

    if (globeTubeProfileSelect) {
      globeTubeProfileSelect.innerHTML = GLOBE_TUBE_PROFILES.map(({ id, label }) =>
        `<option value="${id}"${(variation.globeTubeProfile ?? 'round') === id ? ' selected' : ''}>${label}</option>`,
      ).join('');
    }

    if (globeJointStyleSelect) {
      globeJointStyleSelect.innerHTML = GLOBE_JOINT_STYLES.map(({ id, label }) =>
        `<option value="${id}"${(variation.globeJointStyle ?? 'sphere') === id ? ' selected' : ''}>${label}</option>`,
      ).join('');
    }
  }

  function renderLiquidControls() {
    const concept = variation.visualConcept ?? 'geometric';
    const show = isLavaConcept(concept);
    liquidControlsGroup?.toggleAttribute('hidden', !show);
    if (!show) return;

    if (lavaControlsLabel) lavaControlsLabel.textContent = 'Volcano lava';
    if (lavaControlsHint) {
      lavaControlsHint.textContent =
        'Palette colors erupt from the summit vent and flow downhill in thick streams.';
    }

    liquidFlowSpeedSlider.value = String(variation.liquidFlowSpeed);
    liquidThicknessSlider.value = String(variation.liquidThickness);
    liquidReliefSlider.value = String(variation.liquidRelief);
    liquidTurbulenceSlider.value = String(variation.liquidTurbulence);
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

  function renderVisualConceptSelect() {
    if (!visualConceptSelect) return;
    visualConceptSelect.innerHTML = VISUAL_CONCEPTS.map(({ id, label }) =>
      `<option value="${id}"${variation.visualConcept === id ? ' selected' : ''}>${label}</option>`,
    ).join('');
  }

  renderVisualConceptSelect();
  visualConceptSelect?.addEventListener('change', () => {
    variation.visualConcept = visualConceptSelect.value;
    renderShapeToggles();
    renderLiquidControls();
    renderGlobeControls();
    renderLivingSongControls();
    applyVariation(true);
    syncCinematicPanelVisibility();
  });

  function renderShapeToggles() {
    const showShapes = isGeometricConcept(variation.visualConcept ?? 'geometric');
    shapeTypesBlock?.toggleAttribute('hidden', !showShapes);
    shapeTypesLabel?.toggleAttribute('hidden', !showShapes);
    shapeToggles?.toggleAttribute('hidden', !showShapes);
    if (!showShapes) return;

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
  if (elementUnicolorCheck) elementUnicolorCheck.checked = !!variation.elementUnicolor;
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
  if (shapeCountInput) shapeCountInput.value = String(variation.shapeCount);
  if (elementMotionSlider) elementMotionSlider.value = String(variation.elementMotion ?? 50);
  if (elementTurnSlider) elementTurnSlider.value = String(variation.elementTurn ?? 50);
  if (element3dMotionSlider) element3dMotionSlider.value = String(variation.element3dMotion ?? 50);
  if (surfaceWobbleSlider) surfaceWobbleSlider.value = String(variation.surfaceWobble ?? 0);
  if (backgroundDepthSlider) backgroundDepthSlider.value = String(variation.backgroundDepth ?? 50);
  renderColorModeSelect();
  renderShapeToggles();
  renderLiquidControls();
  renderGlobeControls();
  renderLivingSongControls();
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
    if (elementUnicolorCheck) elementUnicolorCheck.checked = !!variation.elementUnicolor;
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
    liquidFlowSpeedSlider.value = String(variation.liquidFlowSpeed);
    liquidThicknessSlider.value = String(variation.liquidThickness);
    liquidReliefSlider.value = String(variation.liquidRelief);
    liquidTurbulenceSlider.value = String(variation.liquidTurbulence);
    if (elementMotionSlider) elementMotionSlider.value = String(variation.elementMotion ?? 50);
    if (elementTurnSlider) elementTurnSlider.value = String(variation.elementTurn ?? 50);
    if (element3dMotionSlider) element3dMotionSlider.value = String(variation.element3dMotion ?? 50);
    if (surfaceWobbleSlider) surfaceWobbleSlider.value = String(variation.surfaceWobble ?? 0);
  if (backgroundDepthSlider) backgroundDepthSlider.value = String(variation.backgroundDepth ?? 50);
    colorModeSelect.value = variation.colorMode;
    renderColorModeSelect();
    renderVisualConceptSelect();
    renderShapeToggles();
    renderLiquidControls();
    renderGlobeControls();
    renderLivingSongControls();
    renderSpeedControls();
    syncSliderLabels();
  }

  colorModeSelect.addEventListener('change', () => {
    variation.colorMode = colorModeSelect.value;
    applyVariation(false);
    syncSliderLabels();
  });

  globeShapeSelect?.addEventListener('change', () => {
    variation.globeShapeMode = globeShapeSelect.value;
    applyVariation(true);
  });

  globeDetailSlider?.addEventListener('input', () => {
    variation.globeDetail = Number(globeDetailSlider.value);
    if (globeDetailVal) globeDetailVal.textContent = `${variation.globeDetail}%`;
    applyVariation(true);
  });

  globeTubeProfileSelect?.addEventListener('change', () => {
    variation.globeTubeProfile = globeTubeProfileSelect.value;
    applyVariation(false);
  });

  globeJointStyleSelect?.addEventListener('change', () => {
    variation.globeJointStyle = globeJointStyleSelect.value;
    applyVariation(false);
  });

  bindSlider(colorShiftSlider, 'colorShift', '%', false);
  bindSlider(shapeCountSlider, 'shapeCount', '', true);
  shapeCountSlider.addEventListener('input', () => {
    if (shapeCountInput) shapeCountInput.value = shapeCountSlider.value;
  });
  shapeCountInput?.addEventListener('change', () => {
    const n = Math.max(1, Math.min(28, Math.round(Number(shapeCountInput.value) || variation.shapeCount)));
    variation.shapeCount = n;
    shapeCountSlider.value = String(n);
    shapeCountVal.textContent = String(n);
    shapeCountInput.value = String(n);
    applyVariation(true);
  });
  bindSlider(sizeSpreadSlider, 'sizeSpread', '%', true);

  function syncElementSizeSliders() {
    let from = variation.elementSizeFrom ?? 45;
    let to = variation.elementSizeTo ?? 100;
    if (from > to) {
      if (document.activeElement === elementSizeFromSlider) to = from;
      else from = to;
      variation.elementSizeFrom = from;
      variation.elementSizeTo = to;
    }
    if (elementSizeFromSlider) elementSizeFromSlider.value = String(from);
    if (elementSizeToSlider) elementSizeToSlider.value = String(to);
    if (elementSizeFromVal) elementSizeFromVal.textContent = `${from}%`;
    if (elementSizeToVal) elementSizeToVal.textContent = `${to}%`;
  }

  function bindElementSizeSlider(slider, key) {
    if (!slider) return;
    slider.addEventListener('input', () => {
      variation[key] = Number(slider.value);
      syncElementSizeSliders();
      applyVariation(true);
    });
    slider.addEventListener('change', () => {
      variation[key] = Number(slider.value);
      syncElementSizeSliders();
      applyVariation(true);
    });
  }

  bindElementSizeSlider(elementSizeFromSlider, 'elementSizeFrom');
  bindElementSizeSlider(elementSizeToSlider, 'elementSizeTo');

  function syncElementDistanceSliders() {
    let from = variation.elementDistanceFrom ?? 42;
    let to = variation.elementDistanceTo ?? 74;
    if (from > to) {
      if (document.activeElement === elementDistanceFromSlider) to = from;
      else from = to;
      variation.elementDistanceFrom = from;
      variation.elementDistanceTo = to;
    }
    if (elementDistanceFromSlider) elementDistanceFromSlider.value = String(from);
    if (elementDistanceToSlider) elementDistanceToSlider.value = String(to);
    if (elementDistanceFromVal) elementDistanceFromVal.textContent = `${from}%`;
    if (elementDistanceToVal) elementDistanceToVal.textContent = `${to}%`;
  }

  function bindElementDistanceSlider(slider, key) {
    if (!slider) return;
    slider.addEventListener('input', () => {
      variation[key] = Number(slider.value);
      syncElementDistanceSliders();
      applyVariation(true);
    });
    slider.addEventListener('change', () => {
      variation[key] = Number(slider.value);
      syncElementDistanceSliders();
      applyVariation(true);
    });
  }

  bindElementDistanceSlider(elementDistanceFromSlider, 'elementDistanceFrom');
  bindElementDistanceSlider(elementDistanceToSlider, 'elementDistanceTo');

  bindSlider(spinIntensitySlider, 'spinIntensity', '%', false);
  bindSlider(speedSpreadSlider, 'speedSpread', '%', true);
  bindSlider(layoutSpreadSlider, 'layoutSpread', '%', true);
  bindSlider(depthRangeSlider, 'depthRange', '%', true);
  bindSlider(elementMotionSlider, 'elementMotion', '%', false);
  bindSlider(elementTurnSlider, 'elementTurn', '%', false);
  bindSlider(element3dMotionSlider, 'element3dMotion', '%', false);
  bindSlider(surfaceWobbleSlider, 'surfaceWobble', '%', false);
  bindSlider(backgroundDepthSlider, 'backgroundDepth', '%', false);

  fixedLayoutCheck.addEventListener('change', () => {
    variation.fixedLayout = fixedLayoutCheck.checked;
    applyVariation(false);
  });

  elementUnicolorCheck?.addEventListener('change', () => {
    variation.elementUnicolor = elementUnicolorCheck.checked;
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

  bindSlider(liquidFlowSpeedSlider, 'liquidFlowSpeed', '%', false);
  bindSlider(liquidThicknessSlider, 'liquidThickness', '%', false);
  bindSlider(liquidReliefSlider, 'liquidRelief', '%', false);
  bindSlider(liquidTurbulenceSlider, 'liquidTurbulence', '%', false);

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
    if (elementUnicolorCheck) elementUnicolorCheck.checked = !!variation.elementUnicolor;
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
    liquidFlowSpeedSlider.value = String(variation.liquidFlowSpeed);
    liquidThicknessSlider.value = String(variation.liquidThickness);
    liquidReliefSlider.value = String(variation.liquidRelief);
    liquidTurbulenceSlider.value = String(variation.liquidTurbulence);
    if (elementMotionSlider) elementMotionSlider.value = String(variation.elementMotion ?? 50);
    if (elementTurnSlider) elementTurnSlider.value = String(variation.elementTurn ?? 50);
    if (element3dMotionSlider) element3dMotionSlider.value = String(variation.element3dMotion ?? 50);
    if (surfaceWobbleSlider) surfaceWobbleSlider.value = String(variation.surfaceWobble ?? 0);
  if (backgroundDepthSlider) backgroundDepthSlider.value = String(variation.backgroundDepth ?? 50);
    colorModeSelect.value = variation.colorMode;
    renderShapeToggles();
    renderLiquidControls();
    renderGlobeControls();
    renderLivingSongControls();
    regenerateOnNextApply = true;
    resetPlayhead();
    applyVariation(true);
  });

  return {
    syncFromStores() {
      variation = loadVariation();
      syncVariationUI();
    },
    refreshLivingControls() {
      renderLivingSongControls();
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

function syncMuteButton() {
  if (!muteBtn) return;
  muteBtn.textContent = isMuted ? 'Unmute' : 'Mute';
  muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
  muteBtn.title = isMuted ? 'Unmute audio output' : 'Mute audio output';
  muteBtn.classList.toggle('muted', isMuted);
}

function applyMuteState() {
  if (gainNode) gainNode.gain.value = isMuted ? 0 : 1;
  syncMuteButton();
}

function toggleMute() {
  isMuted = !isMuted;
  applyMuteState();
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
    applyMuteState();
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

  if (playOffset <= 0) resetLiveBeatState();

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
    syncPlayheadSlider(0, clipDisplayDuration());
    updateTimeDisplay(0, clipDisplayDuration());
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

function downloadRemuxScript(baseName, withAudio) {
  const ts = `${baseName}-visualizer.ts`;
  const mp4 = `${baseName}-visualizer.mp4`;
  const audio = `${baseName}-visualizer-audio.m4a`;
  const lines = withAudio
    ? [
      '#!/bin/bash',
      '# Run in the folder where you saved the export files',
      `ffmpeg -f mpegts -i "${ts}" -c copy -movflags +faststart "${mp4}"`,
      `ffmpeg -i "${mp4}" -i "${audio}" -c copy "${baseName}-final.mp4"`,
      `echo "Done: ${baseName}-final.mp4"`,
    ]
    : [
      '#!/bin/bash',
      '# Run in the folder where you saved the export file',
      `ffmpeg -f mpegts -i "${ts}" -c copy -movflags +faststart "${mp4}"`,
      `echo "Done: ${mp4}"`,
    ];
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}-remux.sh`;
  a.click();
  URL.revokeObjectURL(url);
}

async function handleExport(preview = false) {
  if (!audioFile || !analysis) return;
  if (exportInProgress) {
    alert('An export is already running. Wait for it to finish or let it run in the background.');
    return;
  }

  const { startTime, endTime } = getClipRange();
  if (endTime - startTime < 0.2) {
    alert('Clip must be at least 0.2 seconds (check From / To).');
    return;
  }

  exportInProgress = true;
  exportBtn.disabled = true;
  previewExportBtn.disabled = true;
  showCreateProgress(true);
  setCreateProgress(0, preview ? 'Starting preview export…' : 'Starting export…');

  /** @type {FileSystemWritableFileStream|null} */
  let outputWritable = null;
  /** @type {FileSystemFileHandle|null} */
  let outputFileHandle = null;
  const includeAudio = exportAudioCheck?.checked === true;

  try {
    if (!preview && typeof window.showSaveFilePicker === 'function') {
      try {
        const base = audioFile.name.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, '');
        const handle = await window.showSaveFilePicker({
          suggestedName: `${base}-visualizer.ts`,
          types: [{
            description: 'Video (MPEG-TS stream)',
            accept: { 'video/mp2t': ['.ts'], 'video/mp4': ['.mp4'] },
          }],
        });
        outputFileHandle = handle;
        outputWritable = await handle.createWritable();
      } catch (pickErr) {
        if (pickErr?.name === 'AbortError') {
          setCreateProgress(0, 'Export cancelled');
          return;
        }
        alert(
          'Could not open save dialog. Use Chrome or Edge, click Export once, and choose where to save.\n\n'
          + `(${String(pickErr?.message ?? pickErr)})`,
        );
        setCreateProgress(0, 'Export cancelled');
        return;
      }
    } else if (!preview && !includeAudio) {
      alert(
        'Full export requires Chrome or Edge so you can pick a save location.\n'
        + 'The file is written directly to disk in segments (no large download in memory).',
      );
      setCreateProgress(0, 'Export cancelled');
      return;
    }

    const result = await exportToMp4({
      analysis,
      audioFile,
      audioBuffer: includeAudio ? audioBuffer : null,
      onProgress: (pct, label) => setCreateProgress(pct, label),
      startTime,
      endTime,
      preview,
      includeAudio,
      outputWritable,
      outputFileHandle,
      automationKeyframes: automation.exportData(),
    });

    if (result && typeof result === 'object' && result.streamed) {
      const mb = Math.round(result.byteLength / (1024 * 1024));
      if (result.audioSidecar) {
        const remux = result.needsRemux
          ? ' Video is MPEG-TS — convert: ffmpeg -i "your-file.ts" -c copy -movflags +faststart video.mp4'
          : '';
        setCreateProgress(
          100,
          `Video saved (${mb} MB). Audio downloaded as .m4a.${remux}`,
        );
        if (result.needsRemux) {
          downloadRemuxScript(audioFile.name.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, ''), true);
        }
      } else if (result.needsRemux) {
        setCreateProgress(100, `Video saved (${mb} MB, MPEG-TS). Remux script downloaded.`);
        downloadRemuxScript(audioFile.name.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, ''), false);
      } else {
        setCreateProgress(100, `Saved to file (${mb} MB)`);
      }
      return;
    }

    const mp4 = /** @type {Blob} */ (result);

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
    alert(`Export failed: ${String(err?.message ?? err ?? 'Unknown error')}\n\nTry a shorter clip, or use Chrome/Edge for best results.`);
    setCreateProgress(0, 'Export failed');
  } finally {
    exportInProgress = false;
    exportBtn.disabled = false;
    previewExportBtn.disabled = !audioBuffer;
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
  audioSourceUrl = null;
  playOffset = 0;
  setSongDuration(0);
  automation.clear();
  clearAutomationSample();
  syncAutomationControls();
  syncPlayheadSlider(0, 0);
  if (clearAudioLabel) fileNameEl.textContent = 'No audio loaded';
  playBtn.disabled = true;
  stopBtn.disabled = true;
  if (muteBtn) muteBtn.disabled = true;
  exportBtn.disabled = true;
  syncClipRangeInputs();
  setUploadProgress(0, '');
  showUploadProgress(false);
}

drawBackdrop(ctx);
drawFrame(ctx, silentFrame());
updateAnalysisDisplays();
syncAutomationControls();
