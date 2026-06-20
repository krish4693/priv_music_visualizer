import { cloneMappings } from './mappingMatrix.js';

/** @typedef {{ geometry: number, color: number, motion: number, morphing: number }} EffectiveValues */
/** @typedef {{ selectedKeys: string[], customColors?: { r: number, g: number, b: number, name?: string }[] }} AutomationPalette */
/** @typedef {{ time: number, effective: EffectiveValues, sources: Record<string, number>, mappings: import('./mappingMatrix.js').MappingMatrix, viscosity: number, palette?: AutomationPalette|null }} AutomationKeyframe */

const SAMPLE_INTERVAL = 0.2;

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** @param {EffectiveValues} a @param {EffectiveValues} b @param {number} t */
function lerpEffective(a, b, t) {
  return {
    geometry: clamp01(lerp(a.geometry, b.geometry, t)),
    color: clamp01(lerp(a.color, b.color, t)),
    motion: clamp01(lerp(a.motion, b.motion, t)),
    morphing: clamp01(lerp(a.morphing, b.morphing, t)),
  };
}

/** @param {Record<string, number>} a @param {Record<string, number>} b @param {number} t */
function lerpSources(a, b, t) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  /** @type {Record<string, number>} */
  const out = {};
  for (const key of keys) {
    out[key] = clamp01(lerp(a[key] ?? 0, b[key] ?? 0, t));
  }
  return out;
}

export class AutomationRecorder {
  constructor() {
    /** @type {AutomationKeyframe[]} */
    this.keyframes = [];
    this.isRecording = false;
    this._lastSampleTime = -Infinity;
  }

  get count() {
    return this.keyframes.length;
  }

  clear() {
    this.keyframes = [];
    this._lastSampleTime = -Infinity;
  }

  start() {
    this.isRecording = true;
    this._lastSampleTime = -Infinity;
  }

  stop() {
    this.isRecording = false;
  }

  /** @returns {boolean} True when a take is loaded and should drive playback. */
  get isActive() {
    return this.keyframes.length > 0 && !this.isRecording;
  }

  /** @param {AutomationKeyframe[]} keyframes */
  loadKeyframes(keyframes) {
    this.keyframes = keyframes.map((kf) => ({
      time: kf.time,
      effective: { ...kf.effective },
      sources: { ...kf.sources },
      mappings: cloneMappings(kf.mappings),
      viscosity: kf.viscosity,
      palette: normalizePalette(kf.palette),
    }));
    this.keyframes.sort((a, b) => a.time - b.time);
    this.isRecording = false;
    this._lastSampleTime = -Infinity;
  }

  exportData() {
    return this.keyframes.map((kf) => ({
      time: kf.time,
      effective: { ...kf.effective },
      sources: { ...kf.sources },
      mappings: cloneMappings(kf.mappings),
      viscosity: kf.viscosity,
      palette: kf.palette ? { ...kf.palette, customColors: kf.palette.customColors?.map((c) => ({ ...c })) } : null,
    }));
  }

  /** @param {AutomationKeyframe} keyframe */
  addKeyframe(keyframe) {
    const kf = {
      time: Math.max(0, keyframe.time),
      effective: { ...keyframe.effective },
      sources: { ...keyframe.sources },
      mappings: cloneMappings(keyframe.mappings),
      viscosity: keyframe.viscosity,
      palette: normalizePalette(keyframe.palette),
    };

    const last = this.keyframes[this.keyframes.length - 1];
    if (last && Math.abs(last.time - kf.time) < 0.05) {
      this.keyframes[this.keyframes.length - 1] = kf;
      return;
    }

    this.keyframes.push(kf);
    this.keyframes.sort((a, b) => a.time - b.time);
  }

  /**
   * @param {number} time
   * @param {Omit<AutomationKeyframe, 'time'>} state
   * @param {boolean} force
   */
  capture(time, state, force = false) {
    if (!this.isRecording) return;
    if (!force && time - this._lastSampleTime < SAMPLE_INTERVAL) return;
    this._lastSampleTime = time;
    this.addKeyframe({ time, ...state });
  }

  /** @param {number} time */
  _keyframeAtOrBefore(time) {
    let chosen = this.keyframes[0];
    for (const kf of this.keyframes) {
      if (kf.time <= time) chosen = kf;
      else break;
    }
    return chosen;
  }

  /** @returns {AutomationKeyframe|null} */
  sampleAt(time) {
    if (!this.keyframes.length) return null;

    const t = Math.max(0, time);
    const first = this.keyframes[0];
    const last = this.keyframes[this.keyframes.length - 1];
    const paletteSource = this._keyframeAtOrBefore(t);

    if (t <= first.time) return { ...first, palette: paletteSource.palette ?? null };
    if (t >= last.time) return { ...last, palette: paletteSource.palette ?? null };

    for (let i = 0; i < this.keyframes.length - 1; i++) {
      const a = this.keyframes[i];
      const b = this.keyframes[i + 1];
      if (t >= a.time && t <= b.time) {
        const span = b.time - a.time;
        const u = span > 0 ? (t - a.time) / span : 0;
        return {
          time: t,
          effective: lerpEffective(a.effective, b.effective, u),
          sources: lerpSources(a.sources, b.sources, u),
          mappings: cloneMappings(a.mappings),
          viscosity: lerp(a.viscosity, b.viscosity, u),
          palette: paletteSource.palette ?? null,
        };
      }
    }

    return { ...last, palette: paletteSource.palette ?? null };
  }
}

/** @param {AutomationPalette|null|undefined} palette */
function normalizePalette(palette) {
  if (!palette || !Array.isArray(palette.selectedKeys) || !palette.selectedKeys.length) return null;
  const selectedKeys = palette.selectedKeys.filter((k) => typeof k === 'string' && k.length);
  if (!selectedKeys.length) return null;
  const customColors = Array.isArray(palette.customColors)
    ? palette.customColors.filter((c) => c && Number.isFinite(c.r) && Number.isFinite(c.g) && Number.isFinite(c.b))
    : [];
  return { selectedKeys, customColors };
}

const AUTOMATION_VERSION = 1;

/** @param {AutomationKeyframe[]} keyframes */
export function encodeAutomation(keyframes) {
  const json = JSON.stringify({ version: AUTOMATION_VERSION, keyframes });
  return btoa(unescape(encodeURIComponent(json)));
}

/** @param {unknown[]} keyframes */
function normalizeKeyframes(keyframes) {
  if (!Array.isArray(keyframes)) return null;
  const normalized = keyframes
    .filter((kf) => kf && Number.isFinite(kf.time))
    .map((kf) => ({
      time: Math.max(0, kf.time),
      effective: {
        geometry: clamp01(kf.effective?.geometry ?? 0),
        color: clamp01(kf.effective?.color ?? 0),
        motion: clamp01(kf.effective?.motion ?? 0),
        morphing: clamp01(kf.effective?.morphing ?? 0),
      },
      sources: { ...(kf.sources ?? {}) },
      mappings: cloneMappings({ ...kf.mappings }),
      viscosity: clamp01(Number(kf.viscosity) || 0.38),
      palette: normalizePalette(kf.palette),
    }));
  return normalized.length ? normalized : null;
}

/** @param {string} text */
export function parseAutomationDocument(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed?.keyframes) return normalizeKeyframes(parsed.keyframes);
    } catch {
      return null;
    }
  }

  return decodeAutomation(trimmed);
}

/** @returns {AutomationKeyframe[]|null} */
export function decodeAutomation(code) {
  try {
    const trimmed = (code || '').trim();
    if (!trimmed) return null;
    const json = decodeURIComponent(escape(atob(trimmed)));
    const parsed = JSON.parse(json);
    if (!parsed?.keyframes) return null;
    return normalizeKeyframes(parsed.keyframes);
  } catch {
    return null;
  }
}

/** @param {string} [songName] */
export function suggestTakeFilename(songName) {
  const base = (songName || 'take')
    .replace(/\.(mp3|wav|m4a|flac|aac|ogg)$/i, '')
    .replace(/[^\w\s\-().äöüÄÖÜß]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60) || 'take';
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
  return `${base}-take_${stamp}.vtake`;
}

/** @param {AutomationKeyframe[]} keyframes @param {string} filename @param {{ song?: string }} [meta] */
export function downloadAutomationTake(keyframes, filename, meta = {}) {
  const payload = {
    version: AUTOMATION_VERSION,
    keyframes,
    savedAt: new Date().toISOString(),
    ...meta,
  };
  const name = filename.endsWith('.vtake') ? filename : `${filename}.vtake`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
