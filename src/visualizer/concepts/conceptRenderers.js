import * as THREE from 'three';
import {
  transformVertex,
  rotateNormal,
  projectPoint,
  shadeFactor,
  buildBoxMesh,
  flatMeshForPreset,
} from '../math3d.js';
import { applyViewZoom, viewZoomMultiplier } from '../viewZoom.js';
import { entityColor, livingSnakeColor, shadeColor, edgeStrokeColor, projectDepth, sceneCameraZoom, zoomProjectedPoints } from '../sceneCore/drawHelpers.js';
import { particleDotWorld } from './particlesConcept.js';
import { origamiFoldAngle } from './origamiConcept.js';
import { cinematicMaterial, updateCinematicMaterial, UNIT as MESH_UNIT } from '../three/shapeFactory.js';
import { applyEntityTransform, paletteColorThree, screenToWorld } from '../sceneCore/cinematicHelpers.js';
import {
  livingSongRiverPaths,
  livingSongRiverProgress,
  livingSongWidthScale,
} from './visualLivingSongConcept.js';
import { drawVisualLivingSong3D } from './livingSong3dDraw.js';
import { drawVisualLivingSongSnake } from './livingSongSnakeDraw.js';
import { drawVisualLivingSongGlobe } from './livingSongGlobeDraw.js';
import { livingMotionScale, livingSongMotionParams, resolveLivingRiverCount, wobbleLivingSongPath2d } from '../livingSongDrawHelpers.js';
import { elementSizeMultiplier, resolveLivingElementCount } from '../elementMotion.js';
import { livingSnakeLaneRiver } from '../livingSnakeLanes.js';

function drawProjectedFaces(lc, drawables, showEdges) {
  for (const d of drawables) {
    const pts = d.projected;
    lc.beginPath();
    lc.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) lc.lineTo(pts[i].x, pts[i].y);
    lc.closePath();
    lc.fillStyle = d.fill;
    lc.fill();
    if (showEdges && d.stroke) {
      lc.strokeStyle = d.stroke;
      lc.lineWidth = 1.1;
      lc.stroke();
    }
  }
}

function meshDrawables(mesh, rot, offset, w, h, baseFill, showEdges, cameraZoom = 50) {
  const drawables = [];
  for (const face of mesh) {
    const worldVerts = face.verts.map((v) => transformVertex(v, rot, offset));
    const viewNormal = rotateNormal(face.normal, rot);
    if (viewNormal[2] <= 0.05) continue;
    const projected = zoomProjectedPoints(
      worldVerts.map((v) => projectPoint(v, w, h)),
      w,
      h,
      cameraZoom,
    );
    const avgZ = projected.reduce((acc, p) => acc + p.z, 0) / projected.length;
    const shade = shadeFactor(viewNormal);
    const fill = shadeColor(baseFill, shade);
    drawables.push({
      avgZ,
      projected,
      fill,
      stroke: showEdges ? edgeStrokeColor(fill) : null,
    });
  }
  drawables.sort((a, b) => a.avgZ - b.avgZ);
  return drawables;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawConceptPopArt(scene, ctx) {
  const concept = scene.variation.visualConcept ?? 'geometric';
  switch (concept) {
    case 'particles':
      return drawParticlesPopArt(scene, ctx);
    case 'typography':
      return drawTypographyPopArt(scene, ctx);
    case 'constellation':
      return drawConstellationPopArt(scene, ctx);
    case 'blobs':
      return drawBlobsPopArt(scene, ctx);
    case 'glassDiscs':
      return drawGlassDiscsPopArt(scene, ctx);
    case 'origami':
      return drawOrigamiPopArt(scene, ctx);
    case 'liquidsOnCanvas':
      return drawLiquidsPopArt(scene, ctx);
    case 'visualLivingSong':
      return drawVisualLivingSongPopArt(scene, ctx);
    case 'visualLivingSong3d':
      return drawVisualLivingSong3D(scene, ctx);
    case 'visualLivingSongSnake':
      return drawVisualLivingSongSnake(scene, ctx);
    case 'visualLivingSongGlobe':
      return drawVisualLivingSongGlobe(scene, ctx);
    default:
      return false;
  }
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawParticlesPopArt(scene, ctx) {
  const { shapes, width, height, palette, colorOffset, damped } = scene;
  const mot = damped.motion;
  const geo = damped.geometry;
  const zoom = sceneCameraZoom(scene);
  const items = [];

  for (const e of shapes) {
    if (!e.conceptData?.dots) continue;
    for (const dot of e.conceptData.dots) {
      const p = particleDotWorld(e, dot, mot, geo);
      const z = applyViewZoom(p.x, p.y, width, height, zoom);
      items.push({
        x: z.x,
        y: z.y,
        z: projectDepth(p.z, e.rotY),
        r: p.size * viewZoomMultiplier(zoom),
        color: entityColor(palette, e.colorIdx, colorOffset),
      });
    }
  }

  items.sort((a, b) => a.z - b.z);
  for (const it of items) {
    ctx.beginPath();
    ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
    ctx.fillStyle = it.color;
    ctx.globalAlpha = 0.88;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawTypographyPopArt(scene, ctx) {
  const { shapes, width, height, palette, colorOffset, variation } = scene;
  const w = width;
  const h = height;
  const showEdges = !!variation.kanten;
  const zoom = sceneCameraZoom(scene);
  const sorted = [...shapes].sort((a, b) => projectDepth(a.z, a.rotY) - projectDepth(b.z, b.rotY));

  for (const e of sorted) {
    const d = e.conceptData;
    if (!d?.columns?.length) continue;
    const baseFill = entityColor(palette, e.colorIdx, colorOffset);
    const sideFill = entityColor(palette, e.colorIdx + 1, colorOffset);
    const scale = (d.displayScale ?? 1) * d.letterScale * e.scale * e.sizeMul * 1.65;
    const standH = Math.max(38, 62 * scale);
    const offset = [e.x - w / 2, e.y - h / 2, e.z];
    const rot = [e.rotX, e.rotY, e.rotZ];
    const footW = d.canvasW * scale;
    const footD = d.hw * 2 * scale * 1.1;
    const drawables = [];

    for (const col of d.columns) {
      const lx = col.ux * footW;
      const lz0 = col.uz0 * footD;
      const lz1 = col.uz1 * footD;
      const cw = Math.max(col.uw * footW, 2);
      const mesh = buildBoxMesh(cw, standH, Math.max(lz1 - lz0, 2), 0);
      const colOffset = [offset[0] + lx, offset[1] + standH * 0.5, offset[2] + (lz0 + lz1) * 0.5];
      drawables.push(...meshDrawables(mesh, rot, colOffset, w, h, baseFill, showEdges, zoom));
      const sideMesh = buildBoxMesh(cw, standH * 0.15, Math.max(lz1 - lz0, 2), 0);
      const sideOffset = [offset[0] + lx, offset[1] + standH * 1.05, offset[2] + (lz0 + lz1) * 0.5];
      drawables.push(...meshDrawables(sideMesh, rot, sideOffset, w, h, sideFill, showEdges, zoom));
    }

    drawables.sort((a, b) => a.avgZ - b.avgZ);
    drawProjectedFaces(ctx, drawables, showEdges);
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawConstellationPopArt(scene, ctx) {
  const { shapes, palette, colorOffset, _conceptState, width, height } = scene;
  const state = _conceptState ?? { edges: [], edgePulse: [] };
  const zoom = sceneCameraZoom(scene);
  const zm = viewZoomMultiplier(zoom);
  const nodes = shapes.map((e) => {
    const z = applyViewZoom(e.x, e.y, width, height, zoom);
    return {
      x: z.x,
      y: z.y,
      z: projectDepth(e.z, e.rotY),
      r: e.conceptData.nodeSize * e.scale * zm,
      color: entityColor(palette, e.colorIdx, colorOffset),
    };
  });

  for (let i = 0; i < state.edges.length; i++) {
    const edge = state.edges[i];
    const a = nodes[edge.a];
    const b = nodes[edge.b];
    if (!a || !b) continue;
    const pulse = state.edgePulse[i] ?? 0;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = entityColor(palette, (edge.a + edge.b) % palette.length, colorOffset);
    ctx.globalAlpha = 0.25 + pulse * 0.55;
    ctx.lineWidth = 1 + pulse * 2.2;
    ctx.stroke();
  }

  nodes.sort((a, b) => a.z - b.z);
  for (const n of nodes) {
    ctx.beginPath();
    ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawBlobsPopArt(scene, ctx) {
  const { shapes, width, height, palette, colorOffset, variation } = scene;
  const showEdges = !!variation.kanten;
  const zoom = sceneCameraZoom(scene);
  const sorted = [...shapes].sort((a, b) => projectDepth(a.z, a.rotY) - projectDepth(b.z, b.rotY));

  for (const e of sorted) {
    const d = e.conceptData;
    if (!d) continue;
    const rx = d.blobRx * e.scale * e.sizeMul * (e.squashX ?? 1);
    const ry = d.blobRy * e.scale * e.sizeMul * (e.squashY ?? 1);
    const rz = d.blobRz * e.scale * e.sizeMul * (e.squashZ ?? 1);
    const mesh = flatMeshForPreset('ellipsoid', rx, ry, rz, 1, true);
    const offset = [
      e.x - width / 2 + (e.wobbleX ?? 0),
      e.y - height / 2 + (e.wobbleY ?? 0),
      e.z + (e.wobbleZ ?? 0),
    ];
    const rot = [e.rotX + (e.tiltX ?? 0), e.rotY, e.rotZ + (e.tiltZ ?? 0)];
    const baseFill = entityColor(palette, e.colorIdx, colorOffset);
    const drawables = meshDrawables(mesh, rot, offset, width, height, baseFill, showEdges, zoom);
    drawProjectedFaces(ctx, drawables, showEdges);
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawGlassDiscsPopArt(scene, ctx) {
  const { shapes, palette, colorOffset, width, height } = scene;
  const zoom = sceneCameraZoom(scene);
  const zm = viewZoomMultiplier(zoom);
  const sorted = [...shapes].sort((a, b) => projectDepth(a.z, a.rotY) - projectDepth(b.z, b.rotY));

  for (const e of sorted) {
    const z = applyViewZoom(e.x, e.y, width, height, zoom);
    const r = e.conceptData.radius * e.scale * zm;
    const base = entityColor(palette, e.colorIdx, colorOffset);
    const grad = ctx.createRadialGradient(z.x - r * 0.25, z.y - r * 0.25, r * 0.1, z.x, z.y, r);
    grad.addColorStop(0, shadeColor(base, 1.08));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, shadeColor(base, 0.72));
    ctx.beginPath();
    ctx.ellipse(z.x, z.y, r, r * (0.55 + Math.abs(Math.sin(e.tiltX ?? 0)) * 0.35), e.rotZ, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.72;
    ctx.fill();
    ctx.strokeStyle = shadeColor(base, 1.15);
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.35;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawOrigamiPopArt(scene, ctx) {
  const { shapes, width, height, palette, colorOffset } = scene;
  const showEdges = true;
  const zoom = sceneCameraZoom(scene);
  const sorted = [...shapes].sort((a, b) => projectDepth(a.z, a.rotY) - projectDepth(b.z, b.rotY));

  for (const e of sorted) {
    const d = e.conceptData;
    if (!d) continue;
    const fold = origamiFoldAngle(e);
    const w = d.paperW * e.scale * e.sizeMul;
    const h = d.paperH * e.scale * e.sizeMul;
    const thick = 8 + fold * 28;
    const mesh = buildBoxMesh(w, thick, h, 0);
    const offset = [e.x - width / 2, e.y - height / 2, e.z];
    const creaseTilt = d.crease === 'x' ? fold * 1.35 : 0;
    const creaseRoll = d.crease === 'y' ? fold * 1.35 : 0;
    const rot = [e.rotX + creaseTilt, e.rotY, e.rotZ + creaseRoll];
    const baseFill = entityColor(palette, e.colorIdx, colorOffset);
    const drawables = meshDrawables(mesh, rot, offset, width, height, baseFill, showEdges, zoom);
    drawProjectedFaces(ctx, drawables, showEdges);
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawLiquidsPopArt(scene, ctx) {
  const sim = scene._conceptState?.sim;
  if (!sim) return false;
  const relief = scene.variation.liquidRelief ?? 45;
  const img = sim.toImageData(relief);
  if (!img) return false;

  if (!scene._liquidCanvas) {
    scene._liquidCanvas = document.createElement('canvas');
  }
  const layer = scene._liquidCanvas;
  if (layer.width !== sim.gridW || layer.height !== sim.gridH) {
    layer.width = sim.gridW;
    layer.height = sim.gridH;
  }
  layer.getContext('2d').putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0, scene.width, scene.height);
  ctx.restore();
  return true;
}

/** @param {CanvasRenderingContext2D} ctx @param {{x:number,y:number}[]} points @param {string} color @param {number} lineWidth */
function strokeLivingRiver(ctx, points, color, lineWidth) {
  if (points.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 1;
  ctx.stroke();
}

/** @param {CanvasRenderingContext2D} ctx @param {{x:number,y:number}[]} points @param {string} color @param {number} baseWidth @param {number} widthScale */
function drawLivingRiver(ctx, points, color, baseWidth, widthScale) {
  if (points.length < 2) return;

  const lineWidth = baseWidth * widthScale;
  const capRadius = lineWidth * 0.5;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = color;
  ctx.strokeStyle = color;

  strokeLivingRiver(ctx, points, color, lineWidth);
  const tip = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, capRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawVisualLivingSongPopArt(scene, ctx) {
  const state = scene._conceptState ?? { beatPulse: 0, rivers: [], songTime: 0, songDuration: 0, animationSpeed: 1 };
  const pulse = state.beatPulse ?? 0;
  const slowPulse = state.slowWidthPulse ?? 0.5;
  const energy = state.smoothEnergy ?? 0;
  const songTime = state.songTime ?? 0;
  const songDuration = state.songDuration ?? 0;
  const animationSpeed = state.animationSpeed ?? scene.variation?.animationSpeed ?? 1;
  const { width, height, palette } = scene;
  const motionScale = livingMotionScale(scene.variation);
  const motionParams = livingSongMotionParams(scene.variation, state);
  const rivers = resolveLivingRiverCount(scene, state);
  const baseWidth = Math.max(6, width * 0.0066);
  const unicolor = !!scene.variation?.elementUnicolor;
  const objectCount = resolveLivingElementCount(scene.variation, palette.length);
  const laneCount = unicolor ? 1 : Math.max(1, palette.length);

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
        ) * sizeMul;
        const wobbled = wobbleLivingSongPath2d(points, motionParams);
        drawLivingRiver(ctx, wobbled, color, baseWidth, widthScale);
      });
    }
  }
  return true;
}

/** @param {CanvasRenderingContext2D} ctx @param {number} width @param {number} height @param {number} letterboxPct 0–100 */
function drawLetterboxOverlay(ctx, width, height, letterboxPct) {
  const bar = Math.round(height * (letterboxPct / 100) * 0.12);
  if (bar < 1) return;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, bar);
  ctx.fillRect(0, height - bar, width, bar);
}

/** @param {CanvasRenderingContext2D} ctx @param {number} width @param {number} height @param {number} vignettePct 0–100 */
function drawVignetteOverlay(ctx, width, height, vignettePct) {
  if (vignettePct <= 0) return;
  const vig = vignettePct / 100;
  const r = Math.min(width, height);
  const gradient = ctx.createRadialGradient(
    width / 2,
    height / 2,
    r * (0.32 - vig * 0.08),
    width / 2,
    height / 2,
    r * (0.68 + vig * 0.32),
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, `rgba(0,0,0,${0.4 + vig * 0.58})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

/** Letterbox + vignette frame overlays (0–100 each). @param {object} scene @param {CanvasRenderingContext2D} ctx */
export function drawLivingSongOverlays(scene, ctx) {
  const s = scene.cinematicSettings ?? {};
  const { width, height } = scene;
  drawVignetteOverlay(ctx, width, height, s.vignette ?? 0);
  drawLetterboxOverlay(ctx, width, height, s.letterbox ?? 0);
}

// --- Cinematic ---

/** @param {object} scene */
export function syncConceptCinematic(scene) {
  const concept = scene.variation.visualConcept ?? 'geometric';
  switch (concept) {
    case 'particles':
      return syncParticlesCinematic(scene);
    case 'typography':
      return syncTypographyCinematic(scene);
    case 'constellation':
      return syncConstellationCinematic(scene);
    case 'blobs':
      return syncBlobsCinematic(scene);
    case 'glassDiscs':
      return syncGlassDiscsCinematic(scene);
    case 'origami':
      return syncOrigamiCinematic(scene);
    case 'liquidsOnCanvas':
      return syncLiquidsCinematic(scene);
    case 'visualLivingSong':
    case 'visualLivingSong3d':
    case 'visualLivingSongSnake':
    case 'visualLivingSongGlobe':
      return syncVisualLivingSongCinematic(scene);
    default:
      return false;
  }
}

/** @param {object} scene */
export function clearConceptObjects(scene) {
  if (scene._conceptLineMesh) {
    scene._conceptLineMesh.geometry?.dispose();
    scene._conceptLineMesh.material?.dispose();
    scene._shapeRoot?.remove(scene._conceptLineMesh);
    scene._conceptLineMesh = null;
  }
  if (scene._conceptObjects) {
    for (const obj of scene._conceptObjects) {
      scene._shapeRoot?.remove(obj);
      obj.traverse?.((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
          else child.material.dispose();
        }
      });
    }
    scene._conceptObjects = [];
  }
  scene._meshByShape = new Map();
}

/** @param {object} scene */
export function disposeConceptCinematic(scene) {
  clearConceptObjects(scene);
}

function materialOpts(scene) {
  const s = scene.cinematicSettings;
  return {
    metalness: s.metalness,
    roughness: s.roughness,
    emissive: s.emissive,
    trueColors: !!s.trueColors,
  };
}

/** @param {object} scene */
function syncParticlesCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();

  for (const e of scene.shapes) {
    if (!e.conceptData?.dots) continue;
    const group = new THREE.Group();
    const dots = e.conceptData.dots;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const geo = new THREE.SphereGeometry(1, 10, 10);
      const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset);
      const mat = cinematicMaterial(color, materialOpts(scene));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.dotIndex = i;
      mesh.userData.baseSize = dot.size * MESH_UNIT * 0.55;
      group.add(mesh);
    }
    scene._shapeRoot.add(group);
    scene._meshByShape.set(e, group);
    scene._conceptObjects.push(group);
  }
  applyConceptTransforms(scene);
  return true;
}

/** @param {object} scene */
function syncTypographyCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();

  for (const e of scene.shapes) {
    const group = new THREE.Group();
    const d = e.conceptData;
    if (!d?.columns?.length) continue;
    const letterScale = (d.letterScale ?? 1) * 0.013;
    const standH = 0.62;
    const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset);
    const mat = cinematicMaterial(color, materialOpts(scene));

    for (const col of d.columns) {
      const cw = Math.max(col.uw * d.canvasW * letterScale, 0.03);
      const depth = Math.max((col.uz1 - col.uz0) * d.canvasW * letterScale, 0.03);
      const geo = new THREE.BoxGeometry(cw, standH, depth);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(col.ux * d.canvasW * letterScale, standH * 0.5, (col.uz0 + col.uz1) * 0.5 * d.canvasW * letterScale * 0.55);
      mesh.castShadow = true;
      group.add(mesh);
    }

    scene._shapeRoot.add(group);
    scene._meshByShape.set(e, group);
    scene._conceptObjects.push(group);
  }
  applyConceptTransforms(scene);
  return true;
}

/** @param {object} scene */
function syncConstellationCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();
  const state = scene._conceptState ?? { edges: [] };

  const positions = [];
  for (const e of scene.shapes) {
    positions.push(e.x, e.y, e.z);
    const geo = new THREE.SphereGeometry((e.conceptData.nodeSize ?? 6) * MESH_UNIT * 0.85, 12, 12);
    const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset);
    const mat = cinematicMaterial(color, materialOpts(scene));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    scene._shapeRoot.add(mesh);
    scene._meshByShape.set(e, mesh);
    scene._conceptObjects.push(mesh);
  }

  const linePositions = [];
  for (const edge of state.edges) {
    const a = scene.shapes[edge.a];
    const b = scene.shapes[edge.b];
    if (!a || !b) continue;
    const wa = screenToWorld(a.x, a.y, a.z, scene.width, scene.height);
    const wb = screenToWorld(b.x, b.y, b.z, scene.width, scene.height);
    linePositions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
  }

  if (linePositions.length) {
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x8899bb, transparent: true, opacity: 0.35 });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    scene._shapeRoot.add(lines);
    scene._conceptLineMesh = lines;
    scene._conceptObjects.push(lines);
  }

  applyConceptTransforms(scene);
  return true;
}

/** @param {object} scene */
function syncBlobsCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();

  for (const e of scene.shapes) {
    const d = e.conceptData;
    if (!d) continue;
    const sm = e.sizeMul ?? 1;
    const sx = d.blobRx * MESH_UNIT * sm;
    const sy = d.blobRy * MESH_UNIT * sm;
    const sz = d.blobRz * MESH_UNIT * sm;
    const geo = new THREE.SphereGeometry(1, 32, 24);
    geo.scale(sx, sy, sz);
    const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset);
    const mat = cinematicMaterial(color, materialOpts(scene));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.blobRx = d.blobRx;
    mesh.userData.blobRy = d.blobRy;
    mesh.userData.blobRz = d.blobRz;
    scene._shapeRoot.add(mesh);
    scene._meshByShape.set(e, mesh);
    scene._conceptObjects.push(mesh);
  }
  applyConceptTransforms(scene);
  return true;
}

/** @param {object} scene */
function syncGlassDiscsCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();

  for (const e of scene.shapes) {
    const geo = new THREE.CircleGeometry(e.conceptData.radius * MESH_UNIT * 0.85, 48);
    const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset);
    const opts = materialOpts(scene);
    const mat = new THREE.MeshPhysicalMaterial({
      color,
      metalness: (opts.metalness ?? 18) / 100 * 0.4,
      roughness: Math.max(0.05, (opts.roughness ?? 16) / 100 * 0.35),
      transmission: 0.72,
      thickness: 0.4,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene._shapeRoot.add(mesh);
    scene._meshByShape.set(e, mesh);
    scene._conceptObjects.push(mesh);
  }
  applyConceptTransforms(scene);
  return true;
}

function updateLiquidMeshFromSim(scene) {
  const sim = scene._conceptState?.sim;
  const mesh = scene._conceptState?.mesh;
  if (!sim || !mesh?.geometry) return;

  const relief = (scene.variation.liquidRelief ?? 45) / 100;
  const maxDisp = 0.25 + relief * 1.15;
  const positions = mesh.geometry.attributes.position;
  const colors = mesh.geometry.attributes.color;
  const w = sim.gridW;
  const h = sim.gridH;

  for (let y = 0; y < h; y++) {
    const iy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const simIdx = y * w + x;
      const vi = iy * w + x;
      const ht = sim.height[simIdx];
      positions.setZ(vi, ht * maxDisp);
      const boost = ht > 0.02 ? 0.35 + Math.min(1, ht) * 0.65 : 0;
      colors.setXYZ(
        vi,
        sim.r[simIdx] * boost,
        sim.g[simIdx] * boost,
        sim.b[simIdx] * boost,
      );
    }
  }

  positions.needsUpdate = true;
  colors.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
}

/** @param {object} scene */
function syncLiquidsCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();

  const sim = scene._conceptState?.sim;
  if (!sim) return false;

  const planeW = scene.width * MESH_UNIT * 0.95;
  const planeH = scene.height * MESH_UNIT * 0.95;
  const geo = new THREE.PlaneGeometry(planeW, planeH, sim.gridW - 1, sim.gridH - 1);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(geo.attributes.position.count * 3, 3));

  const s = scene.cinematicSettings ?? {};
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: Math.max(0.35, (s.roughness ?? 16) / 100 * 0.9),
    metalness: (s.metalness ?? 18) / 100 * 0.25,
    emissive: new THREE.Color(0.15, 0.06, 0.02),
    emissiveIntensity: 0.35 + (scene.variation.liquidRelief ?? 45) / 200,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -0.12;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene._shapeRoot.add(mesh);
  scene._conceptObjects.push(mesh);
  scene._conceptState.mesh = mesh;
  updateLiquidMeshFromSim(scene);
  return true;
}

/** @param {object} scene */
function syncVisualLivingSongCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();
  return true;
}

/** @param {object} scene */
function syncOrigamiCinematic(scene) {
  clearConceptObjects(scene);
  scene._conceptObjects = [];
  scene._meshByShape = new Map();

  for (const e of scene.shapes) {
    const d = e.conceptData;
    if (!d) continue;
    const sm = e.sizeMul ?? 1;
    const geo = new THREE.BoxGeometry(d.paperW * MESH_UNIT * sm, 0.22, d.paperH * MESH_UNIT * sm);
    const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset);
    const mat = cinematicMaterial(color, { ...materialOpts(scene), roughness: Math.max(40, scene.cinematicSettings.roughness) });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene._shapeRoot.add(mesh);
    scene._meshByShape.set(e, mesh);
    scene._conceptObjects.push(mesh);
  }
  applyConceptTransforms(scene);
  return true;
}

/** @param {object} scene */
export function applyConceptTransforms(scene) {
  const concept = scene.variation.visualConcept ?? 'geometric';
  if (concept === 'liquidsOnCanvas') {
    updateLiquidMeshFromSim(scene);
    return;
  }
  if (concept === 'visualLivingSong' || concept === 'visualLivingSong3d' || concept === 'visualLivingSongSnake' || concept === 'visualLivingSongGlobe') return;
  const mot = scene.damped?.motion ?? 0;
  const geo = scene.damped?.geometry ?? 0;

  for (const e of scene.shapes) {
    const obj = scene._meshByShape.get(e);
    if (!obj) continue;

    if (concept === 'particles') {
      const w = screenToWorld(
        e.x + (e.wobbleX ?? 0),
        e.y + (e.wobbleY ?? 0),
        e.z + (e.wobbleZ ?? 0),
        scene.width,
        scene.height,
      );
      obj.position.set(w.x, w.y, w.z);
      obj.rotation.set(e.rotX + (e.tiltX ?? 0), e.rotY, e.rotZ + (e.tiltZ ?? 0));
      obj.scale.set(1, 1, 1);
      let i = 0;
      for (const child of obj.children) {
        const dot = e.conceptData?.dots?.[i++];
        if (!dot) continue;
        const p = particleDotWorld(e, dot, mot, geo);
        const pw = screenToWorld(p.x, p.y, p.z, scene.width, scene.height);
        child.position.set(pw.x - obj.position.x, pw.y - obj.position.y, pw.z - obj.position.z);
        const base = child.userData.baseSize ?? dot.size * MESH_UNIT * 0.55;
        const sc = base * e.scale * (1 + geo * 0.35);
        child.scale.set(sc, sc, sc);
      }
      continue;
    }

    applyEntityTransform(obj, e, scene.width, scene.height);

    if (concept === 'blobs') {
      const sc = e.scale * (e.surpriseScale ?? 1);
      obj.scale.set(sc * (e.squashX ?? 1), sc * (e.squashY ?? 1), sc * (e.squashZ ?? 1));
    }

    if (concept === 'glassDiscs') {
      obj.scale.set(e.conceptData.radius * MESH_UNIT * 0.85 * e.scale, e.conceptData.radius * MESH_UNIT * 0.85 * e.scale, 1);
    }

    if (concept === 'typography') {
      const sc = (e.conceptData.displayScale ?? 1) * (e.conceptData.letterScale ?? 1) * 1.35;
      obj.scale.set(sc, sc, sc);
    }

    if (concept === 'origami') {
      const fold = origamiFoldAngle(e);
      const d = e.conceptData;
      const sc = e.scale * (e.surpriseScale ?? 1);
      obj.scale.set(sc, sc * (1 + fold * 0.35), sc);
      const baseX = e.rotX + (e.tiltX ?? 0);
      const baseZ = e.rotZ + (e.tiltZ ?? 0);
      if (d.crease === 'x') obj.rotation.set(baseX + fold * 1.35, e.rotY, baseZ);
      else obj.rotation.set(baseX, e.rotY, baseZ + fold * 1.35);
    }
  }

  if (concept === 'constellation' && scene._conceptLineMesh) {
    const state = scene._conceptState ?? { edges: [], edgePulse: [] };
    const positions = [];
    for (let i = 0; i < state.edges.length; i++) {
      const edge = state.edges[i];
      const a = scene.shapes[edge.a];
      const b = scene.shapes[edge.b];
      if (!a || !b) continue;
      const wa = screenToWorld(a.x, a.y, a.z, scene.width, scene.height);
      const wb = screenToWorld(b.x, b.y, b.z, scene.width, scene.height);
      positions.push(wa.x, wa.y, wa.z, wb.x, wb.y, wb.z);
    }
    if (positions.length) {
      scene._conceptLineMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      scene._conceptLineMesh.geometry.attributes.position.needsUpdate = true;
    }
    const pulse = state.edgePulse?.reduce((a, v) => a + v, 0) / Math.max(1, state.edgePulse?.length ?? 1);
    scene._conceptLineMesh.material.opacity = 0.22 + pulse * 0.45;
  }
}

/** @param {object} scene */
export function updateConceptMeshColors(scene) {
  const concept = scene.variation.visualConcept ?? 'geometric';
  if (concept === 'geometric' || concept === 'liquidsOnCanvas' || concept === 'visualLivingSong' || concept === 'visualLivingSong3d' || concept === 'visualLivingSongSnake' || concept === 'visualLivingSongGlobe') {
    return concept === 'liquidsOnCanvas';
  }
  const opts = materialOpts(scene);
  const snap = opts.trueColors && scene.variation.colorMode === 'manual';

  for (const e of scene.shapes) {
    const obj = scene._meshByShape.get(e);
    if (!obj) continue;
    const color = paletteColorThree(scene.palette, e.colorIdx + scene.colorOffset, snap);

    if (concept === 'particles' || concept === 'typography' || concept === 'blobs' || concept === 'origami') {
      const targets = obj.isGroup ? obj.children : [obj];
      for (const mesh of targets) {
        if (mesh.material) updateCinematicMaterial(mesh.material, color, opts);
      }
    } else if (concept === 'constellation') {
      if (obj.material) updateCinematicMaterial(obj.material, color, opts);
    } else if (concept === 'glassDiscs') {
      if (obj.material) {
        obj.material.color.copy(color);
        obj.material.needsUpdate = true;
      }
    }
  }
  return true;
}
