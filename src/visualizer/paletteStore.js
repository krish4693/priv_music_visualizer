import { POP_ART_COLORS } from './popArtPalette.js';

const PALETTE_KEY = 'visualizer-custom-colors';
const SELECTION_KEY = 'visualizer-palette-selection';

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
    if (!raw) return new Set(full.map((_, i) => i));
    const keys = JSON.parse(raw);
    if (!Array.isArray(keys)) return new Set(full.map((_, i) => i));
    const indices = new Set();
    full.forEach((c, i) => {
      if (keys.includes(colorKey(c))) indices.add(i);
    });
    return indices.size ? indices : new Set(full.map((_, i) => i));
  } catch {
    return new Set(full.map((_, i) => i));
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

export { colorKey };
