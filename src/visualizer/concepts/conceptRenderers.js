import * as THREE from 'three';
import {
  transformVertex,
  rotateNormal,
  projectPoint,
  shadeFactor,
  buildBoxMesh,
  flatMeshForPreset,
} from '../math3d.js';
import { entityColor, shadeColor, edgeStrokeColor, projectDepth } from '../sceneCore/drawHelpers.js';
import { particleDotWorld } from './particlesConcept.js';
import { origamiFoldAngle } from './origamiConcept.js';
import { cinematicMaterial, updateCinematicMaterial, UNIT as MESH_UNIT } from '../three/shapeFactory.js';
import { applyEntityTransform, paletteColorThree, screenToWorld } from '../sceneCore/cinematicHelpers.js';

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

function meshDrawables(mesh, rot, offset, w, h, baseFill, showEdges) {
  const drawables = [];
  for (const face of mesh) {
    const worldVerts = face.verts.map((v) => transformVertex(v, rot, offset));
    const viewNormal = rotateNormal(face.normal, rot);
    if (viewNormal[2] <= 0.05) continue;
    const projected = worldVerts.map((v) => projectPoint(v, w, h));
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
    default:
      return false;
  }
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawParticlesPopArt(scene, ctx) {
  const { shapes, width, height, palette, colorOffset, damped } = scene;
  const mot = damped.motion;
  const geo = damped.geometry;
  const items = [];

  for (const e of shapes) {
    if (!e.conceptData?.dots) continue;
    for (const dot of e.conceptData.dots) {
      const p = particleDotWorld(e, dot, mot, geo);
      items.push({
        x: p.x,
        y: p.y,
        z: projectDepth(p.z, e.rotY),
        r: p.size,
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
      drawables.push(...meshDrawables(mesh, rot, colOffset, w, h, baseFill, showEdges));
      const sideMesh = buildBoxMesh(cw, standH * 0.15, Math.max(lz1 - lz0, 2), 0);
      const sideOffset = [offset[0] + lx, offset[1] + standH * 1.05, offset[2] + (lz0 + lz1) * 0.5];
      drawables.push(...meshDrawables(sideMesh, rot, sideOffset, w, h, sideFill, showEdges));
    }

    drawables.sort((a, b) => a.avgZ - b.avgZ);
    drawProjectedFaces(ctx, drawables, showEdges);
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawConstellationPopArt(scene, ctx) {
  const { shapes, palette, colorOffset, _conceptState } = scene;
  const state = _conceptState ?? { edges: [], edgePulse: [] };
  const nodes = shapes.map((e) => ({
    x: e.x,
    y: e.y,
    z: projectDepth(e.z, e.rotY),
    r: e.conceptData.nodeSize * e.scale,
    color: entityColor(palette, e.colorIdx, colorOffset),
  }));

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
    const drawables = meshDrawables(mesh, rot, offset, width, height, baseFill, showEdges);
    drawProjectedFaces(ctx, drawables, showEdges);
  }
  return true;
}

/** @param {object} scene @param {CanvasRenderingContext2D} ctx */
function drawGlassDiscsPopArt(scene, ctx) {
  const { shapes, palette, colorOffset } = scene;
  const sorted = [...shapes].sort((a, b) => projectDepth(a.z, a.rotY) - projectDepth(b.z, b.rotY));

  for (const e of sorted) {
    const r = e.conceptData.radius * e.scale;
    const base = entityColor(palette, e.colorIdx, colorOffset);
    const grad = ctx.createRadialGradient(e.x - r * 0.25, e.y - r * 0.25, r * 0.1, e.x, e.y, r);
    grad.addColorStop(0, shadeColor(base, 1.08));
    grad.addColorStop(0.55, base);
    grad.addColorStop(1, shadeColor(base, 0.72));
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, r, r * (0.55 + Math.abs(Math.sin(e.tiltX ?? 0)) * 0.35), e.rotZ, 0, Math.PI * 2);
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
  const { shapes, width, height, palette, colorOffset, variation } = scene;
  const showEdges = true;
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
    const drawables = meshDrawables(mesh, rot, offset, width, height, baseFill, showEdges);
    drawProjectedFaces(ctx, drawables, showEdges);
  }
  return true;
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
  if (concept === 'geometric') return false;
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
