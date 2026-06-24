/** 0 = very far (tiny dots), 50 = default framing, 100 = inside a shape */
export function viewZoomMultiplier(cameraZoom = 50) {
  const z = Math.min(100, Math.max(0, Number(cameraZoom) || 50));
  return 2 ** ((50 - z) / 11);
}

/** Scale screen coords from canvas center. Multiplier < 1 = zoom out. */
export function applyViewZoom(x, y, width, height, cameraZoom = 50) {
  const m = viewZoomMultiplier(cameraZoom);
  return {
    x: width / 2 + (x - width / 2) * m,
    y: height / 2 + (y - height / 2) * m,
  };
}

/** @param {number} [cameraZoom] */
export function viewFovDegrees(cameraZoom = 50, baseFov = 42) {
  const z = Math.min(100, Math.max(0, Number(cameraZoom) || 50));
  return Math.min(98, Math.max(7, baseFov * 2 ** ((50 - z) / 24)));
}
