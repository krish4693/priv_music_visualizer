export const CINEMATIC_SETTINGS_KEY = 'visualizer-cinematic-settings-v1';

/** @typedef {Object} CinematicSettings */
export const DEFAULT_CINEMATIC_SETTINGS = {
  fog: 30,
  bloom: 42,
  bloomRadius: 34,
  vignette: 42,
  exposure: 118,
  keyLight: 70,
  fillLight: 58,
  rimLight: 38,
  ambient: 36,
  frontLight: 78,
  shadows: true,
  metalness: 18,
  roughness: 16,
  emissive: 16,
  letterbox: 32,
  cameraOrbit: 52,
  floorGloss: 28,
  showFloor: true,
  filmGrain: 32,
};

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

/** @returns {CinematicSettings} */
export function cloneCinematicSettings(s) {
  return {
    ...DEFAULT_CINEMATIC_SETTINGS,
    ...s,
    shadows: s?.shadows !== false,
    showFloor: s?.showFloor !== false,
  };
}

/** @returns {CinematicSettings} */
export function loadCinematicSettings() {
  try {
    const raw = localStorage.getItem(CINEMATIC_SETTINGS_KEY);
    if (!raw) return cloneCinematicSettings(DEFAULT_CINEMATIC_SETTINGS);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return cloneCinematicSettings(DEFAULT_CINEMATIC_SETTINGS);
    return normalizeCinematicSettings(parsed);
  } catch {
    return cloneCinematicSettings(DEFAULT_CINEMATIC_SETTINGS);
  }
}

/** @param {Partial<CinematicSettings>} raw @returns {CinematicSettings} */
export function normalizeCinematicSettings(raw) {
  const d = DEFAULT_CINEMATIC_SETTINGS;
  return {
    fog: clamp(Number(raw.fog) ?? d.fog, 0, 100),
    bloom: clamp(Number(raw.bloom) ?? d.bloom, 0, 100),
    bloomRadius: clamp(Number(raw.bloomRadius) ?? d.bloomRadius, 0, 100),
    vignette: clamp(Number(raw.vignette) ?? d.vignette, 0, 100),
    exposure: clamp(Number(raw.exposure) ?? d.exposure, 50, 180),
    keyLight: clamp(Number(raw.keyLight) ?? d.keyLight, 0, 100),
    fillLight: clamp(Number(raw.fillLight) ?? d.fillLight, 0, 100),
    rimLight: clamp(Number(raw.rimLight) ?? d.rimLight, 0, 100),
    ambient: clamp(Number(raw.ambient) ?? d.ambient, 0, 100),
    frontLight: clamp(Number(raw.frontLight) ?? d.frontLight, 0, 100),
    shadows: raw.shadows !== false,
    metalness: clamp(Number(raw.metalness) ?? d.metalness, 0, 100),
    roughness: clamp(Number(raw.roughness) ?? d.roughness, 0, 100),
    emissive: clamp(Number(raw.emissive) ?? d.emissive, 0, 100),
    letterbox: clamp(Number(raw.letterbox) ?? d.letterbox, 0, 100),
    cameraOrbit: clamp(Number(raw.cameraOrbit) ?? d.cameraOrbit, 0, 100),
    floorGloss: clamp(Number(raw.floorGloss) ?? d.floorGloss, 0, 100),
    showFloor: raw.showFloor !== false,
    filmGrain: clamp(Number(raw.filmGrain) ?? d.filmGrain, 0, 100),
  };
}

/** @param {CinematicSettings} settings */
export function saveCinematicSettings(settings) {
  localStorage.setItem(CINEMATIC_SETTINGS_KEY, JSON.stringify(normalizeCinematicSettings(settings)));
}

export const CINEMATIC_SLIDERS = [
  { key: 'fog', label: 'Fog density', min: 0, max: 100 },
  { key: 'bloom', label: 'Bloom glow', min: 0, max: 100 },
  { key: 'bloomRadius', label: 'Bloom spread', min: 0, max: 100 },
  { key: 'vignette', label: 'Vignette (edge shade)', min: 0, max: 100 },
  { key: 'exposure', label: 'Exposure', min: 50, max: 180 },
  { key: 'keyLight', label: 'Key light', min: 0, max: 100 },
  { key: 'fillLight', label: 'Fill light', min: 0, max: 100 },
  { key: 'rimLight', label: 'Rim light', min: 0, max: 100 },
  { key: 'ambient', label: 'Ambient light', min: 0, max: 100 },
  { key: 'frontLight', label: 'Front light', min: 0, max: 100 },
  { key: 'metalness', label: 'Surface metal', min: 0, max: 100 },
  { key: 'roughness', label: 'Surface roughness', min: 0, max: 100 },
  { key: 'emissive', label: 'Emissive glow', min: 0, max: 100 },
  { key: 'letterbox', label: 'Letterbox bars', min: 0, max: 100 },
  { key: 'filmGrain', label: 'Film grain', min: 0, max: 100 },
  { key: 'cameraOrbit', label: 'Camera orbit', min: 0, max: 100 },
  { key: 'floorGloss', label: 'Floor reflectivity', min: 0, max: 100 },
];
