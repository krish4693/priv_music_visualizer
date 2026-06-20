export const DEFAULT_PALETTE = [
  { r: 212, g: 175, b: 55 },
  { r: 27, g: 42, b: 78 },
  { r: 255, g: 77, b: 109 },
  { r: 124, g: 92, b: 255 },
  { r: 77, g: 212, b: 255 },
  { r: 232, g: 220, b: 196 },
];

export function mergePalettes(palettes) {
  const all = palettes.flat().filter(Boolean);
  if (!all.length) return [...DEFAULT_PALETTE];

  const merged = [];
  const used = new Set();

  for (const c of all) {
    const key = `${c.r >> 4},${c.g >> 4},${c.b >> 4}`;
    if (used.has(key)) continue;
    used.add(key);
    merged.push(c);
  }

  return merged.length >= 3 ? merged.slice(0, 10) : [...DEFAULT_PALETTE];
}

export function rgba(palette, index, alpha = 1, boost = 0) {
  const c = palette[((index % palette.length) + palette.length) % palette.length];
  return `rgba(${clamp(c.r + boost)}, ${clamp(c.g + boost)}, ${clamp(c.b + boost)}, ${alpha})`;
}

export function rgb(palette, index, boost = 0) {
  const c = palette[((index % palette.length) + palette.length) % palette.length];
  return `rgb(${clamp(c.r + boost)}, ${clamp(c.g + boost)}, ${clamp(c.b + boost)})`;
}

function clamp(v) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/**
 * Extract dominant colors from an image file via downsampled pixel clustering.
 */
export async function extractPaletteFromFile(file, colorCount = 6) {
  const bitmap = await loadImageBitmap(file);
  const canvas = document.createElement('canvas');
  const size = 64;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  bitmap.close?.();

  const samples = [];
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 128) continue;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum < 18 || lum > 245) continue;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    if (sat < 12 && lum > 40 && lum < 220) continue;
    samples.push({ r, g, b });
  }

  if (samples.length < 8) {
    return quantizeFallback(data, colorCount);
  }

  return kMeans(samples, colorCount);
}

async function loadImageBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function quantizeFallback(data, k) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
    const prev = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    prev.r += data[i];
    prev.g += data[i + 1];
    prev.b += data[i + 2];
    prev.n++;
    buckets.set(key, prev);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, k)
    .map((b) => ({ r: Math.round(b.r / b.n), g: Math.round(b.g / b.n), b: Math.round(b.b / b.n) }));
}

function kMeans(points, k) {
  let centroids = pickInitialCentroids(points, k);

  for (let iter = 0; iter < 12; iter++) {
    const groups = Array.from({ length: k }, () => []);
    for (const p of points) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < k; i++) {
        const d = dist2(p, centroids[i]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      groups[best].push(p);
    }
    centroids = groups.map((g, i) => {
      if (!g.length) return centroids[i];
      const sum = g.reduce((a, p) => ({ r: a.r + p.r, g: a.g + p.g, b: a.b + p.b }), { r: 0, g: 0, b: 0 });
      return { r: Math.round(sum.r / g.length), g: Math.round(sum.g / g.length), b: Math.round(sum.b / g.length) };
    });
  }

  return centroids.filter(Boolean);
}

function pickInitialCentroids(points, k) {
  const result = [points[Math.floor(Math.random() * points.length)]];
  while (result.length < k) {
    const dists = points.map((p) => Math.min(...result.map((c) => dist2(p, c))));
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < points.length; i++) {
      r -= dists[i];
      if (r <= 0) {
        result.push(points[i]);
        break;
      }
    }
  }
  return result;
}

function dist2(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

export async function fileToImageSource(file) {
  const url = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = url;
  });
  return { img, url, revoke: () => URL.revokeObjectURL(url) };
}

export function blobToFile(blob, name, type) {
  return new File([blob], name, { type });
}

export function colorKey(c) {
  if (!c) return '';
  return `${c.r},${c.g},${c.b}`;
}
