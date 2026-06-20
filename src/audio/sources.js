function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

/** Responsive smoothing — still fluid, but reacts noticeably to music. */
const SOURCE_SMOOTH = 0.038;

function computeLow(frame) {
  if (frame.bars?.length) {
    const n = Math.max(1, Math.floor(frame.bars.length * 0.12));
    let sum = 0;
    for (let i = 0; i < n; i++) sum += frame.bars[i];
    return sum / n;
  }
  return frame.bass ?? 0;
}

export function createAudioSourceState() {
  return {
    lowSmooth: 0,
    midSmooth: 0,
    highSmooth: 0,
    ampSmooth: 0,
    beatPhase: 0,
    beatPeriod: 0.8,
    tempoPhaseSmooth: 0,
    beatPulseSmooth: 0,
  };
}

export function resetAudioSourceState(state) {
  Object.assign(state, createAudioSourceState());
}

/**
 * Five normalized (0–1) streams, heavily damped for anti-visualizer calm.
 */
export function extractAudioSources(frame, state, dt = 1 / 30) {
  const low = clamp01(computeLow(frame));
  const mid = clamp01(frame.mid ?? 0);
  const high = clamp01(frame.high ?? 0);
  const amplitude = clamp01((frame.rms ?? 0) * 1.8);
  const tempo = clamp01(frame.tempo ?? 0.5);

  state.lowSmooth = lerp(state.lowSmooth, low, SOURCE_SMOOTH);
  state.midSmooth = lerp(state.midSmooth, mid, SOURCE_SMOOTH);
  state.highSmooth = lerp(state.highSmooth, high, SOURCE_SMOOTH);
  state.ampSmooth = lerp(state.ampSmooth, amplitude, SOURCE_SMOOTH);

  const bpm = 65 + tempo * 115;
  state.beatPeriod = Math.max(0.35, 60 / bpm);

  if (frame.beat) state.beatPhase = 0;
  else state.beatPhase = Math.min(1, state.beatPhase + dt / state.beatPeriod);

  const rawPhase = (Math.sin(state.beatPhase * Math.PI * 2) + 1) / 2;
  state.tempoPhaseSmooth = lerp(state.tempoPhaseSmooth, rawPhase, SOURCE_SMOOTH * 0.8);

  const rawBeatPulse = clamp01(frame.beatPulse ?? 0);
  const beatSmooth = frame.beat ? 0.42 : 0.14;
  state.beatPulseSmooth = lerp(state.beatPulseSmooth, rawBeatPulse, beatSmooth);

  return {
    low: clamp01(state.lowSmooth),
    mid: clamp01(state.midSmooth),
    high: clamp01(state.highSmooth),
    amplitude: clamp01(state.ampSmooth),
    tempoPhase: clamp01(state.tempoPhaseSmooth),
    beatPulse: clamp01(state.beatPulseSmooth),
  };
}
