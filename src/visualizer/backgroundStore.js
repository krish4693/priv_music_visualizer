export const BG_STORAGE_KEY = 'visualizer-bg-color';
export const DEFAULT_BG = '#1c1c1e';

function normalizeHex(value) {
  if (typeof value !== 'string') return DEFAULT_BG;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const r = v[1];
    const g = v[2];
    const b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return DEFAULT_BG;
}

export function loadBackgroundColor() {
  try {
    const raw = localStorage.getItem(BG_STORAGE_KEY);
    return raw ? normalizeHex(raw) : DEFAULT_BG;
  } catch {
    return DEFAULT_BG;
  }
}

/** @param {string} hex */
export function saveBackgroundColor(hex) {
  localStorage.setItem(BG_STORAGE_KEY, normalizeHex(hex));
}
