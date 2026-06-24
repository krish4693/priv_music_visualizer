import { createRng } from '../sceneCore/layout.js';
import { resolveLivingElementCount, elementMotionScale } from '../elementMotion.js';
import { clearGlobeBalloonState } from '../elementBalloonPhysics.js';
import { resolveGlobeLayoutsWithBalloons } from '../livingSongDrawHelpers.js';
import { isGlobeConcept } from '../visualConceptStore.js';

/** @param {number} tempo Normalized tempo 0–1 */
function bpmFromTempo(tempo) {
  return 65 + (tempo ?? 0.5) * 115;
}

function smooth(t) {
  return t * t * (3 - 2 * t);
}

/** Beat pulse 0–1 for width/glow (peaks on each beat). */
export function livingSongBeatPulse(songTime, tempo, animationSpeed = 1, sources = {}) {
  if (sources.beatPulse != null) {
    return Math.min(1, sources.beatPulse * 1.2);
  }
  const bpm = bpmFromTempo(tempo);
  const beatSec = 60 / bpm;
  const effectiveTime = (songTime ?? 0) * (animationSpeed ?? 1);
  const beatFrac = (effectiveTime / beatSec) % 1;
  return Math.pow(Math.sin(beatFrac * Math.PI), 1.2);
}

/** Seconds per path attempt — scales with song length and animation speed. */
export function riverSegmentDuration(songDuration, animationSpeed = 1) {
  const dur = Math.max(6, songDuration || 180);
  const base = Math.max(1.2, dur * 0.085);
  return base / Math.max(0.25, animationSpeed ?? 1);
}

/** Stagger offset in seconds — scaled to song length (supports legacy absolute delays). */
export function riverLagSeconds(river, songDuration) {
  if (river.startDelayRatio != null) {
    return (river.startDelayRatio ?? 0) * Math.max(0, songDuration);
  }
  const segDur = riverSegmentDuration(songDuration, 1);
  const abs = river.startDelaySec ?? (river.progressLag ?? 0) * segDur * 0.4;
  return songDuration > 0 ? Math.min(abs, songDuration * 0.35) : abs;
}

/** @param {number} t 0–1 @param {number} seed @param {number} span */
function riverMeanderAlong(t, seed, span) {
  const s = seed * 0.013;
  return Math.sin(t * Math.PI * 2.9 + s * 1.4) * span * 0.55
    + Math.sin(t * Math.PI * 6.7 + s * 0.8) * span * 0.22;
}

/** Cached river templates — avoids rebuilding completed segments every frame. */
const riverTemplateCache = new Map();
const RIVER_TEMPLATE_CACHE_MAX = 384;

function riverTemplateKey(width, height, pathSeed, startX, startY) {
  return `${width}|${height}|${pathSeed}|${startX}|${startY}`;
}

function cachedRiverTemplate(width, height, pathSeed, startX, startY) {
  const key = riverTemplateKey(width, height, pathSeed, startX, startY);
  let template = riverTemplateCache.get(key);
  if (!template) {
    template = buildRandomRiverTemplate(width, height, pathSeed, startX, startY);
    riverTemplateCache.set(key, template);
    if (riverTemplateCache.size > RIVER_TEMPLATE_CACHE_MAX) {
      const oldest = riverTemplateCache.keys().next().value;
      riverTemplateCache.delete(oldest);
    }
  }
  return template;
}

export function clearRiverTemplateCache() {
  riverTemplateCache.clear();
}

/** Normalized point anywhere on the canvas (small edge inset). */
function randomCanvasNorm(roll) {
  return { startX: 0.035 + roll() * 0.93, startY: 0.035 + roll() * 0.93 };
}

/** Usable draw area — nearly full canvas. */
function riverCanvasBounds(width, height) {
  const padX = width * 0.035;
  const padY = height * 0.035;
  return { left: padX, right: width - padX, top: padY, bottom: height - padY };
}

/** Pick starts spread across the full canvas. @param {() => number} roll @param {number} count */
function rollRiverStarts(roll, count) {
  /** @type {{ startX: number, startY: number }[]} */
  const starts = [];
  for (let i = 0; i < count; i++) {
    let picked = randomCanvasNorm(roll);
    for (let attempt = 0; attempt < 48; attempt++) {
      const candidate = attempt === 0 && i === 0 ? picked : randomCanvasNorm(roll);
      const minDist = i === 0 ? 1 : 0.16;
      const ok = starts.every(
        (s) => Math.hypot(candidate.startX - s.startX, candidate.startY - s.startY) >= minDist,
      );
      if (ok) {
        picked = candidate;
        break;
      }
    }
    starts.push(picked);
  }
  return starts;
}

/**
 * @typedef {{ pathSeed: number, startX: number, startY: number, colorIdx: number, startDelaySec?: number, startDelayRatio?: number, progressLag?: number }} RiverConfig
 */

/** Fraction of song length before each river begins (staggered starts). */
function rollRiverStartDelayRatio(index, roll, count) {
  if (index <= 0 || count <= 1) return 0;
  const t = index / (count - 1);
  return t * (0.12 + roll() * 0.06);
}

/**
 * @param {number} variationSeed
 * @param {() => number} rng
 * @param {number} [colorCount]
 * @returns {RiverConfig[]}
 */
export function rollRivers(variationSeed, rng, colorCount = 2) {
  const count = Math.max(1, Math.min(28, colorCount || 1));
  const salt = Math.floor(rng() * 1e9);
  const roll = createRng(((variationSeed ?? 42) ^ salt) >>> 0);
  const starts = rollRiverStarts(roll, count);

  return starts.map((start, i) => ({
    pathSeed: Math.floor(roll() * 999983) + 1 + i * 4099,
    startX: start.startX,
    startY: start.startY,
    colorIdx: i,
    startDelayRatio: rollRiverStartDelayRatio(i, roll, count),
  }));
}

/** @deprecated Use rollRivers */
export function rollRiverPair(variationSeed, rng) {
  return rollRivers(variationSeed, rng, 2);
}

/**
 * Match river count to selected palette colors.
 * @param {object} state
 * @param {number} colorCount
 * @param {() => number} rng
 * @param {{ reroll?: boolean }} [opts]
 */
export function syncLivingSongRivers(state, colorCount, rng, opts = {}) {
  const count = Math.max(1, Math.min(28, colorCount || 1));
  state.paletteColorCount = count;

  if (opts.reroll || !state.rivers?.length) {
    const rollRng = createRng(((state.variationSeed ?? 42) + (state.sessionRoll ?? 0) * 9973) >>> 0);
    state.rivers = rollRivers(state.variationSeed, rollRng, count);
    return;
  }

  const rivers = state.rivers;
  if (rivers.length === count) {
    rivers.forEach((r, i) => { r.colorIdx = i; });
    return;
  }

  if (rivers.length < count) {
    const rollRng = createRng(((state.variationSeed ?? 42) + rivers.length * 6151) >>> 0);
    while (rivers.length < count) {
      const start = rollRiverStarts(rollRng, 1)[0];
      rivers.push({
        pathSeed: Math.floor(rollRng() * 999983) + rivers.length * 7919,
        startX: start.startX,
        startY: start.startY,
        colorIdx: rivers.length,
        startDelayRatio: rollRiverStartDelayRatio(rivers.length, rollRng, count),
      });
    }
    return;
  }

  state.rivers = rivers.slice(0, count).map((r, i) => ({ ...r, colorIdx: i }));
}

/** Random waypoints across the full canvas — unique per pathSeed. */
export function buildRandomRiverTemplate(width, height, pathSeed, startX, startY) {
  const rng = createRng(pathSeed >>> 0);
  const { left, right, top, bottom } = riverCanvasBounds(width, height);
  const spanX = right - left;
  const spanY = bottom - top;

  const legCount = 5 + Math.floor(rng() * 4);
  const waypoints = [{ x: width * startX, y: height * startY }];

  for (let i = 1; i <= legCount; i++) {
    if (rng() < 0.3) {
      const edge = Math.floor(rng() * 4);
      if (edge === 0) waypoints.push({ x: left + spanX * rng(), y: top });
      else if (edge === 1) waypoints.push({ x: right, y: top + spanY * rng() });
      else if (edge === 2) waypoints.push({ x: left + spanX * rng(), y: bottom });
      else waypoints.push({ x: left, y: top + spanY * rng() });
    } else {
      waypoints.push({
        x: left + rng() * spanX,
        y: top + rng() * spanY,
      });
    }
  }

  /** @type {{ x: number, y: number }[]} */
  const points = [waypoints[0]];
  const stepsPerLeg = 28;

  for (let w = 0; w < waypoints.length - 1; w++) {
    const a = waypoints[w];
    const b = waypoints[w + 1];
    const cpX = (a.x + b.x) / 2 + (rng() - 0.5) * spanX * 0.32;
    const cpY = (a.y + b.y) / 2 + (rng() - 0.5) * spanY * 0.32;

    for (let i = 1; i <= stepsPerLeg; i++) {
      const t = i / stepsPerLeg;
      const u = 1 - smooth(t);
      const v = smooth(t);
      const px = u * u * a.x + 2 * u * v * cpX + v * v * b.x;
      const py = u * u * a.y + 2 * u * v * cpY + v * v * b.y;
      const wobX = riverMeanderAlong(t, pathSeed + w * 41, spanX * 0.055);
      const wobY = riverMeanderAlong(t, pathSeed + w * 41 + 17, spanY * 0.045);
      points.push({ x: px + wobX, y: py + wobY });
    }
  }

  return points;
}

/** Start + path seed for one segment (new random path each segment). */
export function riverSegmentConfig(river, segmentIndex) {
  const segRng = createRng((river.pathSeed + segmentIndex * 15937) >>> 0);
  if (segmentIndex === 0) {
    return {
      pathSeed: river.pathSeed,
      startX: river.startX,
      startY: river.startY,
    };
  }
  return {
    pathSeed: Math.floor(segRng() * 999983) + segmentIndex * 313,
    startX: 0.035 + segRng() * 0.93,
    startY: 0.035 + segRng() * 0.93,
  };
}

/** Slice template to progress 0–1. */
export function sliceRiverTemplate(template, progress) {
  if (progress <= 0) return [template[0]];
  const floatIdx = progress * (template.length - 1);
  const idx = Math.max(1, Math.floor(floatIdx));
  const frac = floatIdx - Math.floor(floatIdx);
  const slice = template.slice(0, idx + 1);
  if (frac > 0.001 && idx + 1 < template.length) {
    const a = template[idx];
    const b = template[idx + 1];
    slice.push({
      x: a.x + (b.x - a.x) * frac,
      y: a.y + (b.y - a.y) * frac,
    });
  }
  return slice;
}

/**
 * Segment draw state for one river.
 * @returns {{ started: boolean, currentSeg: number, localProgress: number, complete: boolean, laggedTime: number }}
 */
export function livingSongSegmentState(songTime, animationSpeed, songDuration, river) {
  const lagSec = riverLagSeconds(river, songDuration);
  const laggedTime = Math.max(0, (songTime ?? 0) - lagSec);
  if (laggedTime <= 0) {
    return { started: false, currentSeg: 0, localProgress: 0, complete: false, laggedTime: 0 };
  }
  const anim = Math.max(0.25, animationSpeed ?? 1);
  const segDur = riverSegmentDuration(songDuration, animationSpeed) * (river.segmentDurationMul ?? 1);
  const atEnd = songDuration > 0 && (songTime ?? 0) >= songDuration;
  const cappedLagged = songDuration > 0
    ? Math.max(0, Math.min(songTime ?? 0, songDuration) - lagSec)
    : laggedTime;
  const effectiveTime = atEnd ? cappedLagged * anim : laggedTime * anim;
  const currentSeg = Math.floor(effectiveTime / segDur);
  const localProgress = atEnd ? 1 : Math.min(1, (effectiveTime % segDur) / segDur);
  return { started: true, currentSeg, localProgress, complete: atEnd, laggedTime };
}

/**
 * River timing for draw (hide until started).
 * @returns {{ started: boolean, localProgress: number, laggedTime: number }}
 */
export function livingSongRiverProgress(songTime, animationSpeed, songDuration, river) {
  const state = livingSongSegmentState(songTime, animationSpeed, songDuration, river);
  return {
    started: state.started,
    localProgress: state.localProgress,
    laggedTime: state.laggedTime,
    complete: state.complete,
  };
}

/**
 * Dynamic width multiplier — thinner at rest, swells with song energy & progress (up to ~4×).
 * @param {RiverConfig} river
 * @param {number} songTime
 * @param {number} songDuration
 * @param {number} beatPulse 0–1
 * @param {number} slowPulse 0–1
 * @param {number} energy 0–1
 * @param {number} segProgress 0–1 active segment draw progress
 * @param {number} [motionScale]
 */
export function livingSongWidthScale(river, songTime, songDuration, beatPulse, slowPulse, energy, segProgress, motionScale = 1) {
  const phase = ((river.pathSeed ?? 1) % 997) / 997;
  const riverWave = 0.5 + 0.5 * Math.sin((songTime ?? 0) * 0.62 + phase * Math.PI * 2);
  const songArc = songDuration > 0 ? Math.min(1, (songTime ?? 0) / songDuration) : 0;
  const scale = (0.42
    + beatPulse * 0.75
    + slowPulse * 0.45
    + riverWave * 0.55
    + songArc * 0.5
    + (energy ?? 0) * 0.65
    + (segProgress ?? 0) * 0.55) * motionScale;
  return Math.min(4, Math.max(0.35, scale));
}

/**
 * All point chains to draw for one river (completed segments + current).
 * @param {number} width
 * @param {number} height
 * @param {number} songTime
 * @param {number} animationSpeed
 * @param {number} songDuration
 * @param {RiverConfig} river
 * @returns {{ x: number, y: number }[][]}
 */
export function livingSongRiverPaths(width, height, songTime, animationSpeed, songDuration, river) {
  const { started, currentSeg, localProgress, complete } = livingSongSegmentState(
    songTime,
    animationSpeed,
    songDuration,
    river,
  );
  if (!started) return [];

  /** @type {{ x: number, y: number }[][]} */
  const chains = [];

  for (let s = 0; s < currentSeg; s++) {
    const cfg = riverSegmentConfig(river, s);
    const template = cachedRiverTemplate(width, height, cfg.pathSeed, cfg.startX, cfg.startY);
    chains.push(template);
  }

  const activeCfg = riverSegmentConfig(river, currentSeg);
  const activeTemplate = cachedRiverTemplate(
    width,
    height,
    activeCfg.pathSeed,
    activeCfg.startX,
    activeCfg.startY,
  );
  if (complete) {
    if (activeTemplate.length >= 2) chains.push(activeTemplate);
  } else {
    const activeSlice = sliceRiverTemplate(activeTemplate, localProgress);
    if (activeSlice.length >= 2) chains.push(activeSlice);
  }

  return chains;
}

/** Seconds to hold the completed shape on screen after drawing finishes. */
export const LIVING_SONG_HOLD_SECONDS = 4;

/**
 * Song time when a river's active stroke segment is fully drawn.
 * @param {number} songDuration clip/audio length used for segment timing
 * @param {number} animationSpeed
 * @param {RiverConfig} river
 */
export function livingSongRiverCompletionTime(songDuration, animationSpeed, river) {
  const segDur = riverSegmentDuration(songDuration, animationSpeed);
  const lagSec = riverLagSeconds(river, songDuration);
  const laggedAtEnd = Math.max(0, songDuration - lagSec);
  if (laggedAtEnd <= 0) return songDuration;

  const speed = Math.max(0.25, animationSpeed ?? 1);
  const effectiveTime = laggedAtEnd * speed;
  const currentSeg = Math.floor(effectiveTime / segDur);
  const effectiveNeeded = (currentSeg + 1) * segDur;
  return lagSec + effectiveNeeded / speed;
}

/** Latest time any river finishes its in-progress stroke. */
export function livingSongStrokeCompletionTime(songDuration, animationSpeed, rivers) {
  if (!rivers?.length) return songDuration;
  return Math.max(
    songDuration,
    ...rivers.map((river) => livingSongRiverCompletionTime(songDuration, animationSpeed, river)),
  );
}

/**
 * Map export timeline to visual song time: draw through song end, then freeze.
 * @param {number} exportTime seconds from clip start
 * @param {number} songDuration audio/clip length
 */
export function livingSongVisualTimeAt(exportTime, songDuration) {
  if (songDuration <= 0) return exportTime;
  return Math.min(exportTime, songDuration);
}

/**
 * @param {number} songDuration
 * @param {number} [_animationSpeed]
 * @param {RiverConfig[]} [_rivers]
 * @param {number} [holdSeconds]
 */
export function livingSongExportTimeline(songDuration, _animationSpeed, _rivers, holdSeconds = LIVING_SONG_HOLD_SECONDS) {
  return {
    completionTime: songDuration,
    tailSeconds: 0,
    holdSeconds,
    totalDuration: songDuration + holdSeconds,
  };
}

/** @param {import('./conceptTypes.js').ConceptInitContext} ctx */
export function initVisualLivingSong(ctx) {
  const variationSeed = ctx.variation?.seed ?? 42;
  const rng = createRng(variationSeed + 5407);
  const colorCount = resolveLivingElementCount(ctx.variation, ctx.palette?.length ?? 2);
  return {
    entities: [],
    state: {
      beatPulse: 0,
      songTime: 0,
      songDuration: 0,
      animationSpeed: 1,
      variationSeed,
      sessionRoll: 0,
      paletteColorCount: Math.max(1, colorCount),
      rivers: rollRivers(variationSeed, rng, colorCount),
    },
  };
}

/** Smooth beat pulse for slow thickness breathing (frame-rate independent). */
function smoothLivingSongPulse(state, rawPulse, motionDt = 1 / 60) {
  const prev = state.smoothBeatPulse ?? 0;
  const blend = 1 - Math.exp(-(motionDt ?? 1 / 60) * 2.4);
  const next = prev + (rawPulse - prev) * blend;
  state.smoothBeatPulse = next;
  return next;
}

/** Slow width swell independent of beat (0–1). */
function livingSongSlowWidthPulse(songTime, seed = 0) {
  const t = (songTime ?? 0) * 0.28 + seed * 0.013;
  return 0.5 + 0.5 * Math.sin(t);
}

/** @param {object[]} _entities @param {object} state @param {object} ctx */
export function updateVisualLivingSong(_entities, state, ctx) {
  const anim = ctx.variation?.animationSpeed ?? 1;
  state.songTime = ctx.songTime ?? 0;
  state.songDuration = ctx.songDuration ?? 0;
  state.animationSpeed = anim;
  const sources = ctx.sources ?? {};
  const rawPulse = livingSongBeatPulse(state.songTime, ctx.tempo ?? 0.5, anim, sources);
  state.beatPulse = smoothLivingSongPulse(state, rawPulse, ctx.motionDt);
  state.slowWidthPulse = livingSongSlowWidthPulse(state.songTime, state.variationSeed ?? 42);
  const rawEnergy = Math.min(1, sources.amplitude ?? sources.rms ?? 0);
  const prevEnergy = state.smoothEnergy ?? 0;
  const eBlend = 1 - Math.exp(-(ctx.motionDt ?? 1 / 60) * 3.5);
  state.smoothEnergy = prevEnergy + (rawEnergy - prevEnergy) * eBlend;
  state.tempo = ctx.tempo ?? 0.5;
  const paletteLen = ctx.palette?.length ?? state.paletteColorCount ?? 2;
  const elementCount = resolveLivingElementCount(ctx.variation, paletteLen);
  if (elementCount !== state.paletteColorCount) {
    const rng = createRng(((state.variationSeed ?? 42) + (state.sessionRoll ?? 0) * 9973 + elementCount * 31) >>> 0);
    syncLivingSongRivers(state, elementCount, rng, { reroll: true });
    clearGlobeBalloonState(state);
  }

  if (isGlobeConcept(ctx.variation?.visualConcept) && ctx.sceneWidth && ctx.sceneHeight) {
    const rivers = state.rivers?.length ? state.rivers.slice(0, elementCount) : [];
    if (rivers.length) {
      const mot = elementMotionScale(ctx.variation) * Math.max(0.15, ctx.mot ?? 0.5);
      const sceneStub = {
        width: ctx.sceneWidth,
        height: ctx.sceneHeight,
        variation: ctx.variation,
      };
      resolveGlobeLayoutsWithBalloons(sceneStub, state, rivers, Math.max(0.15, mot), ctx.motionDt ?? 1 / 60);
    }
  }
}

/** @param {object} state @param {() => number} [rng] @param {number} [colorCount] */
export function resetLivingSong(state, rng = Math.random, colorCount) {
  state.beatPulse = 0;
  state.smoothBeatPulse = 0;
  state.smoothEnergy = 0;
  state.songTime = 0;
  state.sessionRoll = (state.sessionRoll ?? 0) + 1;
  clearRiverTemplateCache();
  const rollRng = createRng(((state.variationSeed ?? 42) + state.sessionRoll * 9973) >>> 0);
  const count = colorCount ?? state.paletteColorCount ?? 2;
  state.rivers = rollRivers(state.variationSeed, rollRng, count);
  state.paletteColorCount = Math.max(1, count);
  clearGlobeBalloonState(state);
}
