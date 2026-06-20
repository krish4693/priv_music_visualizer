import { analyzeAudioBuffer, decodeAudioFile, liveFrameFromAnalyser, resetLiveBeatState } from './audio/analyzer.js';
import {
  drawFrame,
  drawBackdrop,
  resetRenderer,
  setVisualizerImage,
  setMappingMatrix,
  setViscosity,
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
import { saveAudio, loadAudio, saveImage, loadAllImages, deleteImage } from './storage/db.js';
import { extractPaletteFromFile, fileToImageSource, blobToFile } from './images/palette.js';

const ACTIVE_IMAGE_KEY = 'visualizer-active-image-id';

const fileInput = document.getElementById('file-input');
const dropzone = document.getElementById('dropzone');
const fileNameEl = document.getElementById('file-name');
const imageInput = document.getElementById('image-input');
const imageDropzone = document.getElementById('image-dropzone');
const imageCountEl = document.getElementById('image-count');
const imageGallery = document.getElementById('image-gallery');
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

const ctx = canvas.getContext('2d');

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

/** @type {{ id: string, name: string, img: HTMLImageElement, palette: object[], revoke: () => void }[]} */
let savedImages = [];
let activeImageId = null;

const ACCEPTED_EXTENSIONS = /\.(mp3|wav)$/i;
const ACCEPTED_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/wave',
  'audio/x-wav',
]);

const IMAGE_TYPES = /^image\//;

function isAcceptedAudioFile(file) {
  if (!file) return false;
  if (ACCEPTED_EXTENSIONS.test(file.name)) return true;
  return ACCEPTED_MIME_TYPES.has(file.type);
}

function isImageFile(file) {
  return file && (IMAGE_TYPES.test(file.type) || /\.(png|jpe?g|webp|gif)$/i.test(file.name));
}

function silentFrame() {
  return { rms: 0, bass: 0, mid: 0, high: 0, bars: new Float32Array(48), beat: false, beatPulse: 0, tempo: 0.5, pitch: 0.5 };
}

setupDropzone();
setupImageDropzone();
fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
imageInput.addEventListener('change', () => handleImages([...imageInput.files]));
playBtn.addEventListener('click', togglePlay);
stopBtn.addEventListener('click', stopPlayback);
exportBtn.addEventListener('click', handleExport);

setupMappingPanel();
setMappingMatrix(loadMappingMatrix());
setViscosity(loadViscosity());
viscositySlider.value = String(Math.round(loadViscosity() * 100));
viscosityVal.textContent = `${viscositySlider.value}%`;

initFromStorage();

async function initFromStorage() {
  try {
    activeImageId = localStorage.getItem(ACTIVE_IMAGE_KEY);
    const storedImages = await loadAllImages();
    for (const rec of storedImages.sort((a, b) => a.savedAt - b.savedAt)) {
      const file = blobToFile(rec.blob, rec.name, rec.type);
      await addImageRecord(rec.id, file, rec.palette, false);
    }
    syncActiveImage();
    renderImageGallery();
    updateImageCount();

    const storedAudio = await loadAudio();
    if (storedAudio) {
      fileNameEl.textContent = `${storedAudio.name} (saved)`;
      await processAudioFile(storedAudio, false);
    }
  } catch (err) {
    console.warn('Could not restore saved files', err);
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

function setupImageDropzone() {
  imageDropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    imageDropzone.classList.add('dragover');
  });
  imageDropzone.addEventListener('dragleave', () => imageDropzone.classList.remove('dragover'));
  imageDropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    imageDropzone.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(isImageFile);
    if (files.length) handleImages(files);
  });
}

async function handleFile(file) {
  if (!isAcceptedAudioFile(file)) {
    alert('Please select an MP3 or WAV file.');
    return;
  }
  await processAudioFile(file, true);
}

async function processAudioFile(file, persist) {
  stopPlayback();
  resetState(false);
  setUploadProgress(0, 'Starting…');
  showUploadProgress(true);
  dropzone.classList.add('loading');

  try {
    audioFile = file;
    fileNameEl.textContent = persist ? file.name : `${file.name} (saved)`;

    const onUploadProgress = (pct, label) => setUploadProgress(pct, label);

    if (persist) await saveAudio(file);

    audioBuffer = await decodeAudioFile(file, onUploadProgress);
    analysis = await analyzeAudioBuffer(audioBuffer, onUploadProgress);

    resetRenderer(canvas.width, canvas.height);
    syncActiveImage();
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

async function handleImages(files) {
  const images = files.filter(isImageFile);
  if (!images.length) {
    alert('Please select image files (PNG, JPG, WebP, GIF).');
    return;
  }

  imageDropzone.classList.add('loading');
  let lastId = null;
  try {
    for (const file of images) {
      const palette = await extractPaletteFromFile(file);
      const record = await saveImage(file, palette);
      await addImageRecord(record.id, file, palette, true);
      lastId = record.id;
    }
    if (!activeImageId || !savedImages.some((x) => x.id === activeImageId)) {
      setActiveImage(lastId ?? savedImages[0]?.id);
    } else {
      syncActiveImage();
      renderImageGallery();
      refreshCanvas();
    }
    updateImageCount();
  } catch (err) {
    console.error(err);
    alert(`Could not process images: ${err.message}`);
  } finally {
    imageDropzone.classList.remove('loading');
    imageInput.value = '';
  }
}

async function addImageRecord(id, file, palette, isNew) {
  const { img, revoke } = await fileToImageSource(file);
  if (isNew) {
    savedImages.push({ id, name: file.name, img, palette, revoke });
  } else {
    const existing = savedImages.find((x) => x.id === id);
    existing?.revoke?.();
    savedImages = savedImages.filter((x) => x.id !== id);
    savedImages.push({ id, name: file.name, img, palette, revoke });
  }
}

function setActiveImage(id) {
  if (!savedImages.some((x) => x.id === id)) return;
  activeImageId = id;
  localStorage.setItem(ACTIVE_IMAGE_KEY, id);
  syncActiveImage();
  renderImageGallery();
  refreshCanvas();
}

function syncActiveImage() {
  const item = savedImages.find((x) => x.id === activeImageId) ?? savedImages[0];
  if (item) {
    activeImageId = item.id;
    localStorage.setItem(ACTIVE_IMAGE_KEY, item.id);
    setVisualizerImage(item.img);
  } else {
    setVisualizerImage(null);
  }
}

async function removeImage(id) {
  const item = savedImages.find((x) => x.id === id);
  if (!item) return;
  item.revoke?.();
  savedImages = savedImages.filter((x) => x.id !== id);
  await deleteImage(id);
  if (activeImageId === id) {
    activeImageId = savedImages[0]?.id ?? null;
    if (activeImageId) localStorage.setItem(ACTIVE_IMAGE_KEY, activeImageId);
    else localStorage.removeItem(ACTIVE_IMAGE_KEY);
  }
  syncActiveImage();
  renderImageGallery();
  updateImageCount();
  refreshCanvas();
}

function refreshCanvas() {
  if (audioBuffer && !isPlaying) drawIdleFrame();
  else if (!audioBuffer) {
    drawBackdrop(ctx);
    drawFrame(ctx, silentFrame());
  }
}

function setupMappingPanel() {
  let mappings = loadMappingMatrix();
  let viscosity = loadViscosity();

  function applyMappings() {
    saveMappingMatrix(mappings);
    setMappingMatrix(mappings);
    if (audioBuffer && !isPlaying) drawIdleFrame();
  }

  function applyViscosity() {
    saveViscosity(viscosity);
    setViscosity(viscosity);
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

function renderImageGallery() {
  imageGallery.innerHTML = savedImages
    .map((item) => {
      const active = item.id === activeImageId;
      return `
    <button type="button" class="gallery-item${active ? ' gallery-active' : ''}" data-select="${item.id}" title="${item.name}${active ? ' — active' : ''}">
      <img src="${item.img.src}" alt="${item.name}" />
      <span class="gallery-remove" data-remove="${item.id}" role="button" aria-label="Remove">✕</span>
    </button>`;
    })
    .join('');

  imageGallery.querySelectorAll('[data-select]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('[data-remove]')) return;
      setActiveImage(btn.dataset.select);
    });
  });

  imageGallery.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeImage(btn.dataset.remove);
    });
  });
}

function updateImageCount() {
  const n = savedImages.length;
  imageCountEl.textContent = n
    ? `${n} image${n > 1 ? 's' : ''} — click a thumbnail to pick the visual`
    : 'No images yet';
}

function drawIdleFrame() {
  if (analysis?.frames?.[0]) {
    drawFrame(ctx, analysis.frames[0]);
  } else {
    drawBackdrop(ctx);
    drawFrame(ctx, silentFrame());
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
    resetRenderer(canvas.width, canvas.height);
    syncActiveImage();
    drawBackdrop(ctx);
    drawIdleFrame();
  }
}

function startPreviewLoop() {
  function loop() {
    if (!isPlaying) return;

    const frame = liveFrameFromAnalyser(analyserNode, 128);
    drawFrame(ctx, frame);

    const elapsed = playOffset + (audioContext.currentTime - playStartTime);
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
  if (clearAudioLabel) fileNameEl.textContent = 'No audio saved';
  playBtn.disabled = true;
  stopBtn.disabled = true;
  exportBtn.disabled = true;
  setUploadProgress(0, '');
  showUploadProgress(false);
}

drawBackdrop(ctx);
drawFrame(ctx, silentFrame());
