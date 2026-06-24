import { projectPoint, rotateEuler } from '../math3d.js';
import { normalizeGlobeShapeMode } from '../globeShapeModes.js';
import { globeDetailParams, normalizeGlobeDetail } from '../globeDetail.js';
import { normalizeGlobeTubeProfile } from '../globeTubeProfile.js';
import {
  livingSongGlobePaths,
  livingSongGlobeThreadProgress,
  livingSongRiverProgress,
  livingSongWidthScale,
  globeRadius,
  globeEmergence,
} from './livingSongGlobeConcept.js';
import { getGlobeCapsuleField } from './globeCapsuleField.js';
import { livingSnakeLaneRiver } from '../livingSnakeLanes.js';
import { livingSnakeColor, parseRgb, sceneCameraZoom, zoomProjectedPoints } from '../sceneCore/drawHelpers.js';
import {
  elementMotionScale,
  elementTurnScale,
  element3dScale,
  elementSizeMultiplier,
  resolveLivingElementCount,
} from '../elementMotion.js';
import {
  globeElementLayout,
  livingMotionScale,
  positionGlobeElementChain,
  resolveLivingRiverCount,
  resolveGlobeLayoutsWithBalloons,
} from '../livingSongDrawHelpers.js';

const SUN_DIR = normalize3([0.38, -0.74, 0.55]);
const MAX_TUBE_POINTS = 140;
const CAPSULE_TUBE_SIDES = 8;
const PROOF_MAX_CAPSULE_FACES = 52000;

function hash01(seed, salt = 0) {
  const h = ((seed * 73856093) ^ (salt * 19349663)) >>> 0;
  return (h & 0xffff) / 0xffff;
}

/** Mixed palette — stable color over long thread bands, woven across chains. */
function mixedGlobeColorIdx(mixSeed, chainIdx, segIdx, paletteLen) {
  const block = Math.floor(segIdx / 16);
  const ci = Math.floor(hash01(mixSeed, chainIdx * 61 + block * 29) * paletteLen) % Math.max(1, paletteLen);
  return (ci + block) % Math.max(1, paletteLen);
}

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

function directionalShade(baseCss, normal) {
  const { r, g, b } = parseRgb(baseCss);
  const ndotl = dot(normal, SUN_DIR);
  const lit = Math.max(0, ndotl);
  const shadow = Math.max(0, -ndotl);
  const shade = 0.36 + lit * 0.62 - shadow * 0.28;
  const wr = Math.min(255, r * shade + lit * 58);
  const wg = Math.min(255, g * shade + lit * 40);
  const wb = Math.min(255, b * shade * (1 - lit * 0.14));
  return `rgb(${Math.round(wr)}, ${Math.round(wg)}, ${Math.round(wb)})`;
}

/** Spin angles from Spin intensity + Element turn sliders (same formula as geometric shapes). */
function globeElementSpinAngles(songTime, objectIdx, pathSeed, variation, emergence) {
  const spin = (variation.spinIntensity ?? 50) / 100;
  const turn = elementTurnScale(variation);
  const motion = elementMotionScale(variation);
  const speedSpread = (variation.speedSpread ?? 45) / 100;
  const spinMul = (0.35 + spin * 0.85) * turn * motion;
  const seed = ((pathSeed ?? 42) + objectIdx * 997) * 0.013;
  const t = songTime ?? 0;
  const hold = Math.max(0.2, 1 - (emergence ?? 0) * 0.25);

  return {
    rx: (Math.sin(seed) * 0.18 + 0.06) * spinMul * (0.45 + speedSpread) * t * hold,
    ry: t * spinMul * (0.55 + speedSpread * 0.4) * (0.75 + (seed % 1) * 0.35) * hold,
    rz: (Math.cos(seed * 1.4) * 0.14 + 0.04) * spinMul * (0.45 + speedSpread) * t * hold,
  };
}

function rotateAroundCenter(point, center, rx, ry, rz) {
  const rel = [point[0] - center[0], point[1] - center[1], point[2] - center[2]];
  const rotated = rotateEuler(rel, rx, ry, rz);
  return [rotated[0] + center[0], rotated[1] + center[1], rotated[2] + center[2]];
}

function globeDrawZoom(scene, songTime, variationSeed) {
  const base = sceneCameraZoom(scene);
  const t = songTime ?? 0;
  const seed = (variationSeed ?? 42) * 0.017;
  const breathe =
    Math.sin(t * 0.13 + seed) * 7 +
    Math.sin(t * 0.29 + seed * 2.1) * 4 +
    Math.sin(t * 0.05 + seed * 0.6) * 2.5;
  return Math.min(100, Math.max(0, base + breathe));
}

function transformTubePoint(point, songTime, colorIdx, variationSeed, baseRadius, variation, emergence = 0) {
  const t = songTime ?? 0;
  const ci = colorIdx ?? 0;
  const seed = (variationSeed ?? 42) * 0.001;
  const hold = Math.max(0, 1 - (emergence ?? 0) * 1.05);
  const motion = elementMotionScale(variation) * hold;
  const turn = elementTurnScale(variation) * hold;
  const dim3 = element3dScale(variation) * hold;

  let p = rotateEuler(
    point,
    Math.sin(t * 0.08 + ci * 0.4 + seed) * 0.15 * turn * motion,
    (t * 0.1 + ci * 0.75 + seed * 2) * turn * motion,
    Math.cos(t * 0.06 + ci * 0.25 + seed) * 0.1 * turn * motion,
  );

  const drift = hold * hold;
  const wobble = [
    Math.sin(t * 0.09 + seed) * baseRadius * 0.028 * dim3 * motion * drift,
    Math.cos(t * 0.11 + seed * 1.4) * baseRadius * 0.022 * dim3 * motion * drift,
    Math.sin(t * 0.08 + ci * 0.5 + seed) * baseRadius * 0.025 * dim3 * motion * drift,
  ];
  return add(p, wobble);
}

function segmentFrame(a, b) {
  const t = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  let up = [0, 1, 0];
  if (Math.abs(t[1]) > 0.95) up = [1, 0, 0];
  const bitangent = normalize3(cross(t, up));
  const normal = normalize3(cross(bitangent, t));
  return { bitangent, normal };
}

function tubeSegmentFaces(a, b, radiusA, radiusB, tubeSides) {
  const sides = Math.max(8, tubeSides ?? 10);
  const frame = segmentFrame(a, b);
  if (!frame) return [];

  const { bitangent, normal } = frame;
  const ring = (ang, pt, r) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const off = add(scale(bitangent, c * r), scale(normal, s * r));
    return add(pt, off);
  };

  const faces = [];
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    const mid = (a0 + a1) * 0.5;
    faces.push({
      verts: [ring(a0, a, radiusA), ring(a1, a, radiusA), ring(a1, b, radiusB), ring(a0, b, radiusB)],
      normal: normalize3(add(scale(bitangent, Math.cos(mid)), scale(normal, Math.sin(mid)))),
    });
  }
  return faces;
}

function squareSegmentFaces(a, b, radiusA, radiusB) {
  const frame = segmentFrame(a, b);
  if (!frame) return [];
  const { bitangent, normal } = frame;
  const ring = (pt, r) => [
    add(pt, add(scale(bitangent, r), scale(normal, r))),
    add(pt, add(scale(bitangent, -r), scale(normal, r))),
    add(pt, add(scale(bitangent, -r), scale(normal, -r))),
    add(pt, add(scale(bitangent, r), scale(normal, -r))),
  ];
  const aRing = ring(a, radiusA);
  const bRing = ring(b, radiusB);
  return [
    { verts: [aRing[0], aRing[1], bRing[1], bRing[0]], normal: normal },
    { verts: [aRing[1], aRing[2], bRing[2], bRing[1]], normal: scale(bitangent, -1) },
    { verts: [aRing[2], aRing[3], bRing[3], bRing[2]], normal: scale(normal, -1) },
    { verts: [aRing[3], aRing[0], bRing[0], bRing[3]], normal: bitangent },
  ];
}

function profileSegmentFaces(a, b, radiusA, radiusB, tubeSides, profile) {
  if (profile === 'square') return squareSegmentFaces(a, b, radiusA, radiusB);
  return tubeSegmentFaces(a, b, radiusA, radiusB, tubeSides);
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
  return { avgZ, projected, fill: directionalShade(color, face.normal) };
}

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
    ctx.globalAlpha = d.alpha ?? 1;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function decimateChain(chain, maxPoints = MAX_TUBE_POINTS) {
  if (chain.length <= maxPoints) return chain;
  const out = [chain[0]];
  const step = (chain.length - 1) / (maxPoints - 1);
  for (let i = 1; i < maxPoints - 1; i++) {
    out.push(chain[Math.min(chain.length - 1, Math.round(i * step))]);
  }
  out.push(chain[chain.length - 1]);
  return out;
}

function effectiveGlobePathDetail(globeDetail, elementCount) {
  const d = normalizeGlobeDetail(globeDetail);
  const cap = Math.round(22 + elementCount * 14);
  return Math.min(d, cap);
}

function smoothstep01(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** 0–1 length growth — band appears late in sequence, grows to full length by song end. */
function bandGrowProgress(songTime, songDuration, rank, count, startDelayRatio = 0) {
  if (!songDuration || songDuration <= 0) return 0;
  const lag = (startDelayRatio ?? 0) * songDuration;
  const songP = Math.min(1, Math.max(0, (songTime - lag) / Math.max(1, songDuration - lag)));
  const rankT = count > 1 ? rank / (count - 1) : 0;
  const appearAt = rankT * 0.94;
  if (songP <= appearAt) return 0;
  return smoothstep01((songP - appearAt) / Math.max(0.04, 1 - appearAt));
}

/** Crawl along sphere shell — tangent steps re-projected to surface (thread, not radial spike). */
function geodesicSurfaceBand(nx, ny, nz, tx, ty, tz, R, bandLen, steps = 16) {
  const n = normalize3([nx, ny, nz]);
  let dir = normalize3([tx, ty, tz]);
  const dotND = dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2];
  dir = normalize3([dir[0] - dotND * n[0], dir[1] - dotND * n[1], dir[2] - dotND * n[2]]);
  const segLen = bandLen / Math.max(1, steps);
  /** @type {number[][]} */
  const points = [[n[0] * R, n[1] * R, n[2] * R]];
  let pos = points[0];
  for (let i = 0; i < steps; i++) {
    let next = add(pos, scale(dir, segLen));
    const len = Math.hypot(next[0], next[1], next[2]) || R;
    next = [next[0] / len * R, next[1] / len * R, next[2] / len * R];
    const nn = normalize3(next);
    const dotDN = dir[0] * nn[0] + dir[1] * nn[1] + dir[2] * nn[2];
    dir = normalize3([dir[0] - dotDN * nn[0], dir[1] - dotDN * nn[1], dir[2] - dotDN * nn[2]]);
    pos = next;
    points.push(pos);
  }
  return points;
}

/**
 * Dense sphere — each band grows from a shell dot along its tangent (0 → full length).
 */
function drawGrowingDenseGlobe({
  palette,
  layout,
  sizeMul,
  shapeR,
  globeDetail,
  objectCount,
  pathSeed,
  songTime,
  songDuration,
  startDelayRatio,
  emergence,
  variation,
  variationSeed,
  spinCenter,
  spinAngles,
  tubeProfile,
  cameraZoom,
  width,
  height,
  tubeSides,
  allDrawables,
}) {
  const capsules = getGlobeCapsuleField(pathSeed, globeDetail, palette.length, objectCount);
  const R = shapeR * layout.scale * sizeMul;
  const spacing = Math.sqrt((4 * Math.PI * R * R) / Math.max(1, capsules.length));
  const baseTubeR = spacing * 0.44;
  const capLen = spacing * 5.2;
  const maxDraw = Math.max(400, Math.floor(PROOF_MAX_CAPSULE_FACES / Math.max(1, objectCount) / Math.max(8, tubeSides)));
  const stride = capsules.length > maxDraw ? Math.ceil(capsules.length / maxDraw) : 1;
  let bandLenSum = 0;
  let growSum = 0;
  let activeBands = 0;

  for (let i = 0; i < capsules.length; i += stride) {
    const cap = capsules[i];
    const growP = bandGrowProgress(songTime, songDuration, cap.rank, capsules.length, startDelayRatio);
    if (growP <= 0.001) continue;

    const fullLen = capLen * cap.lengthMul;
    const bandLen = fullLen * growP;
    if (bandLen < 2) continue;

    activeBands++;
    bandLenSum += bandLen;
    growSum += growP;

    const tubeR = baseTubeR * cap.radiusMul * (0.4 + 0.6 * growP);
    const steps = Math.max(6, Math.min(28, Math.round(bandLen / (spacing * 0.55))));
    const localChain = geodesicSurfaceBand(cap.nx, cap.ny, cap.nz, cap.tx, cap.ty, cap.tz, R, bandLen, steps);
    const chain = localChain.map((p) => [
      p[0] + layout.offset[0],
      p[1] + layout.offset[1],
      p[2] + layout.offset[2],
    ]);

    const tubes = collectTubeDrawables(
      chain,
      palette,
      pathSeed,
      cap.rank,
      tubeR,
      width,
      height,
      songTime,
      cap.colorIdx,
      cameraZoom,
      variationSeed,
      shapeR,
      tubeSides,
      tubeProfile,
      variation,
      emergence,
      spinCenter,
      spinAngles,
    );
    allDrawables.push(...tubes);
  }

  const songP = songDuration > 0 ? songTime / songDuration : 0;
  return {
    mode: 'growing-dense',
    capsuleCount: capsules.length,
    activeBands,
    avgGrowP: activeBands > 0 ? growSum / activeBands : 0,
    avgBandLen: activeBands > 0 ? bandLenSum / activeBands : 0,
    fullBandLen: capLen,
    gapRatio: spacing / Math.max(0.001, baseTubeR * 2),
    songProgress: songP,
    stride,
  };
}

function collectTubeDrawables(
  chain,
  palette,
  mixSeed,
  chainIdx,
  baseRadius,
  width,
  height,
  songTime,
  colorIdx,
  cameraZoom,
  variationSeed,
  shapeRadius,
  tubeSides,
  tubeProfile,
  variation,
  emergence,
  spinCenter,
  spinAngles,
  fixedColor = false,
) {
  const paletteLen = Math.max(1, palette?.length ?? 1);
  const lifted = chain.map((p) => {
    const spun = spinCenter && spinAngles
      ? rotateAroundCenter(p, spinCenter, spinAngles.rx, spinAngles.ry, spinAngles.rz)
      : p;
    return transformTubePoint(spun, songTime, colorIdx, variationSeed, shapeRadius, variation, emergence);
  });
  const drawables = [];
  const n = lifted.length;

  for (let i = 0; i < n - 1; i++) {
    const ci = fixedColor ? colorIdx : (paletteLen > 1 ? mixedGlobeColorIdx(mixSeed, chainIdx, i, paletteLen) : colorIdx);
    const color = livingSnakeColor(palette, ci, 0);
    const pathT = i / Math.max(1, n - 2);
    const taper = 0.78 + 0.22 * pathT;
    const rA = baseRadius * taper;
    const rB = baseRadius * (0.78 + 0.22 * ((i + 1) / Math.max(1, n - 2)));
    for (const face of profileSegmentFaces(lifted[i], lifted[i + 1], rA, rB, tubeSides, tubeProfile)) {
      const d = projectFace(face, color, width, height, cameraZoom);
      if (d) drawables.push(d);
    }
  }
  return drawables;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawVisualLivingSongGlobe(scene, ctx) {
  const state = scene._conceptState ?? { beatPulse: 0, rivers: [], songTime: 0, songDuration: 0, animationSpeed: 1 };
  const pulse = state.beatPulse ?? 0;
  const slowPulse = state.slowWidthPulse ?? 0.5;
  const energy = state.smoothEnergy ?? 0;
  const songTime = state.songTime ?? 0;
  const songDuration = state.songDuration ?? 0;
  const animationSpeed = state.animationSpeed ?? scene.variation?.animationSpeed ?? 1;
  const variationSeed = state.variationSeed ?? scene.variation?.seed ?? 42;
  const shapeId = normalizeGlobeShapeMode(scene.variation?.globeShapeMode);
  const globeDetail = normalizeGlobeDetail(scene.variation?.globeDetail);
  const tubeProfile = normalizeGlobeTubeProfile(scene.variation?.globeTubeProfile);
  const { tubeSides } = globeDetailParams(globeDetail);
  const tubeSidesDraw = Math.max(12, tubeSides);
  const { width, height, palette } = scene;
  const cameraZoom = globeDrawZoom(scene, songTime, variationSeed);
  const shapeR = globeRadius(width, height);
  const variation = scene.variation ?? {};
  const unicolor = !!variation.elementUnicolor;
  const motionScale = livingMotionScale(variation);
  const rivers = resolveLivingRiverCount(scene, state);
  const baseWidth = Math.max(6, width * 0.0066);
  const objectCount = resolveLivingElementCount(variation, palette.length);
  const laneCount = unicolor ? 1 : Math.max(1, palette.length);
  const emergence = globeEmergence(songTime, songDuration);
  const pathDetail = effectiveGlobePathDetail(globeDetail, objectCount);
  const useGrowingCapsules = shapeId === 'sphere' && !!variation.globeDenseProof;
  const useThreeThreads = shapeId === 'sphere' && !useGrowingCapsules;
  const threadLaneCount = useThreeThreads ? Math.min(3, Math.max(1, palette.length)) : laneCount;
  const growDuration = songDuration > 0 ? songDuration : 180;

  const allDrawables = [];
  const mot = livingMotionScale(variation);
  const layouts = resolveGlobeLayoutsWithBalloons(scene, state, rivers, mot, 1 / 30);

  let totalChains = 0;
  let growStats = null;

  if (useGrowingCapsules) {
    for (let objectIdx = 0; objectIdx < objectCount; objectIdx++) {
      const baseRiver = rivers[objectIdx] ?? rivers[0];
      const layout = layouts[objectIdx] ?? globeElementLayout(objectIdx, objectCount, baseRiver.pathSeed, shapeR);
      const sizeMul = elementSizeMultiplier(variation, objectIdx, objectCount);
      const spinCenter = layout.offset;
      const spinAngles = globeElementSpinAngles(songTime, objectIdx, baseRiver.pathSeed ?? 42, variation, emergence);
      const delay = baseRiver.startDelayRatio ?? (objectIdx > 0 ? objectIdx * 0.04 : 0);
      growStats = drawGrowingDenseGlobe({
        palette,
        layout,
        sizeMul,
        shapeR,
        globeDetail,
        objectCount,
        pathSeed: baseRiver.pathSeed ?? 42,
        songTime,
        songDuration: growDuration,
        startDelayRatio: delay,
        emergence,
        variation,
        variationSeed,
        spinCenter,
        spinAngles,
        tubeProfile,
        cameraZoom,
        width,
        height,
        tubeSidesDraw,
        allDrawables,
      });
    }
  } else for (let objectIdx = 0; objectIdx < objectCount; objectIdx++) {
    const baseRiver = rivers[objectIdx] ?? rivers[0];
    const layout = layouts[objectIdx] ?? globeElementLayout(objectIdx, objectCount, baseRiver.pathSeed, shapeR);
    const sizeMul = elementSizeMultiplier(variation, objectIdx, objectCount);
    const lanesThisObject = useThreeThreads ? threadLaneCount : laneCount;
    const lineRadiusMul = useThreeThreads
      ? 0.32 + (globeDetail / 100) * 0.38
      : 0.2 + (globeDetail / 100) * 0.26;
    const fillBoost = useThreeThreads ? 0.95 + emergence * 0.95 : 0.9 + emergence * 0.78;
    const spinCenter = layout.offset;
    const spinAngles = globeElementSpinAngles(songTime, objectIdx, baseRiver.pathSeed ?? 42, variation, emergence);

    for (let lane = 0; lane < lanesThisObject; lane++) {
      const river = {
        ...livingSnakeLaneRiver(baseRiver, objectIdx, lane, unicolor, lanesThisObject),
        segmentDurationMul: useThreeThreads ? 0.92 : 1,
        globeLanePhase: useThreeThreads && lanesThisObject > 1 ? lane / lanesThisObject : undefined,
      };
      const colorIdx = useThreeThreads ? lane % Math.max(1, palette.length) : (unicolor ? (baseRiver.colorIdx ?? objectIdx) : lane);
      const mixSeed = (river.pathSeed ?? 42) + objectIdx * 131;
      const riverProgress = useThreeThreads
        ? livingSongGlobeThreadProgress(songTime, animationSpeed, songDuration, river)
        : livingSongRiverProgress(songTime, animationSpeed, songDuration, river);
      if (!riverProgress.started) continue;

      const { chains } = livingSongGlobePaths(
        width,
        height,
        songTime,
        animationSpeed,
        songDuration,
        river,
        shapeId,
        pathDetail,
      );

      totalChains += chains.length;

      chains.forEach((chain, chainIdx) => {
        if (chain.length < 2) return;
        const positioned = decimateChain(positionGlobeElementChain(chain, layout));
        const isActive = chainIdx === chains.length - 1;
        const segProgress = isActive ? riverProgress.localProgress : 1;
        const tubeWidthScale = livingSongWidthScale(
          river,
          songTime,
          songDuration,
          pulse,
          slowPulse,
          energy,
          segProgress,
          motionScale,
        );
        const radius = baseWidth * tubeWidthScale * lineRadiusMul * (0.75 + layout.scale * 0.35) * sizeMul * fillBoost;
        const tubes = collectTubeDrawables(
          positioned,
          palette,
          mixSeed,
          chainIdx,
          radius,
          width,
          height,
          songTime,
          colorIdx,
          cameraZoom,
          variationSeed,
          shapeR,
          tubeSidesDraw,
          tubeProfile,
          variation,
          emergence,
          spinCenter,
          spinAngles,
          useThreeThreads,
        );
        allDrawables.push(...tubes);
      });
    }
  }

  paintSortedFaces(ctx, allDrawables);
  return true;
}
