import { cloneVariation, loadVariation } from './variationStore.js';
import { cloneMappings, DEFAULT_MAPPINGS, loadMappingMatrix, loadViscosity, DEFAULT_VISCOSITY } from './mappingMatrix.js';
import { loadBackgroundColor, DEFAULT_BG } from './backgroundStore.js';
import { loadSongTitle, loadTitleFrequency, DEFAULT_TITLE_FREQUENCY } from './titleStore.js';
import { collectPalettePreset } from './paletteStore.js';

const PRESET_VERSION = 1;

/** Collect all saveable look settings (not audio). */
export function collectAppPreset() {
  return {
    version: PRESET_VERSION,
    variation: loadVariation(),
    mappings: loadMappingMatrix(),
    viscosity: loadViscosity(),
    bgColor: loadBackgroundColor(),
    title: loadSongTitle(),
    titleFrequency: loadTitleFrequency(),
    palette: collectPalettePreset(),
  };
}

function normalizePreset(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const variation = cloneVariation({ ...loadVariation(), ...raw.variation });
  const mappings = cloneMappings({ ...DEFAULT_MAPPINGS, ...raw.mappings });
  for (const key of Object.keys(DEFAULT_MAPPINGS)) {
    if (raw.mappings?.[key]) {
      mappings[key] = { ...DEFAULT_MAPPINGS[key], ...raw.mappings[key] };
    }
  }
  const viscosity = Number.isFinite(raw.viscosity)
    ? Math.min(1, Math.max(0, raw.viscosity))
    : DEFAULT_VISCOSITY;
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
  return { version: PRESET_VERSION, variation, mappings, viscosity, bgColor, title, titleFrequency, palette };
}

/** @returns {string} Base64 preset code */
export function encodePreset(preset) {
  const json = JSON.stringify(preset);
  return btoa(unescape(encodeURIComponent(json)));
}

/** @returns {ReturnType<typeof normalizePreset>|null} */
export function decodePreset(code) {
  try {
    const trimmed = (code || '').trim();
    if (!trimmed) return null;
    const json = decodeURIComponent(escape(atob(trimmed)));
    const parsed = JSON.parse(json);
    return normalizePreset(parsed);
  } catch {
    return null;
  }
}

/**
 * Parse pasted share code: full preset (base64) or plain seed number.
 * @returns {{ kind: 'full', preset: ReturnType<typeof normalizePreset> } | { kind: 'seed', seed: number } | { kind: 'invalid' }}
 */
export function parsePresetInput(code) {
  const trimmed = (code || '').trim();
  if (!trimmed) return { kind: 'invalid' };

  const preset = decodePreset(trimmed);
  if (preset) return { kind: 'full', preset };

  if (/^\d{1,5}$/.test(trimmed)) {
    const seed = Math.max(1, Math.min(99999, parseInt(trimmed, 10)));
    return { kind: 'seed', seed };
  }

  return { kind: 'invalid' };
}
