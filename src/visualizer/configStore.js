import { cloneVariation } from './variationStore.js';
import { cloneMappings, DEFAULT_MAPPINGS, DEFAULT_VISCOSITY } from './mappingMatrix.js';
import { DEFAULT_BG } from './backgroundStore.js';
import { DEFAULT_TITLE_FREQUENCY } from './titleStore.js';
import { normalizeCinematicSettings } from './cinematicSettingsStore.js';
import { parseAutomationDocument } from './automationStore.js';

const CONFIG_VERSION = 2;
const CONFIG_EXT = '.mviz.json';

function normalizeLook(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const variation = cloneVariation(raw.variation ?? {});
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
  const cinematic = raw.cinematic && typeof raw.cinematic === 'object'
    ? normalizeCinematicSettings(raw.cinematic)
    : null;
  return { variation, mappings, viscosity, bgColor, title, titleFrequency, palette, cinematic };
}

function normalizeAutomation(raw) {
  if (!raw?.keyframes || !Array.isArray(raw.keyframes) || !raw.keyframes.length) return null;
  return { keyframes: raw.keyframes };
}

/** @param {{ rendererMode: string, look: object, automationKeyframes?: import('./automationStore.js').AutomationKeyframe[]|null, songName?: string }} input */
export function buildAppConfig(input) {
  return {
    version: CONFIG_VERSION,
    savedAt: new Date().toISOString(),
    renderer: input.rendererMode === 'cinematic' ? 'cinematic' : 'popart',
    look: input.look,
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

    if (!look && !automation) return null;

    return {
      version: parsed.version ?? CONFIG_VERSION,
      renderer,
      look,
      automation,
      legacyTake: !look && !!automation,
    };
  } catch {
    return null;
  }
}

export { CONFIG_EXT };
