/** Flat column slices from a single glyph canvas. */
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

/** @param {string} char */
export function buildCharMeshData(char) {
  const ch = (char || 'A').slice(0, 1);
  const fontSize = 72;
  const font = `900 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const rawW = Math.max(probe.measureText(ch).width, fontSize * 0.45);
  const rawH = fontSize * 1.15;
  const c = document.createElement('canvas');
  c.width = Math.ceil(rawW + 10);
  c.height = Math.ceil(rawH + 10);
  const ctx = c.getContext('2d');
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(ch, c.width / 2, c.height / 2);
  const columns = sampleCharColumns(c, 2);
  return { char: ch, columns, canvasW: c.width, canvasH: c.height, hw: c.width * 0.5 };
}

/** @param {string} text @param {number} count */
export function charsForTypography(text, count) {
  const fallback = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const src = (text || '').replace(/\s+/g, '').toUpperCase();
  const pool = src.length >= 2 ? src : fallback;
  const out = [];
  for (let i = 0; i < count; i++) out.push(pool[i % pool.length]);
  return out;
}
