import { popArtColor } from '../popArtPalette.js';

export function parseRgb(css) {
  const m = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return { r: 200, g: 200, b: 200 };
  return { r: +m[1], g: +m[2], b: +m[3] };
}

export function shadeColor(css, factor) {
  const { r, g, b } = parseRgb(css);
  const f = Math.min(1, Math.max(0.85, factor));
  return `rgb(${Math.round(r * f)}, ${Math.round(g * f)}, ${Math.round(b * f)})`;
}

export function edgeStrokeColor(css, factor = 0.38) {
  const { r, g, b } = parseRgb(css);
  return `rgb(${Math.round(r * factor)}, ${Math.round(g * factor)}, ${Math.round(b * factor)})`;
}

export function entityColor(palette, colorIdx, colorOffset, blend = 0) {
  return popArtColor(palette, colorIdx + colorOffset, blend, 1);
}

export function projectDepth(z, rotY = 0) {
  return z + Math.sin(rotY) * 12;
}
