import { projectPoint, shadeFactor } from '../math3d.js';
import {
  livingSongRiverPaths,
  livingSongRiverProgress,
  livingSongWidthScale,
} from './visualLivingSongConcept.js';
import { livingSnakeColor, shadeColor, sceneCameraZoom, zoomProjectedPoints } from '../sceneCore/drawHelpers.js';
import { livingMotionScale, livingSongMotionParams, resolveLivingRiverCount, applyLivingSongTilt, applyLivingSongWobble3d, livingSongAmp } from '../livingSongDrawHelpers.js';
import { elementSizeMultiplier, resolveLivingElementCount } from '../elementMotion.js';
import { livingSnakeLaneRiver } from '../livingSnakeLanes.js';

const TUBE_SIDES = 8;

function normalize3([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Screen xy → centered 3D with depth weave along path. */
function liftPoint(px, py, width, height, pathT, pathSeed, colorIdx, amp = 1) {
  const x = (px - width * 0.5) * 0.92;
  const y = -(py - height * 0.5) * 0.92;
  const seed = (pathSeed ?? 1) * 0.002 + (colorIdx ?? 0) * 1.7;
  const z = (Math.sin(pathT * Math.PI * 2.8 + seed) * 150
    + Math.cos(pathT * Math.PI * 1.35 + seed * 0.65) * 95
    + (pathT - 0.5) * 110) * amp;
  return [x, y, z];
}

/** Gentle scene tumble so depth reads clearly. */
function applySceneTilt(point, songTime, motionParams) {
  const t = songTime ?? 0;
  return applyLivingSongTilt(point, t, [
    Math.sin(t * 0.13) * 0.24,
    Math.cos(t * 0.09) * 0.32,
    Math.sin(t * 0.06) * 0.1,
  ], motionParams);
}

/** @param {number[]} a @param {number[]} b @param {number} radius */
function tubeSegmentFaces(a, b, radius) {
  const t = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  let up = [0, 1, 0];
  if (Math.abs(t[1]) > 0.95) up = [1, 0, 0];
  const bitangent = normalize3(cross(t, up));
  const normal = normalize3(cross(bitangent, t));

  /** @type {{ verts: number[][], normal: number[] }[]} */
  const faces = [];
  for (let i = 0; i < TUBE_SIDES; i++) {
    const a0 = (i / TUBE_SIDES) * Math.PI * 2;
    const a1 = ((i + 1) / TUBE_SIDES) * Math.PI * 2;
    const ring = (ang, pt) => {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const off = add(scale(bitangent, c * radius), scale(normal, s * radius));
      return add(pt, off);
    };
    const mid = (a0 + a1) * 0.5;
    faces.push({
      verts: [ring(a0, a), ring(a1, a), ring(a1, b), ring(a0, b)],
      normal: normalize3(add(scale(bitangent, Math.cos(mid)), scale(normal, Math.sin(mid)))),
    });
  }
  return faces;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ avgZ: number, projected: { x: number, y: number }[], fill: string }[]} drawables
 */
function paintSortedFaces(ctx, drawables) {
  drawables.sort((a, b) => a.avgZ - b.avgZ);
  ctx.globalAlpha = 1;
  for (const d of drawables) {
    const pts = d.projected;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = d.fill;
    ctx.fill();
  }
}

/**
 * @param {{x:number,y:number}[]} points
 * @param {string} color
 * @param {number} radius
 * @param {number} width
 * @param {number} height
 * @param {number} pathSeed
 * @param {number} colorIdx
 * @param {number} songTime
 * @param {number} cameraZoom
 */
function collectTubeDrawables(points, color, radius, width, height, pathSeed, colorIdx, songTime, cameraZoom, motionParams) {
  const amp = livingSongAmp(motionParams);
  const n = points.length;
  const lifted = points.map((p, i) => {
    const pathT = n > 1 ? i / (n - 1) : 0;
    let pt = liftPoint(p.x, p.y, width, height, pathT, pathSeed, colorIdx, amp);
    pt = applySceneTilt(pt, songTime, motionParams);
    return applyLivingSongWobble3d(pt, motionParams, radius * 10);
  });

  /** @type {{ avgZ: number, projected: { x: number, y: number }[], fill: string }[]} */
  const drawables = [];

  for (let i = 0; i < lifted.length - 1; i++) {
    const faces = tubeSegmentFaces(lifted[i], lifted[i + 1], radius);
    for (const face of faces) {
      if (face.normal[2] <= 0.02) continue;
      const projected = zoomProjectedPoints(
        face.verts.map((v) => projectPoint(v, width, height)),
        width,
        height,
        cameraZoom,
      );
      const avgZ = projected.reduce((acc, p) => acc + p.z, 0) / projected.length;
      const fill = shadeColor(color, shadeFactor(face.normal));
      drawables.push({ avgZ, projected, fill });
    }
  }

  return drawables;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawVisualLivingSong3D(scene, ctx) {
  const state = scene._conceptState ?? { beatPulse: 0, rivers: [], songTime: 0, songDuration: 0, animationSpeed: 1 };
  const pulse = state.beatPulse ?? 0;
  const slowPulse = state.slowWidthPulse ?? 0.5;
  const energy = state.smoothEnergy ?? 0;
  const songTime = state.songTime ?? 0;
  const songDuration = state.songDuration ?? 0;
  const animationSpeed = state.animationSpeed ?? scene.variation?.animationSpeed ?? 1;
  const { width, height, palette } = scene;
  const cameraZoom = sceneCameraZoom(scene);
  const motionScale = livingMotionScale(scene.variation);
  const motionParams = livingSongMotionParams(scene.variation, state);
  const rivers = resolveLivingRiverCount(scene, state);
  const baseWidth = Math.max(6, width * 0.0066);
  const unicolor = !!scene.variation?.elementUnicolor;
  const objectCount = resolveLivingElementCount(scene.variation, palette.length);
  const laneCount = unicolor ? 1 : Math.max(1, palette.length);

  /** @type {{ avgZ: number, projected: { x: number, y: number }[], fill: string }[]} */
  const allDrawables = [];

  for (let objectIdx = 0; objectIdx < objectCount; objectIdx++) {
    const baseRiver = rivers[objectIdx] ?? rivers[0];
    const sizeMul = elementSizeMultiplier(scene.variation, objectIdx, objectCount);

    for (let lane = 0; lane < laneCount; lane++) {
      const river = livingSnakeLaneRiver(baseRiver, objectIdx, lane, unicolor);
      const colorIdx = unicolor ? (baseRiver.colorIdx ?? objectIdx) : lane;
      const color = livingSnakeColor(palette, colorIdx, 0);
      const progress = livingSongRiverProgress(songTime, animationSpeed, songDuration, river);
      if (!progress.started) continue;

      const chains = livingSongRiverPaths(width, height, songTime, animationSpeed, songDuration, river);
      chains.forEach((points, chainIdx) => {
        if (points.length < 2) return;
        const segProgress = chainIdx < chains.length - 1 ? 1 : progress.localProgress;
        const widthScale = livingSongWidthScale(
          river,
          songTime,
          songDuration,
          pulse,
          slowPulse,
          energy,
          segProgress,
          motionScale,
        );
        const radius = baseWidth * widthScale * 0.52 * sizeMul;
        allDrawables.push(
          ...collectTubeDrawables(
            points,
            color,
            radius,
            width,
            height,
            river.pathSeed,
            colorIdx,
            songTime,
            cameraZoom,
            motionParams,
          ),
        );
      });
    }
  }

  paintSortedFaces(ctx, allDrawables);
  return true;
}
