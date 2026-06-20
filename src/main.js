import { analyzeAudioBuffer, decodeAudioFile, liveFrameFromAnalyser, resetLiveBeatState } from './audio/analyzer.js';
import {
  drawFrame,
  drawBackdrop,
  resetRenderer,
  resetPlayhead,
  setMappingMatrix,
  setViscosity,
  setVisualizerPalette,
  setVariationSettings,
  regenerateVariation,
  setBackgroundColor,
  setSongTitle,
  setTitleFrequency,
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
} from './visualizer/paletteStore.js';
import {
  SHAPE_OPTIONS,
  COLOR_MODES,
  DEFAULT_VARIATION,
  loadVariation,
  saveVariation,
  cloneVariation,
  randomizeVariationSeed,
} from './visualizer/variationStore.js';
import { loadBackgroundColor, saveBackgroundColor } from './visualizer/backgroundStore.js';
import { loadSongTitle, saveSongTitle, titleFromFilename, loadTitleFrequency, saveTitleFrequency } from './visualizer/titleStore.js';

const BUNDLED_AUDIO_URL = '/samples/aboud-vs-flab.wav';
const BUNDLED_AUDIO_NAME = '02 AboudVsFlab.wav';

const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');
const fileNameEl = document.getElementById('file-name');
const songTitleInput = document.getElementById('song-title-input');
const titleFrequencySlider = document.getElementById('title-frequency-slider');
const titleFrequencyVal = document.getElementById('title-frequency-val');
const canvas = document.getElementById('visualizer');
const playBtn = document.getElementById('play-btn');
const stopBtn = document.getElementById('stop-btn');
const timeDisplay = document.getElementById('time-display');
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
const viscositySlider = document.getElementById('viscosity-slider');
const viscosityVal = document.getElementById('viscosity-val');
const paletteSwatches = document.getElementById('palette-swatches');
const colorPicker = document.getElementById('color-picker');
const addColorBtn = document.getElementById('add-color-btn');
const bgColorPicker = document.getElementById('bg-color-picker');
const variationSeedInput = document.getElementById('variation-seed');
const variationNewBtn = document.getElementById('variation-new-btn');
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
const layoutSpreadSlider = document.getElementById('layout-spread-slider');
const layoutSpreadVal = document.getElementById('layout-spread-val');
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
exportBtn.addEventListener('click', handleExport);

setupMappingPanel();
setupPaletteControls();
setupBackgroundControl();
setupSongTitleControl();
setupVariationPanel();
applyActivePalette();
setBackgroundColor(loadBackgroundColor());
setSongTitle(loadSongTitle());
setTitleFrequency(loadTitleFrequency());
songTitleInput.value = loadSongTitle();
titleFrequencySlider.value = String(loadTitleFrequency());
titleFrequencyVal.textContent = `${loadTitleFrequency()}%`;
setMappingMatrix(loadMappingMatrix());
setViscosity(loadViscosity());
setVariationSettings(loadVariation());
viscositySlider.value = String(Math.round(loadViscosity() * 100));
viscosityVal.textContent = `${viscositySlider.value}%`;

initFromStorage();

async function initFromStorage() {
  try {
    const storedAudio = await loadAudio();
    if (storedAudio) {
      fileNameEl.textContent = `${storedAudio.name} (saved)`;
      await processAudioFile(storedAudio, false);
    } else {
      await loadBundledAudio();
    }
  } catch (err) {
    console.warn('Could not restore saved files', err);
  }
}

async function fetchAsFile(url, name, type) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const blob = await res.blob();
  return new File([blob], name, { type: blob.type || type });
}

async function loadBundledAudio() {
  try {
    const file = await fetchAsFile(BUNDLED_AUDIO_URL, BUNDLED_AUDIO_NAME, 'audio/wav');
    await processAudioFile(file, false, `${file.name} (bundled sample)`);
  } catch (err) {
    console.warn('Bundled sample audio not available', err);
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

async function processAudioFile(file, persist, displayName) {
  stopPlayback();
  resetState(false);
  setUploadProgress(0, 'Starting…');
  showUploadProgress(true);
  dropzone.classList.add('loading');

  try {
    audioFile = file;
    fileNameEl.textContent = displayName ?? (persist ? file.name : `${file.name} (saved)`);

    if (!songTitleInput.value.trim()) {
      const suggested = titleFromFilename(file.name);
      if (suggested) {
        songTitleInput.value = suggested;
        saveSongTitle(suggested);
        setSongTitle(suggested);
      }
    }

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
    updateTimeDisplay(0, audioBuffer.duration);
    drawIdleFrame();
    setUploadProgress(100, 'Ready to play');
  } catch (err) {
    console.error(err);
    alert(`Could not process this file: ${err.message}\n\nWAV files are often large — try an MP3, or a shorter clip.`);
    resetState(true);
  } finally {
    dropzone.classList.remove('loading');
    setTimeout(() => showUploadProgress(false), 1200);
  }
}

function refreshPreview() {
  if (!audioBuffer || isPlaying) return;
  drawBackdrop(ctx);
  drawIdleFrame();
}

function setupMappingPanel() {
  let mappings = loadMappingMatrix();
  let viscosity = loadViscosity();

  function applyMappings() {
    saveMappingMatrix(mappings);
    setMappingMatrix(mappings);
    refreshPreview();
  }

  function applyViscosity() {
    saveViscosity(viscosity);
    setViscosity(viscosity);
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
    }
  });
}

function setupSongTitleControl() {
  songTitleInput.addEventListener('input', () => {
    saveSongTitle(songTitleInput.value);
    setSongTitle(songTitleInput.value);
    refreshPreview();
  });

  titleFrequencySlider.addEventListener('input', () => {
    const val = Number(titleFrequencySlider.value);
    titleFrequencyVal.textContent = `${val}%`;
    saveTitleFrequency(val);
    setTitleFrequency(val);
    refreshPreview();
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
    slider.addEventListener('input', () => {
      variation[key] = Number(slider.value);
      const valEl = document.getElementById(`${slider.id.replace('-slider', '-val')}`);
      if (valEl) valEl.textContent = suffix === '' ? String(variation[key]) : `${variation[key]}${suffix}`;
      applyVariation(needsRegenerate);
    });
  }

  variationSeedInput.value = String(variation.seed);
  colorShiftSlider.value = String(variation.colorShift);
  shapeCountSlider.value = String(variation.shapeCount);
  sizeSpreadSlider.value = String(variation.sizeSpread);
  spinIntensitySlider.value = String(variation.spinIntensity);
  layoutSpreadSlider.value = String(variation.layoutSpread);
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
  syncSliderLabels();

  variationSeedInput.addEventListener('change', () => {
    const v = Math.max(1, Math.min(99999, Math.floor(Number(variationSeedInput.value) || variation.seed)));
    variation.seed = v;
    variationSeedInput.value = String(v);
    regenerateOnNextApply = true;
    applyVariation(true);
  });

  variationNewBtn.addEventListener('click', () => {
    variation = randomizeVariationSeed(variation);
    variationSeedInput.value = String(variation.seed);
    regenerateOnNextApply = true;
    applyVariation(true);
  });

  colorModeSelect.addEventListener('change', () => {
    variation.colorMode = colorModeSelect.value;
    applyVariation(false);
    syncSliderLabels();
  });

  bindSlider(colorShiftSlider, 'colorShift', '%', false);
  bindSlider(shapeCountSlider, 'shapeCount', '', true);
  bindSlider(sizeSpreadSlider, 'sizeSpread', '%', true);
  bindSlider(spinIntensitySlider, 'spinIntensity', '%', false);
  bindSlider(layoutSpreadSlider, 'layoutSpread', '%', true);
  bindSlider(depthRangeSlider, 'depthRange', '%', true);
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
    variationSeedInput.value = String(variation.seed);
    colorShiftSlider.value = String(variation.colorShift);
    shapeCountSlider.value = String(variation.shapeCount);
    sizeSpreadSlider.value = String(variation.sizeSpread);
    spinIntensitySlider.value = String(variation.spinIntensity);
    layoutSpreadSlider.value = String(variation.layoutSpread);
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
    applyVariation(true);
  });
}

function drawIdleFrame() {
  if (analysis?.frames?.length) {
    const idx = Math.min(analysis.frames.length - 1, Math.floor((performance.now() / 1000) % 8) * 30);
    const frame = analysis.frames[idx];
    drawFrame(ctx, { ...frame, time: performance.now() / 1000 });
  } else {
    drawBackdrop(ctx);
    drawFrame(ctx, { ...silentFrame(), time: performance.now() / 1000 });
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
    updateTimeDisplay(0, audioBuffer.duration);
    resetPlayhead();
    refreshPreview();
  }
}

function startPreviewLoop() {
  function loop() {
    if (!isPlaying) return;

    const elapsed = playOffset + (audioContext.currentTime - playStartTime);
    const frame = liveFrameFromAnalyser(analyserNode, 128);
    frame.time = elapsed;
    drawFrame(ctx, frame);

    updateTimeDisplay(elapsed, audioBuffer.duration);
    previewRAF = requestAnimationFrame(loop);
  }

  previewRAF = requestAnimationFrame(loop);
}

function updateTimeDisplay(current, total) {
  timeDisplay.textContent = `${formatTime(current)} / ${formatTime(total)}`;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

async function handleExport() {
  if (!audioFile || !analysis) return;

  stopPlayback();
  exportBtn.disabled = true;
  playBtn.disabled = true;
  showCreateProgress(true);
  setCreateProgress(0, 'Starting video creation…');

  try {
    const mp4 = await exportToMp4({
      analysis,
      audioFile,
      title: audioFile.name,
      onProgress: (pct, label) => setCreateProgress(pct, label),
    });

    const url = URL.createObjectURL(mp4);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${audioFile.name.replace(/\.(mp3|wav)$/i, '')}-visualizer.mp4`;
    a.click();
    URL.revokeObjectURL(url);
    setCreateProgress(100, 'Download started');
  } catch (err) {
    console.error(err);
    alert(`Export failed: ${err.message}\n\nTry a shorter track, or use Chrome/Edge for best results.`);
    setCreateProgress(0, 'Export failed');
  } finally {
    exportBtn.disabled = false;
    playBtn.disabled = false;
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
  if (clearAudioLabel) fileNameEl.textContent = 'No audio loaded';
  playBtn.disabled = true;
  stopBtn.disabled = true;
  exportBtn.disabled = true;
  setUploadProgress(0, '');
  showUploadProgress(false);
}

drawBackdrop(ctx);
drawFrame(ctx, silentFrame());
