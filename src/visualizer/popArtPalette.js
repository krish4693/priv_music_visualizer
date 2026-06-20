/** Default Pop Art palette — used when no custom colors are chosen. */
export const POP_ART_COLORS = [
  { r: 0, g: 220, b: 255, name: 'Primary Cyan' },
  { r: 255, g: 0, b: 140, name: 'Saturated Magenta' },
  { r: 255, g: 232, b: 0, name: 'Vivid Lemon Yellow' },
  { r: 0, g: 72, b: 255, name: 'Bold Cobalt Blue' },
  { r: 0, g: 200, b: 100, name: 'Brilliant Emerald Green' },
];

export const POP_ART_ALPHA = 1;
export const CHARCOAL_BG = '#1c1c1e';

export function resolvePalette(palette) {
  return palette?.length ? palette : POP_ART_COLORS;
}

export function popArtColor(palette, idx, blend = 0, alpha = POP_ART_ALPHA) {
  const colors = resolvePalette(palette);
  const n = colors.length;
  const i = ((Math.floor(idx) % n) + n) % n;
  const j = (i + 1) % n;
  const a = colors[i];
  const b = colors[j];
  const t = Math.min(1, Math.max(0, blend));
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bch = Math.round(a.b + (b.b - a.b) * t);
  return `rgba(${r}, ${g}, ${bch}, ${alpha})`;
}

export function popArtStroke(palette, idx, alpha = 1) {
  const colors = resolvePalette(palette);
  const c = colors[((Math.floor(idx) % colors.length) + colors.length) % colors.length];
  return `rgba(${Math.max(0, c.r - 30)}, ${Math.max(0, c.g - 30)}, ${Math.max(0, c.b - 30)}, ${alpha})`;
}
