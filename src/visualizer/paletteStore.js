import { POP_ART_COLORS } from './popArtPalette.js';

const PALETTE_KEY = 'visualizer-custom-colors';
const SELECTION_KEY = 'visualizer-palette-selection';

export const DEFAULT_PALETTE_COLOR_COUNT = 6;

export function defaultSelectedIndices(full) {
  const count = Math.min(DEFAULT_PALETTE_COLOR_COUNT, full.length);
  return new Set(Array.from({ length: count }, (_, i) => i));
}

function colorKey(c) {
  return `${c.r},${c.g},${c.b}`;
}

function parseHex(hex) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{6})$/i);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, name: 'Custom' };
}

/** @returns {{ r: number, g: number, b: number, name?: string }[]} */
export function loadFullPalette() {
  const base = POP_ART_COLORS.map((c) => ({ ...c }));
  try {
    const raw = localStorage.getItem(PALETTE_KEY);
    if (!raw) return base;
    const custom = JSON.parse(raw);
    if (!Array.isArray(custom)) return base;
    const extras = custom.filter((c) => c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b));
    return [...base, ...extras];
  } catch {
    return base;
  }
}

/** @param {{ r: number, g: number, b: number, name?: string }[]} customOnly */
export function saveCustomColors(customOnly) {
  localStorage.setItem(PALETTE_KEY, JSON.stringify(customOnly));
}

/** @param {{ r: number, g: number, b: number }[]} full */
export function loadSelectedIndices(full) {
  try {
    const raw = localStorage.getItem(SELECTION_KEY);
    if (!raw) return defaultSelectedIndices(full);
    const keys = JSON.parse(raw);
    if (!Array.isArray(keys)) return defaultSelectedIndices(full);
    const indices = new Set();
    full.forEach((c, i) => {
      if (keys.includes(colorKey(c))) indices.add(i);
    });
    return indices.size ? indices : defaultSelectedIndices(full);
  } catch {
    return defaultSelectedIndices(full);
  }
}

/** @param {{ r: number, g: number, b: number }[]} full @param {Set<number>} selected */
export function saveSelectedIndices(full, selected) {
  const keys = [...selected].map((i) => colorKey(full[i])).filter(Boolean);
  localStorage.setItem(SELECTION_KEY, JSON.stringify(keys));
}

/** @param {{ r: number, g: number, b: number }[]} full @param {Set<number>} selected */
export function getActivePalette(full, selected) {
  const active = [...selected].sort((a, b) => a - b).map((i) => full[i]).filter(Boolean);
  return active.length ? active : [...POP_ART_COLORS];
}

export function hexToRgb(hex) {
  return parseHex(hex);
}

/** Snapshot palette for preset export. */
export function collectPalettePreset() {
  const full = loadFullPalette();
  const selected = loadSelectedIndices(full);
  const baseKeys = new Set(POP_ART_COLORS.map(colorKey));
  const customColors = full.filter((c) => !baseKeys.has(colorKey(c)));
  const selectedKeys = [...selected].map((i) => colorKey(full[i])).filter(Boolean);
  return { customColors, selectedKeys };
}

/**
 * Restore palette from preset data.
 * @returns {{ fullPalette: ReturnType<typeof loadFullPalette>, selectedPaletteIndices: Set<number> }}
 */
export function applyPalettePreset(raw) {
  const base = POP_ART_COLORS.map((c) => ({ ...c }));
  const customColors = Array.isArray(raw?.customColors)
    ? raw.customColors.filter((c) => c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b))
    : [];
  const fullPalette = [...base, ...customColors.map((c) => ({ ...c }))];

  let selectedPaletteIndices = new Set(fullPalette.map((_, i) => i));
  if (Array.isArray(raw?.selectedKeys) && raw.selectedKeys.length) {
    const next = new Set();
    fullPalette.forEach((c, i) => {
      if (raw.selectedKeys.includes(colorKey(c))) next.add(i);
    });
    if (next.size) selectedPaletteIndices = next;
  }

  saveCustomColors(customColors);
  saveSelectedIndices(fullPalette, selectedPaletteIndices);
  return { fullPalette, selectedPaletteIndices };
}

export { colorKey };
