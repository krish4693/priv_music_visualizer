import { projectPoint } from '../math3d.js';
import {
  livingSongRiverPaths,
  livingSongRiverProgress,
  livingSongWidthScale,
} from './visualLivingSongConcept.js';
import { livingSnakeColor, parseRgb, sceneCameraZoom, zoomProjectedPoints } from '../sceneCore/drawHelpers.js';
import { livingMotionScale, livingSongMotionParams, resolveLivingRiverCount, applyLivingSongTilt, applyLivingSongWobble3d, livingSongAmp } from '../livingSongDrawHelpers.js';
import { elementSizeMultiplier, resolveLivingElementCount } from '../elementMotion.js';
import { livingSnakeLaneRiver } from '../livingSnakeLanes.js';

const TUBE_SIDES = 10;
const SUN_DIR = normalize3([0.38, -0.74, 0.55]);

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

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** Sun-warm shading with belly shadow (snake underside darker). */
function sunSnakeShade(baseCss, normal) {
  const { r, g, b } = parseRgb(baseCss);
  const ndotl = dot(normal, SUN_DIR);
  const lit = Math.max(0, ndotl);
  const shadow = Math.max(0, -ndotl);
  const belly = normal[1] > 0.35 ? 0.78 : 1;
  const shade = (0.38 + lit * 0.58 - shadow * 0.32) * belly;
  const wr = Math.min(255, r * shade + lit * 62);
  const wg = Math.min(255, g * shade + lit * 42);
  const wb = Math.min(255, b * shade * (1 - lit * 0.18));
  return `rgb(${Math.round(wr)}, ${Math.round(wg)}, ${Math.round(wb)})`;
}

/** Slithering 3D lift — stronger S-curves like a snake. */
function liftSnakePoint(px, py, width, height, pathT, pathSeed, colorIdx, amp = 1) {
  const seed = (pathSeed ?? 1) * 0.0025 + (colorIdx ?? 0) * 2.3;
  const slitherX = Math.sin(pathT * Math.PI * 5.8 + seed) * 48 * amp;
  const slitherY = Math.cos(pathT * Math.PI * 4.4 + seed * 0.8) * 28 * amp;
  const x = (px - width * 0.5) * 0.92 + slitherX;
  const y = -(py - height * 0.5) * 0.92 + slitherY * 0.35;
  const z = (Math.sin(pathT * Math.PI * 3.6 + seed) * 125
    + Math.sin(pathT * Math.PI * 8.2 + seed * 1.1) * 42
    + Math.cos(pathT * Math.PI * 2.1 + seed * 0.5) * 70) * amp;
  return [x, y, z];
}

function applySceneTilt(point, songTime, motionParams) {
  const t = songTime ?? 0;
  return applyLivingSongTilt(point, t, [
    Math.sin(t * 0.11) * 0.2,
    Math.cos(t * 0.08) * 0.26,
    Math.sin(t * 0.05) * 0.08,
  ], motionParams);
}

/** @param {number[]} a @param {number[]} b @param {number} radiusA @param {number} radiusB */
function snakeSegmentFaces(a, b, radiusA, radiusB) {
  const t = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  let up = [0, 1, 0];
  if (Math.abs(t[1]) > 0.95) up = [1, 0, 0];
  const bitangent = normalize3(cross(t, up));
  const normal = normalize3(cross(bitangent, t));

  const ring = (ang, pt, r) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const off = add(scale(bitangent, c * r), scale(normal, s * r));
    return add(pt, off);
  };

  /** @type {{ verts: number[][], normal: number[] }[]} */
  const faces = [];
  for (let i = 0; i < TUBE_SIDES; i++) {
    const a0 = (i / TUBE_SIDES) * Math.PI * 2;
    const a1 = ((i + 1) / TUBE_SIDES) * Math.PI * 2;
    const mid = (a0 + a1) * 0.5;
    faces.push({
      verts: [ring(a0, a, radiusA), ring(a1, a, radiusA), ring(a1, b, radiusB), ring(a0, b, radiusB)],
      normal: normalize3(add(scale(bitangent, Math.cos(mid)), scale(normal, Math.sin(mid)))),
    });
  }
  return faces;
}

/** Overlapping scale plate on the sun-facing side. */
function snakeScaleFace(mid, tangent, radius, scaleIdx) {
  const t = normalize3(tangent);
  let up = SUN_DIR;
  const bitangent = normalize3(cross(t, up));
  const n = normalize3(cross(bitangent, t));
  const flip = scaleIdx % 2 === 0 ? 1 : 0.88;
  const r = radius * 1.15 * flip;
  const w = radius * 0.95 * flip;
  const c = add(mid, scale(n, radius * 0.35));
  const v0 = add(c, add(scale(bitangent, -w), scale(t, -r * 0.35)));
  const v1 = add(c, add(scale(bitangent, w), scale(t, -r * 0.35)));
  const v2 = add(c, add(scale(bitangent, w * 0.6), scale(t, r * 0.65)));
  const v3 = add(c, add(scale(bitangent, -w * 0.6), scale(t, r * 0.65)));
  return { verts: [v0, v1, v2, v3], normal: n };
}

/** Sun disc, glow and god-rays. */
function drawSunlight(ctx, width, height, songTime) {
  const pulse = 0.5 + 0.5 * Math.sin((songTime ?? 0) * 0.45);
  const sunX = width * 0.84;
  const sunY = height * 0.1;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let i = 0; i < 9; i++) {
    const spread = -0.55 + i * 0.14 + Math.sin(songTime * 0.18 + i * 1.7) * 0.035;
    const len = Math.hypot(width, height) * 1.15;
    const x2 = sunX + Math.cos(spread) * len;
    const y2 = sunY + Math.sin(spread) * len;
    const beam = ctx.createLinearGradient(sunX, sunY, x2, y2);
    const alpha = 0.04 + pulse * 0.03;
    beam.addColorStop(0, `rgba(255, 235, 160, ${alpha * 2.2})`);
    beam.addColorStop(0.35, `rgba(255, 210, 100, ${alpha})`);
    beam.addColorStop(1, 'rgba(255, 180, 60, 0)');
    ctx.strokeStyle = beam;
    ctx.lineWidth = 28 + i * 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sunX, sunY);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  const halo = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, height * 0.62);
  halo.addColorStop(0, `rgba(255, 248, 210, ${0.5 + pulse * 0.15})`);
  halo.addColorStop(0.12, `rgba(255, 225, 130, ${0.28 + pulse * 0.1})`);
  halo.addColorStop(0.45, 'rgba(255, 200, 80, 0.06)');
  halo.addColorStop(1, 'rgba(255, 180, 50, 0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  const core = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 36 + pulse * 10);
  core.addColorStop(0, '#fffef5');
  core.addColorStop(0.35, '#ffe9a0');
  core.addColorStop(1, 'rgba(255, 200, 60, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 40 + pulse * 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
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

function projectFace(face, color, width, height, cameraZoom) {
  if (face.normal[2] <= 0.02) return null;
  const projected = zoomProjectedPoints(
    face.verts.map((v) => projectPoint(v, width, height)),
    width,
    height,
    cameraZoom,
  );
  const avgZ = projected.reduce((acc, p) => acc + p.z, 0) / projected.length;
  return { avgZ, projected, fill: sunSnakeShade(color, face.normal) };
}

/**
 * @param {{x:number,y:number}[]} points
 * @param {string} color
 * @param {number} baseRadius
 * @param {number} width
 * @param {number} height
 * @param {number} pathSeed
 * @param {number} colorIdx
 * @param {number} songTime
 * @param {number} cameraZoom
 * @param {boolean} isActiveChain
 */
function collectSnakeDrawables(points, color, baseRadius, width, height, pathSeed, colorIdx, songTime, cameraZoom, isActiveChain, motionParams) {
  const amp = livingSongAmp(motionParams);
  const n = points.length;
  const lifted = points.map((p, i) => {
    const pathT = n > 1 ? i / (n - 1) : 0;
    let pt = liftSnakePoint(p.x, p.y, width, height, pathT, pathSeed, colorIdx, amp);
    pt = applySceneTilt(pt, songTime, motionParams);
    return applyLivingSongWobble3d(pt, motionParams, baseRadius * 12);
  });

  /** @type {{ avgZ: number, projected: { x: number, y: number }[], fill: string }[]} */
  const drawables = [];
  /** @type {{ avgZ: number, x: number, y: number, radius: number, tangent: number[], color: string } | null} */
  let head = null;

  for (let i = 0; i < lifted.length - 1; i++) {
    const pathT = i / Math.max(1, lifted.length - 2);
    const taper = 0.38 + 0.62 * pathT;
    const rA = baseRadius * taper;
    const rB = baseRadius * (0.38 + 0.62 * ((i + 1) / Math.max(1, lifted.length - 2)));
    const tangent = [
      lifted[i + 1][0] - lifted[i][0],
      lifted[i + 1][1] - lifted[i][1],
      lifted[i + 1][2] - lifted[i][2],
    ];
    const faces = snakeSegmentFaces(lifted[i], lifted[i + 1], rA, rB);
    for (const face of faces) {
      const d = projectFace(face, color, width, height, cameraZoom);
      if (d) drawables.push(d);
    }

    if (i % 2 === 0) {
      const mid = [
        (lifted[i][0] + lifted[i + 1][0]) * 0.5,
        (lifted[i][1] + lifted[i + 1][1]) * 0.5,
        (lifted[i][2] + lifted[i + 1][2]) * 0.5,
      ];
      const scaleFace = snakeScaleFace(mid, tangent, (rA + rB) * 0.5, i);
      const sd = projectFace(scaleFace, color, width, height, cameraZoom);
      if (sd) {
        sd.fill = sunSnakeShade(color, scaleFace.normal);
        drawables.push(sd);
      }
    }

    if (i === lifted.length - 2) {
      const tip = lifted[i + 1];
      const proj = zoomProjectedPoints(
        [projectPoint(tip, width, height)],
        width,
        height,
        cameraZoom,
      )[0];
      head = {
        avgZ: proj.z,
        x: proj.x,
        y: proj.y,
        radius: rB * projectPoint(tip, width, height).p * 1.45,
        tangent: tangent,
        color,
      };
    }
  }

  return { drawables, head: isActiveChain ? head : null };
}

/** @param {CanvasRenderingContext2D} ctx @param {{ avgZ: number, x: number, y: number, radius: number } | null} head @param {string} color */
function drawSnakeHead(ctx, head, color) {
  if (!head) return;
  const { r, g, b } = parseRgb(color);
  const hr = head.radius;

  ctx.save();
  ctx.globalAlpha = 1;
  const grad = ctx.createRadialGradient(
    head.x - hr * 0.25,
    head.y - hr * 0.3,
    hr * 0.1,
    head.x,
    head.y,
    hr,
  );
  grad.addColorStop(0, `rgb(${Math.min(255, r + 90)}, ${Math.min(255, g + 70)}, ${b})`);
  grad.addColorStop(0.55, color);
  grad.addColorStop(1, `rgb(${Math.round(r * 0.55)}, ${Math.round(g * 0.5)}, ${Math.round(b * 0.48)})`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.ellipse(head.x, head.y, hr * 1.15, hr * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();

  const eyeR = Math.max(2, hr * 0.14);
  ctx.fillStyle = '#1a1510';
  ctx.beginPath();
  ctx.arc(head.x - hr * 0.35, head.y - hr * 0.15, eyeR, 0, Math.PI * 2);
  ctx.arc(head.x + hr * 0.35, head.y - hr * 0.15, eyeR * 0.85, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,240,0.85)';
  ctx.beginPath();
  ctx.arc(head.x - hr * 0.38, head.y - hr * 0.2, eyeR * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawVisualLivingSongSnake(scene, ctx) {
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

  drawSunlight(ctx, width, height, songTime);

  /** @type {{ avgZ: number, projected: { x: number, y: number }[], fill: string }[]} */
  const allDrawables = [];
  /** @type {{ head: { avgZ: number, x: number, y: number, radius: number, color: string } | null, color: string }[]} */
  const heads = [];

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
        const isActive = chainIdx === chains.length - 1;
        const segProgress = isActive ? progress.localProgress : 1;
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
        const radius = baseWidth * widthScale * 0.5 * sizeMul;
        const { drawables, head } = collectSnakeDrawables(
          points,
          color,
          radius,
          width,
          height,
          river.pathSeed,
          colorIdx,
          songTime,
          cameraZoom,
          isActive,
          motionParams,
        );
        allDrawables.push(...drawables);
        if (head) heads.push({ head, color: head.color });
      });
    }
  }

  paintSortedFaces(ctx, allDrawables);

  heads.sort((a, b) => (a.head?.avgZ ?? 0) - (b.head?.avgZ ?? 0));
  for (const { head, color } of heads) {
    drawSnakeHead(ctx, head, color);
  }

  return true;
}
