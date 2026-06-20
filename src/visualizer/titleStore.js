export const TITLE_STORAGE_KEY = 'visualizer-song-title';
export const TITLE_FREQ_STORAGE_KEY = 'visualizer-title-frequency';
export const DEFAULT_TITLE_FREQUENCY = 65;

export function loadSongTitle() {
  try {
    const raw = localStorage.getItem(TITLE_STORAGE_KEY);
    return typeof raw === 'string' ? raw : '';
  } catch {
    return '';
  }
}

/** @param {string} text */
export function saveSongTitle(text) {
  localStorage.setItem(TITLE_STORAGE_KEY, text.trim().slice(0, 80));
}

export function loadTitleFrequency() {
  try {
    const raw = localStorage.getItem(TITLE_FREQ_STORAGE_KEY);
    if (raw == null) return DEFAULT_TITLE_FREQUENCY;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.round(v))) : DEFAULT_TITLE_FREQUENCY;
  } catch {
    return DEFAULT_TITLE_FREQUENCY;
  }
}

/** @param {number} freq 0 = rare, 100 = very frequent */
export function saveTitleFrequency(freq) {
  localStorage.setItem(TITLE_FREQ_STORAGE_KEY, String(Math.min(100, Math.max(0, Math.round(freq)))));
}

/** @param {number} freq @returns {{ cycleSec: number, showSec: number, fadeSec: number }} */
export function titleTimingFromFrequency(freq) {
  const f = Math.min(100, Math.max(0, freq)) / 100;
  return {
    cycleSec: 48 - f * 36,
    showSec: 5 + f * 6,
    fadeSec: 0.65,
  };
}

/** @param {string} filename */
export function titleFromFilename(filename) {
  return filename
    .replace(/\.(mp3|wav|wave)$/i, '')
    .replace(/^\d+\s*[-._]\s*/, '')
    .trim()
    .slice(0, 80);
}
