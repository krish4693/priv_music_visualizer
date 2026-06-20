import { buildBoxMesh, transformVertex, rotateNormal, projectPoint, shadeFactor } from './math3d.js';

function parseRgb(css) {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return { r: 200, g: 200, b: 200 };
  return { r: +m[1], g: +m[2], b: +m[3] };
}

function shadeColor(css, factor) {
  const { r, g, b } = parseRgb(css);
  const f = Math.min(1, Math.max(0.82, factor));
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

function edgeStrokeColor(css, factor = 0.38) {
  const { r, g, b } = parseRgb(css);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

/** Flat column slices from glyph — each becomes one box with six flat faces. */
function sampleCharColumns(canvas, colStep = 2) {
  const w = canvas.width;
  const h = canvas.height;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  const columns = [];

  for (let px = 0; px < w; px += colStep) {
    let minY = h;
    let maxY = -1;
    for (let py = 0; py < h; py++) {
      const i = (py * w + px) * 4;
      if (data[i + 3] > 80) {
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
    if (maxY >= minY) {
      columns.push({
        ux: (px + colStep * 0.5 - w / 2) / w,
        uz0: (minY - h / 2) / h,
        uz1: (maxY - h / 2) / h,
        uw: colStep / w,
      });
    }
  }

  return columns;
}

/**
 * Flat-faced 3D block letters on the host shape's top face (+Y).
 */
export class TitleLetters3D {
  constructor() {
    this.text = '';
    this.chars = [];
    this.totalWidth = 0;
  }

  /** @param {string} text @param {string} fillCss */
  rebuild(text, fillCss = 'rgb(255, 255, 255)') {
    const next = (text || '').trim().slice(0, 80);
    if (next === this.text && this.chars.length && fillCss === this._fillCss) return;
    this._fillCss = fillCss;
    this.text = next;
    this.chars = [];
    this.totalWidth = 0;

    if (!this.text) return;

    const display = this.text.length > 12 ? this.text.slice(0, 12) : this.text;
    const fontSize = Math.min(48, Math.max(20, Math.floor(400 / Math.max(display.length, 2))));
    const font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;

    const probe = document.createElement('canvas').getContext('2d');
    probe.font = font;

    let cursor = 0;
    for (const ch of display) {
      const rawW = Math.max(probe.measureText(ch).width, fontSize * 0.45);
      const rawH = fontSize * 1.15;
      const c = document.createElement('canvas');
      c.width = Math.ceil(rawW + 10);
      c.height = Math.ceil(rawH + 10);
      const ctx = c.getContext('2d');
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = fillCss;
      ctx.fillText(ch, c.width / 2, c.height / 2);

      const hw = c.width * 0.5;
      const columns = sampleCharColumns(c, 2);
      this.chars.push({ hw, localX: cursor + hw, columns, canvasW: c.width });
      cursor += c.width + 8;
    }
    this.totalWidth = cursor;
  }

  /**
   * @param {number[]} shapeRot
   * @param {number[]} shapeOffset
   * @param {{ rx: number, ry: number, rz: number }} shapeParams
   */
  collectDrawables(shapeRot, shapeOffset, shapeParams, canvasW, canvasH, faceFill, sideFill, edgeFill, showKanten = true) {
    if (!this.chars.length) return { solids: [] };

    const { rx, ry } = shapeParams;
    const fitScale = Math.min(1.25, (rx * 1.45) / Math.max(this.totalWidth, 1));
    const standH = Math.max(32, ry * 0.48 * fitScale);
    const surfaceY = ry;
    const solids = [];

    for (const ch of this.chars) {
      const charCenterX = (ch.localX - this.totalWidth / 2) * fitScale;
      const footW = ch.canvasW * fitScale;
      const footD = (ch.hw * 2) * fitScale * 1.1;

      for (const col of ch.columns) {
        const lx = charCenterX + col.ux * footW;
        const lz = ((col.uz0 + col.uz1) / 2) * footD;
        const hw = Math.max(col.uw * footW * 0.55, 4.5 * fitScale);
        const hd = Math.max(((col.uz1 - col.uz0) * footD * 0.5), 4 * fitScale);
        const ly = surfaceY + standH / 2;
        const mesh = buildBoxMesh(hw, standH / 2, hd);

        for (const face of mesh) {
          const worldVerts = face.verts.map((vert) =>
            transformVertex(
              [vert[0] + lx, vert[1] + ly, vert[2] + lz],
              shapeRot,
              shapeOffset,
            ),
          );
          const viewNormal = rotateNormal(face.normal, shapeRot);
          if (viewNormal[2] <= 0.02) continue;

          const projected = worldVerts.map((vert) => projectPoint(vert, canvasW, canvasH));
          const avgZ = projected.reduce((sum, p) => sum + p.z, 0) / projected.length;
          const shade = shadeFactor(viewNormal);

          let fill;
          if (face.normal[1] > 0.9) {
            fill = shadeColor(faceFill, Math.min(1, shade * 1.03));
          } else if (face.normal[1] < -0.9) {
            fill = shadeColor(edgeFill, shade * 0.78);
          } else {
            fill = shadeColor(sideFill, shade * 0.92);
          }

          solids.push({
            projected,
            avgZ,
            fill,
            stroke: showKanten ? edgeStrokeColor(fill) : null,
          });
        }
      }
    }

    solids.sort((a, b) => a.avgZ - b.avgZ);
    return { solids };
  }
}
