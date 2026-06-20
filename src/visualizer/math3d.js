export function rotateX([x, y, z], a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

export function rotateY([x, y, z], a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

export function rotateZ([x, y, z], a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}

export function rotateEuler(p, rx, ry, rz) {
  return rotateZ(rotateY(rotateX(p, rx), ry), rz);
}

const LIGHT = normalize3([0.35, -0.45, 0.82]);

function normalize3([x, y, z]) {
  const len = Math.hypot(x, y, z) || 1;
  return [x / len, y / len, z / len];
}

export function shadeFactor(normal) {
  const dot = normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2];
  return 0.78 + Math.max(0, dot) * 0.22;
}

export function projectPoint([x, y, z], width, height, focal = 1280) {
  const p = focal / (focal + z);
  return {
    x: width / 2 + x * p,
    y: height / 2 + y * p,
    z,
    p,
  };
}

export function transformVertex(local, rot, offset) {
  const r = rotateEuler(local, rot[0], rot[1], rot[2]);
  return [r[0] + offset[0], r[1] + offset[1], r[2] + offset[2]];
}

export function rotateNormal(n, rot) {
  return rotateEuler(n, rot[0], rot[1], rot[2]);
}

/** @returns {{ verts: number[][], normal: number[] }[]} */
export function buildBoxMesh(hw, hh, hd) {
  const v = [
    [-hw, -hh, -hd], [hw, -hh, -hd], [hw, hh, -hd], [-hw, hh, -hd],
    [-hw, -hh, hd], [hw, -hh, hd], [hw, hh, hd], [-hw, hh, hd],
  ];
  return [
    { verts: [v[4], v[5], v[6], v[7]], normal: [0, 0, 1] },
    { verts: [v[1], v[0], v[3], v[2]], normal: [0, 0, -1] },
    { verts: [v[5], v[1], v[2], v[6]], normal: [1, 0, 0] },
    { verts: [v[0], v[4], v[7], v[3]], normal: [-1, 0, 0] },
    { verts: [v[4], v[5], v[1], v[0]], normal: [0, -1, 0] },
    { verts: [v[3], v[7], v[6], v[2]], normal: [0, 1, 0] },
  ];
}

/** @returns {{ verts: number[][], normal: number[] }[]} */
export function buildEllipsoidMesh(rx, ry, rz, uSeg = 14, vSeg = 10) {
  const faces = [];
  const verts = [];

  for (let vi = 0; vi <= vSeg; vi++) {
    const row = [];
    const phi = (vi / vSeg) * Math.PI;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    for (let ui = 0; ui <= uSeg; ui++) {
      const theta = (ui / uSeg) * Math.PI * 2;
      row.push([
        rx * sinP * Math.cos(theta),
        ry * cosP,
        rz * sinP * Math.sin(theta),
      ]);
    }
    verts.push(row);
  }

  for (let vi = 0; vi < vSeg; vi++) {
    for (let ui = 0; ui < uSeg; ui++) {
      const a = verts[vi][ui];
      const b = verts[vi][ui + 1];
      const c = verts[vi + 1][ui + 1];
      const d = verts[vi + 1][ui];
      const cx = (a[0] + b[0] + c[0] + d[0]) / 4 / (rx || 1);
      const cy = (a[1] + b[1] + c[1] + d[1]) / 4 / (ry || 1);
      const cz = (a[2] + b[2] + c[2] + d[2]) / 4 / (rz || 1);
      const len = Math.hypot(cx, cy, cz) || 1;
      faces.push({
        verts: [a, b, c, d],
        normal: [cx / len, cy / len, cz / len],
      });
    }
  }
  return faces;
}

export function meshForShape(rx, ry, rz, round) {
  if (round >= 0.88) return buildEllipsoidMesh(rx, ry, rz);
  if (round > 0.06) return buildSuperellipsoidMesh(rx, ry, rz, round);
  return buildBoxMesh(rx, ry, rz);
}

function superTrig(u, n) {
  const c = Math.cos(u);
  const s = Math.sin(u);
  const e = 2 / Math.max(2.05, n);
  return {
    c: Math.sign(c) * Math.abs(c) ** e,
    s: Math.sign(s) * Math.abs(s) ** e,
  };
}

/** Rounded box → ellipsoid blend: low round = chamfered corners, high round = smooth oval. */
export function buildSuperellipsoidMesh(rx, ry, rz, round = 0.35, uSeg = 14, vSeg = 10) {
  const n = round >= 0.88 ? 2 : 2 + (1 - Math.min(1, round)) * 12;
  const faces = [];
  const verts = [];

  for (let vi = 0; vi <= vSeg; vi++) {
    const row = [];
    const eta = (vi / vSeg) * Math.PI - Math.PI / 2;
    const pe = superTrig(eta, n);
    for (let ui = 0; ui <= uSeg; ui++) {
      const omega = (ui / uSeg) * Math.PI * 2;
      const pw = superTrig(omega, n);
      row.push([rx * pe.c * pw.c, ry * pe.c * pw.s, rz * pe.s]);
    }
    verts.push(row);
  }

  for (let vi = 0; vi < vSeg; vi++) {
    for (let ui = 0; ui < uSeg; ui++) {
      const a = verts[vi][ui];
      const b = verts[vi][ui + 1];
      const c = verts[vi + 1][ui + 1];
      const d = verts[vi + 1][ui];
      faces.push({
        verts: [a, b, c, d],
        normal: faceNormal(a, b, c),
      });
    }
  }
  return faces;
}

function faceNormal(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

function quadFromGrid(verts, vi, ui, uSeg) {
  const a = verts[vi][ui];
  const b = verts[vi][ui + 1];
  const c = verts[vi + 1][ui + 1];
  const d = verts[vi + 1][ui];
  const cx = (a[0] + b[0] + c[0] + d[0]) / 4;
  const cy = (a[1] + b[1] + c[1] + d[1]) / 4;
  const cz = (a[2] + b[2] + c[2] + d[2]) / 4;
  const len = Math.hypot(cx, cy, cz) || 1;
  return {
    verts: [a, b, c, d],
    normal: [cx / len, cy / len, cz / len],
  };
}

/** Square-base pyramid — rx/rz = base half-width, ry = height. */
export function buildPyramidMesh(rx, ry, rz) {
  const apex = [0, ry, 0];
  const b0 = [-rx, -ry, -rz];
  const b1 = [rx, -ry, -rz];
  const b2 = [rx, -ry, rz];
  const b3 = [-rx, -ry, rz];
  return [
    { verts: [apex, b1, b0], normal: faceNormal(apex, b1, b0) },
    { verts: [apex, b2, b1], normal: faceNormal(apex, b2, b1) },
    { verts: [apex, b3, b2], normal: faceNormal(apex, b3, b2) },
    { verts: [apex, b0, b3], normal: faceNormal(apex, b0, b3) },
    { verts: [b0, b1, b2, b3], normal: [0, -1, 0] },
  ];
}

/** Eight-faced diamond (octahedron). */
export function buildOctahedronMesh(rx, ry, rz) {
  const top = [0, ry, 0];
  const bottom = [0, -ry, 0];
  const right = [rx, 0, 0];
  const left = [-rx, 0, 0];
  const front = [0, 0, rz];
  const back = [0, 0, -rz];
  return [
    { verts: [top, right, front], normal: faceNormal(top, right, front) },
    { verts: [top, front, left], normal: faceNormal(top, front, left) },
    { verts: [top, left, back], normal: faceNormal(top, left, back) },
    { verts: [top, back, right], normal: faceNormal(top, back, right) },
    { verts: [bottom, front, right], normal: faceNormal(bottom, front, right) },
    { verts: [bottom, left, front], normal: faceNormal(bottom, left, front) },
    { verts: [bottom, back, left], normal: faceNormal(bottom, back, left) },
    { verts: [bottom, right, back], normal: faceNormal(bottom, right, back) },
  ];
}

/** Cone — rx/rz = base radius, ry = height. */
export function buildConeMesh(rx, ry, rz, seg = 16) {
  const apex = [0, ry, 0];
  const faces = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [Math.cos(a0) * rx, -ry, Math.sin(a0) * rz];
    const p1 = [Math.cos(a1) * rx, -ry, Math.sin(a1) * rz];
    faces.push({ verts: [apex, p1, p0], normal: faceNormal(apex, p1, p0) });
  }
  const base = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    base.push([Math.cos(a) * rx, -ry, Math.sin(a) * rz]);
  }
  for (let i = 1; i < seg - 1; i++) {
    faces.push({ verts: [base[0], base[i + 1], base[i]], normal: [0, -1, 0] });
  }
  return faces;
}

/** Cylinder — rx/rz = radius, ry = half-height. */
export function buildCylinderMesh(rx, ry, rz, seg = 16) {
  const top = [];
  const bottom = [];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const z = Math.sin(a) * rz;
    top.push([x, ry, z]);
    bottom.push([x, -ry, z]);
  }
  const faces = [];
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    faces.push({
      verts: [bottom[i], bottom[j], top[j], top[i]],
      normal: faceNormal(bottom[i], bottom[j], top[j]),
    });
  }
  for (let i = 1; i < seg - 1; i++) {
    faces.push({ verts: [top[0], top[i + 1], top[i]], normal: [0, 1, 0] });
    faces.push({ verts: [bottom[0], bottom[i], bottom[i + 1]], normal: [0, -1, 0] });
  }
  return faces;
}

/** Equilateral triangular prism extruded along Z. */
export function buildTriPrismMesh(rx, ry, rz) {
  const h = ry;
  const r = rx;
  const v0 = [0, h, 0];
  const v1 = [r * Math.cos(Math.PI / 6), -h, r * Math.sin(Math.PI / 6)];
  const v2 = [r * Math.cos(5 * Math.PI / 6), -h, r * Math.sin(5 * Math.PI / 6)];
  const f0 = [v0[0], v0[1], v0[2] + rz];
  const f1 = [v1[0], v1[1], v1[2] + rz];
  const f2 = [v2[0], v2[1], v2[2] + rz];
  const b0 = [v0[0], v0[1], v0[2] - rz];
  const b1 = [v1[0], v1[1], v1[2] - rz];
  const b2 = [v2[0], v2[1], v2[2] - rz];
  return [
    { verts: [f0, f1, f2], normal: [0, 0, 1] },
    { verts: [b2, b1, b0], normal: [0, 0, -1] },
    { verts: [b0, b1, f1, f0], normal: faceNormal(b0, b1, f1) },
    { verts: [b1, b2, f2, f1], normal: faceNormal(b1, b2, f2) },
    { verts: [b2, b0, f0, f2], normal: faceNormal(b2, b0, f0) },
  ];
}

/** Regular tetrahedron inscribed in rx/ry/rz bounding box. */
export function buildTetrahedronMesh(rx, ry, rz) {
  const v0 = [0, ry, 0];
  const v1 = [rx, -ry * 0.33, -rz * 0.58];
  const v2 = [-rx * 0.87, -ry * 0.33, rz * 0.29];
  const v3 = [-rx * 0.13, -ry * 0.33, rz * 0.87];
  return [
    { verts: [v0, v2, v1], normal: faceNormal(v0, v2, v1) },
    { verts: [v0, v3, v2], normal: faceNormal(v0, v3, v2) },
    { verts: [v0, v1, v3], normal: faceNormal(v0, v1, v3) },
    { verts: [v1, v2, v3], normal: faceNormal(v1, v2, v3) },
  ];
}

/** Torus — rx = major radius, ry = tube radius, rz scales depth. */
export function buildTorusMesh(rx, ry, rz, uSeg = 18, vSeg = 12) {
  const major = rx;
  const tube = ry;
  const zScale = rz / (rx || 1);
  const verts = [];

  for (let vi = 0; vi <= vSeg; vi++) {
    const row = [];
    const phi = (vi / vSeg) * Math.PI * 2;
    const sinP = Math.sin(phi);
    const cosP = Math.cos(phi);
    for (let ui = 0; ui <= uSeg; ui++) {
      const theta = (ui / uSeg) * Math.PI * 2;
      const ring = major + tube * cosP;
      row.push([
        ring * Math.cos(theta),
        tube * sinP,
        ring * Math.sin(theta) * zScale,
      ]);
    }
    verts.push(row);
  }

  const faces = [];
  for (let vi = 0; vi < vSeg; vi++) {
    for (let ui = 0; ui < uSeg; ui++) {
      faces.push(quadFromGrid(verts, vi, ui, uSeg));
    }
  }
  return faces;
}

/**
 * @param {import('./shapePresets.js').ShapeKind} kind
 */
export function meshForPreset(kind, rx, ry, rz, round = 0) {
  switch (kind) {
    case 'ellipsoid':
      return buildEllipsoidMesh(rx, ry, rz);
    case 'pyramid':
      return buildPyramidMesh(rx, ry, rz);
    case 'octahedron':
      return buildOctahedronMesh(rx, ry, rz);
    case 'cone':
      return buildConeMesh(rx, ry, rz);
    case 'cylinder':
      return buildCylinderMesh(rx, ry, rz);
    case 'prism':
      return buildTriPrismMesh(rx, ry, rz);
    case 'tetrahedron':
      return buildTetrahedronMesh(rx, ry, rz);
    case 'torus':
      return buildTorusMesh(rx, ry, rz);
    default:
      return meshForShape(rx, ry, rz, round);
  }
}

function voxelStep(rx, ry, rz) {
  const size = Math.min(rx, ry, rz);
  return Math.max(12, Math.min(24, size / 3.2));
}

function insideEllipsoid(x, y, z, rx, ry, rz) {
  const sx = rx || 1;
  const sy = ry || 1;
  const sz = rz || 1;
  return (x / sx) ** 2 + (y / sy) ** 2 + (z / sz) ** 2 <= 1;
}

function insideBox(x, y, z, rx, ry, rz) {
  return Math.abs(x) <= rx && Math.abs(y) <= ry && Math.abs(z) <= rz;
}

function insidePyramid(x, y, z, rx, ry, rz) {
  if (y < -ry || y > ry) return false;
  const t = (ry - y) / (2 * ry);
  return Math.abs(x) <= rx * t && Math.abs(z) <= rz * t;
}

function insideCone(x, y, z, rx, ry, rz) {
  if (y < -ry || y > ry) return false;
  const t = (ry - y) / (2 * ry);
  if (t <= 0.001) return Math.abs(x) <= 0.001 && Math.abs(z) <= 0.001;
  const sx = (rx || 1) * t;
  const sz = (rz || 1) * t;
  return (x / sx) ** 2 + (z / sz) ** 2 <= 1;
}

function insideCylinder(x, y, z, rx, ry, rz) {
  if (Math.abs(y) > ry) return false;
  const sx = rx || 1;
  const sz = rz || 1;
  return (x / sx) ** 2 + (z / sz) ** 2 <= 1;
}

function insideOctahedron(x, y, z, rx, ry, rz) {
  const sx = rx || 1;
  const sy = ry || 1;
  const sz = rz || 1;
  return Math.abs(x) / sx + Math.abs(y) / sy + Math.abs(z) / sz <= 1;
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const v0x = cx - ax;
  const v0y = cy - ay;
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = px - ax;
  const v2y = py - ay;
  const dot00 = v0x * v0x + v0y * v0y;
  const dot01 = v0x * v1x + v0y * v1y;
  const dot02 = v0x * v2x + v0y * v2y;
  const dot11 = v1x * v1x + v1y * v1y;
  const dot12 = v1x * v2x + v1y * v2y;
  const inv = 1 / (dot00 * dot11 - dot01 * dot01);
  const u = (dot11 * dot02 - dot01 * dot12) * inv;
  const v = (dot00 * dot12 - dot01 * dot02) * inv;
  return u >= 0 && v >= 0 && u + v <= 1;
}

function insidePrism(x, y, z, rx, ry, rz) {
  if (Math.abs(z) > rz) return false;
  const r = rx;
  const h = ry;
  const ax = 0;
  const ay = h;
  const bx = r * Math.cos(Math.PI / 6);
  const by = -h;
  const cx = r * Math.cos((5 * Math.PI) / 6);
  const cy = -h;
  return pointInTriangle(x, y, ax, ay, bx, by, cx, cy);
}

function insideTetrahedron(x, y, z, rx, ry, rz) {
  const v0 = [0, ry, 0];
  const v1 = [rx, -ry * 0.33, -rz * 0.58];
  const v2 = [-rx * 0.87, -ry * 0.33, rz * 0.29];
  const v3 = [-rx * 0.13, -ry * 0.33, rz * 0.87];
  const faces = [
    [v0, v2, v1],
    [v0, v3, v2],
    [v0, v1, v3],
    [v1, v2, v3],
  ];
  for (const [a, b, c] of faces) {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    const px = x - a[0];
    const py = y - a[1];
    const pz = z - a[2];
    if (px * (nx / len) + py * (ny / len) + pz * (nz / len) > 0.001) return false;
  }
  return true;
}

function insideTorus(x, y, z, rx, ry, rz) {
  const zScale = rz / (rx || 1);
  const zSc = z / zScale;
  const ringDist = Math.hypot(x, zSc) - rx;
  return ringDist * ringDist + y * y <= ry * ry;
}

function insideShape(kind, x, y, z, rx, ry, rz, round = 0) {
  switch (kind) {
    case 'ellipsoid':
      return insideEllipsoid(x, y, z, rx, ry, rz);
    case 'pyramid':
      return insidePyramid(x, y, z, rx, ry, rz);
    case 'octahedron':
      return insideOctahedron(x, y, z, rx, ry, rz);
    case 'cone':
      return insideCone(x, y, z, rx, ry, rz);
    case 'cylinder':
      return insideCylinder(x, y, z, rx, ry, rz);
    case 'prism':
      return insidePrism(x, y, z, rx, ry, rz);
    case 'tetrahedron':
      return insideTetrahedron(x, y, z, rx, ry, rz);
    case 'torus':
      return insideTorus(x, y, z, rx, ry, rz);
    default:
      if (round >= 0.88) return insideEllipsoid(x, y, z, rx, ry, rz);
      if (round > 0.35) {
        return insideBox(x, y, z, rx, ry, rz) || insideEllipsoid(x, y, z, rx, ry, rz);
      }
      return insideBox(x, y, z, rx, ry, rz);
  }
}

/** Solid volume — small overlapping boxes fill the shape instead of a hollow shell. */
export function buildSolidVoxelMesh(kind, rx, ry, rz, round = 0) {
  const step = voxelStep(rx, ry, rz);
  const hh = step * 0.5;
  const faces = [];

  for (let x = -rx + hh; x <= rx - hh * 0.5; x += step) {
    for (let y = -ry + hh; y <= ry - hh * 0.5; y += step) {
      for (let z = -rz + hh; z <= rz - hh * 0.5; z += step) {
        if (!insideShape(kind, x, y, z, rx, ry, rz, round)) continue;
        const box = buildBoxMesh(hh, hh, hh);
        for (const face of box) {
          faces.push({
            verts: face.verts.map(([vx, vy, vz]) => [vx + x, vy + y, vz + z]),
            normal: face.normal,
          });
        }
      }
    }
  }

  if (faces.length) return faces;
  return meshForPreset(kind, rx, ry, rz, round);
}

/**
 * Flat faceted surface mesh — no voxel fill.
 * @param {import('./shapePresets.js').ShapeKind} kind
 * @param {boolean} [roundedEdges]
 */
export function flatMeshForPreset(kind, rx, ry, rz, round = 0, roundedEdges = false) {
  if (!roundedEdges) {
    if (kind === 'ellipsoid') return buildBoxMesh(rx, ry, rz);
    if (kind === 'torus') return buildBoxMesh(rx, ry * 0.55, rz);
    if (kind === 'cone') return buildPyramidMesh(rx, ry, rz);
    if (kind === 'cylinder') return buildBoxMesh(rx, ry, rz);
    return meshForPreset(kind, rx, ry, rz, 0);
  }

  const effectiveRound = Math.min(1, Math.max(round, 0.1) + round * 0.45);

  switch (kind) {
    case 'ellipsoid':
      return buildEllipsoidMesh(rx, ry, rz);
    case 'cone':
      return buildConeMesh(rx, ry, rz, 20);
    case 'cylinder':
      return buildCylinderMesh(rx, ry, rz, 20);
    case 'torus':
      return buildTorusMesh(rx, ry, rz, 20, 12);
    case 'pyramid':
    case 'octahedron':
    case 'prism':
    case 'tetrahedron':
      return meshForPreset(kind, rx, ry, rz, 0);
    default:
      if (effectiveRound >= 0.88) return buildEllipsoidMesh(rx, ry, rz);
      if (effectiveRound > 0.06) return buildSuperellipsoidMesh(rx, ry, rz, effectiveRound);
      return buildBoxMesh(rx, ry, rz);
  }
}
