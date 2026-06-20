export const RENDERER_MODE_KEY = 'visualizer-renderer-mode';

/** @typedef {'popart'|'cinematic'} RendererMode */

export const RENDERER_MODES = [
  { id: 'popart', label: 'Pop Art (Classic)' },
  { id: 'cinematic', label: 'Cinematic (WebGL)' },
];

/** @returns {RendererMode} */
export function loadRendererMode() {
  try {
    const raw = localStorage.getItem(RENDERER_MODE_KEY);
    if (raw === 'cinematic' || raw === 'popart') return raw;
  } catch {
    /* ignore */
  }
  return 'cinematic';
}

/** @param {RendererMode} mode */
export function saveRendererMode(mode) {
  localStorage.setItem(RENDERER_MODE_KEY, mode);
}
