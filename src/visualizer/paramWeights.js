export const PARAM_STORAGE_KEY = 'visualizer-param-weights';

/** @typedef {Record<string, number>} ParamWeights */

export const PARAM_DEFS = [
  { id: 'frequencyBands', label: 'Frequency bands', hint: 'Log-spaced spectrum → stroke intensity' },
  { id: 'pitch', label: 'Pitch', hint: 'Spectral peak → sky wash & color drift' },
  { id: 'tempo', label: 'Tempo', hint: 'Estimated BPM → motion speed' },
  { id: 'rhythm', label: 'Rhythm / beat', hint: 'Onset pulse → accent flashes' },
  { id: 'bass', label: 'Bass', hint: 'Low band energy → lower city zone' },
  { id: 'mid', label: 'Mid', hint: 'Mid band energy → middle zone' },
  { id: 'high', label: 'High', hint: 'High band energy → upper skyline' },
  { id: 'loudness', label: 'Loudness (RMS)', hint: 'Overall level → brightness & wet street' },
  { id: 'spread', label: 'Spectral spread', hint: 'Timbre width → horizontal drift' },
  { id: 'texture', label: 'Texture', hint: 'Spectral roughness → splatter & chip detail' },
];

/** @type {ParamWeights} */
export const DEFAULT_PARAM_WEIGHTS = {
  frequencyBands: 1,
  pitch: 1,
  tempo: 1,
  rhythm: 0.65,
  bass: 0.85,
  mid: 0.85,
  high: 0.85,
  loudness: 0.75,
  spread: 0.6,
  texture: 0.7,
};

/** @returns {ParamWeights} */
export function loadParamWeights() {
  try {
    const raw = localStorage.getItem(PARAM_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PARAM_WEIGHTS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_PARAM_WEIGHTS };
    return { ...DEFAULT_PARAM_WEIGHTS, ...parsed };
  } catch {
    return { ...DEFAULT_PARAM_WEIGHTS };
  }
}

/** @param {ParamWeights} weights */
export function saveParamWeights(weights) {
  localStorage.setItem(PARAM_STORAGE_KEY, JSON.stringify(weights));
}

/** @param {ParamWeights} weights */
export function isParamActive(weights, id) {
  return (weights[id] ?? 0) > 0;
}
