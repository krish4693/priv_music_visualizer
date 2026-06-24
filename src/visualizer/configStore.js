import { cloneVariation } from './variationStore.js';
import { cloneMappings, DEFAULT_MAPPINGS, DEFAULT_VISCOSITY } from './mappingMatrix.js';
import { DEFAULT_BG } from './backgroundStore.js';
import { DEFAULT_TITLE_FREQUENCY } from './titleStore.js';
import { normalizeCinematicSettings } from './cinematicSettingsStore.js';
import { parseAutomationDocument } from './automationStore.js';
import { deserializeAnalysis } from '../audio/analyzer.js';

export const CONFIG_VERSION = 3;
const CONFIG_EXT = '.mviz.json';

function clamp01(v, fallback) {
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function normalizeLook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const variation = cloneVariation(raw.variation ?? {});
  const mappings = cloneMappings({ ...DEFAULT_MAPPINGS, ...raw.mappings });
  for (const key of Object.keys(DEFAULT_MAPPINGS)) {
    if (raw.mappings?.[key]) {
      mappings[key] = { ...DEFAULT_MAPPINGS[key], ...raw.mappings[key] };
    }
  }
  const viscosity = clamp01(Number(raw.viscosity), DEFAULT_VISCOSITY);
  const bgColor = typeof raw.bgColor === 'string' ? raw.bgColor : DEFAULT_BG;
  const title = typeof raw.title === 'string' ? raw.title.slice(0, 80) : '';
  const titleFrequency = Number.isFinite(raw.titleFrequency)
    ? Math.min(100, Math.max(0, Math.round(raw.titleFrequency)))
    : DEFAULT_TITLE_FREQUENCY;
  const palette = raw.palette && typeof raw.palette === 'object'
    ? {
        customColors: Array.isArray(raw.palette.customColors) ? raw.palette.customColors : [],
        selectedKeys: Array.isArray(raw.palette.selectedKeys) ? raw.palette.selectedKeys : [],
      }
    : { customColors: [], selectedKeys: [] };
  const cinematic = raw.cinematic && typeof raw.cinematic === 'object'
    ? normalizeCinematicSettings(raw.cinematic)
    : null;
  return { variation, mappings, viscosity, bgColor, title, titleFrequency, palette, cinematic };
}

function normalizeAutomation(raw) {
  if (!raw?.keyframes || !Array.isArray(raw.keyframes) || !raw.keyframes.length) return null;
  return { keyframes: raw.keyframes };
}

/** @param {object} [raw] */
function normalizeExportSettings(raw) {
  if (!raw || typeof raw !== 'object') {
    return { clipFrom: 0, clipTo: null, includeAudio: true };
  }
  const clipFrom = Number.isFinite(Number(raw.clipFrom)) ? Math.max(0, Number(raw.clipFrom)) : 0;
  const clipTo = raw.clipTo == null || raw.clipTo === ''
    ? null
    : (Number.isFinite(Number(raw.clipTo)) ? Math.max(0, Number(raw.clipTo)) : null);
  return {
    clipFrom,
    clipTo,
    includeAudio: raw.includeAudio !== false,
  };
}

/** @param {object} [raw] */
function normalizeAudioRef(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const fileName = typeof raw.fileName === 'string' ? raw.fileName : '';
  const fingerprint = typeof raw.fingerprint === 'string' ? raw.fingerprint : null;
  const url = typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : null;
  const duration = Number.isFinite(Number(raw.duration)) ? Number(raw.duration) : null;
  const displayName = typeof raw.displayName === 'string' ? raw.displayName : fileName;
  let analysis = null;
  if (raw.analysis && typeof raw.analysis === 'object') {
    analysis = deserializeAnalysis(raw.analysis);
  }
  if (!fileName && !url && !fingerprint && !analysis) return null;
  return { fileName, fingerprint, url, duration, displayName, analysis };
}

/**
 * @param {{
 *   rendererMode: string,
 *   look: object,
 *   automationKeyframes?: import('./automationStore.js').AutomationKeyframe[]|null,
 *   audio?: object|null,
 *   export?: object|null,
 * }} input
 */
export function buildAppConfig(input) {
  return {
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    renderer: input.rendererMode === 'cinematic' ? 'cinematic' : 'popart',
    look: input.look,
    export: normalizeExportSettings(input.export),
    audio: input.audio ?? null,
    automation: input.automationKeyframes?.length
      ? { keyframes: input.automationKeyframes }
      : null,
  };
}

/** @param {string} [songName] */
export function suggestConfigFilename(songName) {
  const base = (songName || 'visualizer')
    .replace(/\.(mp3|wav|m4a|flac|aac|ogg|mviz\.json)$/i, '')
    .replace(/[^\w\s\-().äöüÄÖÜß]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 50) || 'visualizer';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  return `${base}_${stamp}${CONFIG_EXT}`;
}

/** @param {ReturnType<typeof buildAppConfig>} config @param {string} filename */
export function downloadAppConfig(config, filename) {
  const name = filename.endsWith(CONFIG_EXT) ? filename : `${filename}${CONFIG_EXT}`;
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** @param {string} text */
export function parseAppConfig(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;

    const look = normalizeLook(parsed.look ?? (parsed.variation ? parsed : null));
    const renderer = parsed.renderer === 'cinematic' ? 'cinematic' : 'popart';
    let automation = normalizeAutomation(parsed.automation);

    if (!automation && Array.isArray(parsed.keyframes)) {
      const keyframes = parseAutomationDocument(trimmed);
      if (keyframes?.length) automation = { keyframes };
    }

    const exportSettings = normalizeExportSettings(parsed.export);
    const audio = normalizeAudioRef(parsed.audio);

    if (!look && !automation && !audio) return null;

    return {
      version: parsed.version ?? CONFIG_VERSION,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : null,
      renderer,
      look,
      export: exportSettings,
      audio,
      automation,
      legacyTake: !look && !!automation,
    };
  } catch {
    return null;
  }
}

export { CONFIG_EXT };
