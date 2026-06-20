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
  return 0.52 + Math.max(0, dot) * 0.48;
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
  return buildBoxMesh(rx, ry, rz);
}
