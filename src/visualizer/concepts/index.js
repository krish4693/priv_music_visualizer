import { normalizeVisualConcept, isGeometricConcept } from '../visualConceptStore.js';
import { initParticles, updateParticles } from './particlesConcept.js';
import { initTypography, updateTypography } from './typographyConcept.js';
import { initConstellation, updateConstellation } from './constellationConcept.js';
import { initBlobs, updateBlobs } from './blobsConcept.js';
import { initGlassDiscs, updateGlassDiscs } from './glassDiscsConcept.js';
import { initOrigami, updateOrigami } from './origamiConcept.js';
import {
  drawConceptPopArt,
  syncConceptCinematic,
  disposeConceptCinematic,
  applyConceptTransforms,
  updateConceptMeshColors,
  clearConceptObjects,
} from './conceptRenderers.js';

/** @type {Record<string, { init: Function, update?: Function }>} */
const INIT_MAP = {
  particles: { init: initParticles, update: updateParticles },
  typography: { init: initTypography, update: updateTypography },
  constellation: { init: initConstellation, update: updateConstellation },
  blobs: { init: initBlobs, update: updateBlobs },
  glassDiscs: { init: initGlassDiscs, update: updateGlassDiscs },
  origami: { init: initOrigami, update: updateOrigami },
};

export { isGeometricConcept, normalizeVisualConcept };

/** @param {import('../variationStore.js').VariationSettings} variation */
export function getActiveConceptId(variation) {
  return normalizeVisualConcept(variation?.visualConcept);
}

/**
 * @param {object} scene
 * @param {number} width
 * @param {number} height
 */
export function initConceptEntities(scene, width, height) {
  const conceptId = getActiveConceptId(scene.variation);
  if (isGeometricConcept(conceptId)) {
    scene._conceptState = null;
    return null;
  }

  const mod = INIT_MAP[conceptId];
  if (!mod) {
    scene._conceptState = null;
    return null;
  }

  const result = mod.init({
    variation: scene.variation,
    width,
    height,
    palette: scene.palette,
    songTitle: scene.songTitle,
  });
  scene._conceptState = result.state ?? {};
  return result.entities;
}

/** @param {object} scene @param {{ mot: number, geo: number, morph: number, motionDt: number, beat?: boolean }} ctx */
export function updateConceptExtras(scene, ctx) {
  const conceptId = getActiveConceptId(scene.variation);
  const mod = INIT_MAP[conceptId];
  mod?.update?.(scene.shapes, scene._conceptState ?? {}, { ...ctx, rng: scene.rng });
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawConceptScene(scene, ctx) {
  return drawConceptPopArt(scene, ctx);
}

/** @param {object} scene */
export function syncConceptScene(scene) {
  return syncConceptCinematic(scene);
}

/** @param {object} scene */
export function applyConceptSceneTransforms(scene) {
  if (isGeometricConcept(getActiveConceptId(scene.variation))) return;
  applyConceptTransforms(scene);
}

/** @param {object} scene */
export function updateConceptSceneColors(scene) {
  return updateConceptMeshColors(scene);
}

/** @param {object} scene */
export function disposeConceptScene(scene) {
  disposeConceptCinematic(scene);
}

export { clearConceptObjects };
