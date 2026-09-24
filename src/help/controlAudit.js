/**
 * Runtime control audit — checks DOM presence and whether inputs update app state.
 * @typedef {'ok'|'conditional'|'needs-audio'|'missing'|'unwired'|'readonly'} AuditStatus
 * @typedef {{ id: string, label: string, status: AuditStatus, note: string, group: string }} AuditResult
 */

/** @type {{ id: string, label: string, group: string, type: 'variation'|'cinematic'|'viscosity'|'mapping'|'action'|'readonly', key?: string, when?: string, needsAudio?: boolean }}[]} */
export const CONTROL_REGISTRY = [
  { id: 'visual-concept-select', label: 'Visual concept', group: 'Scene', type: 'variation', key: 'visualConcept' },
  { id: 'globe-shape-select', label: 'Globe shape', group: 'Scene', type: 'variation', key: 'globeShapeMode', when: 'Globe concept' },
  { id: 'globe-detail-slider', label: 'Globe detail', group: 'Scene', type: 'variation', key: 'globeDetail', when: 'Globe concept' },
  { id: 'globe-tube-profile-select', label: 'Line profile', group: 'Scene', type: 'variation', key: 'globeTubeProfile', when: 'Globe concept' },
  { id: 'globe-joint-style-select', label: 'Corner joints', group: 'Scene', type: 'variation', key: 'globeJointStyle', when: 'Globe concept' },
  { id: 'file-input', label: 'Audio upload', group: 'Session', type: 'action' },
  { id: 'save-config-btn', label: 'Save config', group: 'Session', type: 'action' },
  { id: 'open-config-btn', label: 'Open config', group: 'Session', type: 'action' },
  { id: 'bg-color-picker', label: 'Background color', group: 'Session', type: 'action' },
  { id: 'clip-from', label: 'Clip from', group: 'Export', type: 'action', needsAudio: true },
  { id: 'clip-to', label: 'Clip to', group: 'Export', type: 'action', needsAudio: true },
  { id: 'preview-export-btn', label: 'Preview clip', group: 'Export', type: 'action', needsAudio: true },
  { id: 'export-audio-check', label: 'Include audio', group: 'Export', type: 'action' },
  { id: 'export-btn', label: 'Export MP4', group: 'Export', type: 'action', needsAudio: true },
  { id: 'rounded-edges-check', label: 'Rounded edges', group: 'Clip variation', type: 'variation', key: 'roundedEdges' },
  { id: 'kanten-check', label: 'Kanten', group: 'Clip variation', type: 'variation', key: 'kanten' },
  { id: 'corner-round-slider', label: 'Corner roundness', group: 'Clip variation', type: 'variation', key: 'cornerRound' },
  { id: 'color-mode-select', label: 'Color cycling', group: 'Clip variation', type: 'variation', key: 'colorMode' },
  { id: 'color-shift-slider', label: 'Color shift', group: 'Clip variation', type: 'variation', key: 'colorShift' },
  { id: 'shape-count-slider', label: 'Shape count', group: 'Clip variation', type: 'variation', key: 'shapeCount' },
  { id: 'element-size-from-slider', label: 'Element size from', group: 'Clip variation', type: 'variation', key: 'elementSizeFrom' },
  { id: 'element-size-to-slider', label: 'Element size to', group: 'Clip variation', type: 'variation', key: 'elementSizeTo' },
  { id: 'element-distance-from-slider', label: 'Element distance from', group: 'Clip variation', type: 'variation', key: 'elementDistanceFrom' },
  { id: 'element-distance-to-slider', label: 'Element distance to', group: 'Clip variation', type: 'variation', key: 'elementDistanceTo' },
  { id: 'size-spread-slider', label: 'Size spread', group: 'Clip variation', type: 'variation', key: 'sizeSpread' },
  { id: 'spin-intensity-slider', label: 'Spin intensity', group: 'Clip variation', type: 'variation', key: 'spinIntensity' },
  { id: 'speed-spread-slider', label: 'Speed spread', group: 'Clip variation', type: 'variation', key: 'speedSpread' },
  { id: 'layout-spread-slider', label: 'Layout spread', group: 'Clip variation', type: 'variation', key: 'layoutSpread' },
  { id: 'fixed-layout-check', label: 'Fixed layout', group: 'Clip variation', type: 'variation', key: 'fixedLayout' },
  { id: 'element-unicolor-check', label: 'Unicolor elements', group: 'Clip variation', type: 'variation', key: 'elementUnicolor' },
  { id: 'depth-range-slider', label: 'Depth range', group: 'Clip variation', type: 'variation', key: 'depthRange' },
  { id: 'element-motion-slider', label: 'Motion activity', group: 'Clip variation', type: 'variation', key: 'elementMotion' },
  { id: 'element-turn-slider', label: 'Element turn', group: 'Clip variation', type: 'variation', key: 'elementTurn' },
  { id: 'element-3d-motion-slider', label: '3D motion', group: 'Clip variation', type: 'variation', key: 'element3dMotion' },
  { id: 'manual-speed-check', label: 'Manual speed', group: 'Clip variation', type: 'variation', key: 'manualSpeed' },
  { id: 'manual-speed-slider', label: 'Manual speed value', group: 'Clip variation', type: 'variation', key: 'manualSpeedValue' },
  { id: 'surprises-check', label: 'Surprises', group: 'Clip variation', type: 'variation', key: 'surprises' },
  { id: 'surprise-rate-slider', label: 'Surprise rate', group: 'Clip variation', type: 'variation', key: 'surpriseRate' },
  { id: 'viscosity-slider', label: 'Global viscosity', group: 'Clip variation', type: 'viscosity' },
  { id: 'liquid-flow-speed-slider', label: 'Flow speed', group: 'Clip variation', type: 'variation', key: 'liquidFlowSpeed', when: 'Volcano lava' },
  { id: 'liquid-thickness-slider', label: 'Thickness', group: 'Clip variation', type: 'variation', key: 'liquidThickness', when: 'Volcano lava' },
  { id: 'liquid-relief-slider', label: 'Relief / height', group: 'Clip variation', type: 'variation', key: 'liquidRelief', when: 'Volcano lava' },
  { id: 'liquid-turbulence-slider', label: 'Turbulence', group: 'Clip variation', type: 'variation', key: 'liquidTurbulence', when: 'Volcano lava' },
  { id: 'surface-wobble-slider', label: 'Surface wobble', group: 'Clip variation', type: 'variation', key: 'surfaceWobble', when: 'Living Song' },
  { id: 'background-depth-slider', label: 'Background depth', group: 'Clip variation', type: 'variation', key: 'backgroundDepth', when: 'Living Song' },
  { id: 'renderer-mode-select', label: 'Renderer', group: 'Preview', type: 'action' },
  { id: 'camera-zoom-slider', label: 'Camera zoom', group: 'Preview', type: 'cinematic', key: 'cameraZoom' },
  { id: 'play-btn', label: 'Play', group: 'Preview', type: 'action', needsAudio: true },
  { id: 'stop-btn', label: 'Stop', group: 'Preview', type: 'action', needsAudio: true },
  { id: 'playhead-slider', label: 'Timeline', group: 'Preview', type: 'action', needsAudio: true },
  { id: 'record-btn', label: 'Record automation', group: 'Preview', type: 'action', needsAudio: true },
  { id: 'mapping-body', label: 'Parameter mapping table', group: 'Right panel', type: 'mapping' },
  { id: 'audio-sources-list', label: 'Song analysis meters', group: 'Right panel', type: 'readonly' },
  { id: 'cinematic-floor-check', label: 'Ground floor', group: 'Cinematic', type: 'cinematic', key: 'showFloor', when: 'Cinematic / Living Song' },
  { id: 'cinematic-shadows-check', label: 'Cast shadows', group: 'Cinematic', type: 'cinematic', key: 'shadows', when: 'Cinematic / Living Song' },
  { id: 'cinematic-true-colors-check', label: 'True swatch colors', group: 'Cinematic', type: 'cinematic', key: 'trueColors', when: 'Cinematic / Living Song' },
];

function isHidden(el) {
  if (!el) return true;
  if (el.hidden) return true;
  const section = el.closest('[hidden]');
  if (section) return true;
  const style = window.getComputedStyle(el);
  return style.display === 'none' || style.visibility === 'hidden';
}

function pickTestValue(el, current) {
  if (el.type === 'checkbox') return !el.checked;
  if (el.tagName === 'SELECT' && el.options.length > 1) {
    const idx = el.selectedIndex === 0 ? 1 : 0;
    return el.options[idx].value;
  }
  if (el.type === 'range' || el.type === 'number') {
    const min = Number(el.min);
    const max = Number(el.max);
    const cur = Number(el.value);
    if (Number.isFinite(min) && Number.isFinite(max)) {
      if (cur < max) return Math.min(max, cur + 1);
      if (cur > min) return Math.max(min, cur - 1);
    }
    return cur;
  }
  return current;
}

function readState(entry, ctx) {
  if (entry.type === 'variation') return ctx.getVariation()?.[entry.key];
  if (entry.type === 'cinematic') return ctx.getCinematic()?.[entry.key];
  if (entry.type === 'viscosity') return ctx.getViscosity?.();
  return undefined;
}

function writeAndTest(el, entry, ctx) {
  const before = readState(entry, ctx);
  const testVal = pickTestValue(el, before);

  if (el.type === 'checkbox') {
    const prev = el.checked;
    el.checked = testVal;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const after = readState(entry, ctx);
    el.checked = prev;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return after !== before;
  }

  if (el.tagName === 'SELECT') {
    const prev = el.value;
    el.value = String(testVal);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    const after = readState(entry, ctx);
    el.value = prev;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return String(after) === String(testVal) || after !== before;
  }

  const prev = el.value;
  el.value = String(testVal);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  const after = readState(entry, ctx);
  el.value = prev;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  if (entry.type === 'viscosity') {
    return Math.abs((after ?? 0) - Number(testVal) / 100) < 0.02 || after !== before;
  }
  return after === Number(testVal) || after === testVal || after !== before;
}

/**
 * @param {{ getVariation: () => object, getCinematic: () => object, getViscosity: () => number, hasAudio: () => boolean }} ctx
 * @returns {AuditResult[]}
 */
export function runControlAudit(ctx) {
  /** @type {AuditResult[]} */
  const results = [];

  for (const entry of CONTROL_REGISTRY) {
    const el = document.getElementById(entry.id);

    if (!el) {
      results.push({ id: entry.id, label: entry.label, group: entry.group, status: 'missing', note: 'Not found in page' });
      continue;
    }

    if (entry.when && isHidden(el)) {
      results.push({
        id: entry.id,
        label: entry.label,
        group: entry.group,
        status: 'conditional',
        note: `Hidden unless: ${entry.when}`,
      });
      continue;
    }

    if (entry.needsAudio && !ctx.hasAudio()) {
      results.push({
        id: entry.id,
        label: entry.label,
        group: entry.group,
        status: 'needs-audio',
        note: 'Present — enable after audio loads',
      });
      continue;
    }

    if (entry.type === 'readonly') {
      const rows = el.querySelectorAll('[data-source], li').length;
      results.push({
        id: entry.id,
        label: entry.label,
        group: entry.group,
        status: rows > 0 ? 'ok' : 'unwired',
        note: rows > 0 ? `${rows} live meters` : 'No meter rows rendered',
      });
      continue;
    }

    if (entry.type === 'mapping') {
      const rows = el.querySelectorAll('tr[data-target]').length;
      results.push({
        id: entry.id,
        label: entry.label,
        group: entry.group,
        status: rows >= 4 ? 'ok' : 'unwired',
        note: rows >= 4 ? `${rows} mapping rows` : 'Mapping table incomplete',
      });
      continue;
    }

    if (entry.type === 'action') {
      results.push({
        id: entry.id,
        label: entry.label,
        group: entry.group,
        status: 'ok',
        note: el.disabled ? 'Present (currently disabled)' : 'Present and clickable',
      });
      continue;
    }

    if ((entry.type === 'variation' || entry.type === 'cinematic' || entry.type === 'viscosity') && entry.key) {
      try {
        const wired = writeAndTest(el, entry, ctx);
        results.push({
          id: entry.id,
          label: entry.label,
          group: entry.group,
          status: wired ? 'ok' : 'unwired',
          note: wired ? 'Updates app state' : 'Element exists but state did not change',
        });
      } catch (err) {
        results.push({
          id: entry.id,
          label: entry.label,
          group: entry.group,
          status: 'unwired',
          note: `Test error: ${err.message}`,
        });
      }
      continue;
    }

    results.push({ id: entry.id, label: entry.label, group: entry.group, status: 'ok', note: 'Present' });
  }

  const cinematicSliders = document.querySelectorAll('#cinematic-sliders input[data-cinematic-key]');
  cinematicSliders.forEach((input) => {
    const key = input.dataset.cinematicKey;
    const label = key ?? 'Cinematic slider';
    try {
      const entry = { type: 'cinematic', key };
      const wired = writeAndTest(input, entry, ctx);
      results.push({
        id: `cinematic-${key}`,
        label,
        group: 'Cinematic',
        status: isHidden(input) ? 'conditional' : wired ? 'ok' : 'unwired',
        note: isHidden(input) ? 'Hidden unless Cinematic / Living Song' : wired ? 'Updates cinematic settings' : 'No state change',
      });
    } catch (err) {
      results.push({
        id: `cinematic-${key}`,
        label,
        group: 'Cinematic',
        status: 'unwired',
        note: err.message,
      });
    }
  });

  return results;
}

/** @param {AuditResult[]} results */
export function summarizeAudit(results) {
  const counts = { ok: 0, conditional: 0, 'needs-audio': 0, missing: 0, unwired: 0, readonly: 0 };
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}
