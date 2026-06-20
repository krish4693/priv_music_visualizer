export const MAPPING_STORAGE_KEY = 'visualizer-image-mapping-v1';
export const VISCOSITY_STORAGE_KEY = 'visualizer-image-viscosity';

/** @typedef {{ source: string, sensitivity: number }} MappingEntry */
/** @typedef {Record<string, MappingEntry>} MappingMatrix */

export const AUDIO_SOURCES = [
  { id: 'none', label: '— None —' },
  { id: 'low', label: 'Low Frequencies (Bass)' },
  { id: 'mid', label: 'Mid Frequencies' },
  { id: 'high', label: 'High Frequencies' },
  { id: 'amplitude', label: 'Overall Amplitude (RMS)' },
  { id: 'tempoPhase', label: 'Tempo / BPM Phase' },
];

export const VISUAL_TARGETS = [
  { id: 'zoom', label: 'Zoom & Scale', hint: 'Punch-in / pull-back on the beat' },
  { id: 'motion', label: 'Pan & Drift', hint: 'Gentle travel across the frame (no rotation)' },
  { id: 'color', label: 'Color & Tone', hint: 'Hue shift, saturation, contrast' },
  { id: 'glitch', label: 'Glitch & Slices', hint: 'Horizontal band shifts + RGB split' },
  { id: 'wave', label: 'Wave Distortion', hint: 'Ripple and bend the image' },
  { id: 'shapeMorph', label: 'Shape Morph', hint: 'Clip image through morphing rectangles, squares, ovals & diamonds' },
];

/** @type {MappingMatrix} */
export const DEFAULT_MAPPINGS = {
  zoom: { source: 'low', sensitivity: 0.85 },
  motion: { source: 'tempoPhase', sensitivity: 0.9 },
  color: { source: 'mid', sensitivity: 0.75 },
  glitch: { source: 'high', sensitivity: 0.8 },
  wave: { source: 'amplitude', sensitivity: 0.7 },
  shapeMorph: { source: 'mid', sensitivity: 0.8 },
};

export const DEFAULT_VISCOSITY = 0.35;

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** @returns {MappingMatrix} */
export function loadMappingMatrix() {
  try {
    const raw = localStorage.getItem(MAPPING_STORAGE_KEY);
    if (!raw) return cloneMappings(DEFAULT_MAPPINGS);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return cloneMappings(DEFAULT_MAPPINGS);
    const out = cloneMappings(DEFAULT_MAPPINGS);
    for (const target of VISUAL_TARGETS) {
      const entry = parsed[target.id];
      if (entry && typeof entry === 'object') {
        out[target.id] = {
          source: typeof entry.source === 'string' ? entry.source : out[target.id].source,
          sensitivity: Number.isFinite(entry.sensitivity) ? entry.sensitivity : out[target.id].sensitivity,
        };
      }
    }
    return out;
  } catch {
    return cloneMappings(DEFAULT_MAPPINGS);
  }
}

/** @param {MappingMatrix} mappings */
export function saveMappingMatrix(mappings) {
  localStorage.setItem(MAPPING_STORAGE_KEY, JSON.stringify(mappings));
}

export function loadViscosity() {
  try {
    const raw = localStorage.getItem(VISCOSITY_STORAGE_KEY);
    if (raw == null) return DEFAULT_VISCOSITY;
    const v = Number(raw);
    return Number.isFinite(v) ? clamp01(v) : DEFAULT_VISCOSITY;
  } catch {
    return DEFAULT_VISCOSITY;
  }
}

export function saveViscosity(v) {
  localStorage.setItem(VISCOSITY_STORAGE_KEY, String(clamp01(v)));
}

/** @param {Record<string, number>} sources @param {MappingMatrix} mappings */
export function resolveMappedValues(sources, mappings) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const { id } of VISUAL_TARGETS) {
    const entry = mappings[id] ?? DEFAULT_MAPPINGS[id];
    const raw = entry.source === 'none' ? 0 : (sources[entry.source] ?? 0);
    out[id] = clamp01(raw * (entry.sensitivity ?? 1));
  }
  return out;
}

/** @param {MappingMatrix} mappings */
export function cloneMappings(mappings) {
  /** @type {MappingMatrix} */
  const out = {};
  for (const { id } of VISUAL_TARGETS) {
    const entry = mappings[id] ?? DEFAULT_MAPPINGS[id];
    out[id] = { source: entry.source, sensitivity: entry.sensitivity };
  }
  return out;
}
