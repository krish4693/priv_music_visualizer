import { fftMagnitudes, nextPowerOf2, hannWindow } from './fft.js';

export const FPS = 30;
export const FFT_SIZE = 2048;
export const BAR_COUNT = 48;

const hann = hannWindow(FFT_SIZE);

/**
 * Analyze decoded audio buffer into per-frame feature data for export.
 */
export async function analyzeAudioBuffer(audioBuffer, onProgress) {
  const channel = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const frameCount = Math.ceil(duration * FPS);
  const frames = [];
  let prevRms = 0;
  let prevBars = null;
  const beatTimes = [];
  let beatPulse = 0;

  const nyquist = sampleRate / 2;
  const binHz = nyquist / (FFT_SIZE / 2);

  for (let f = 0; f < frameCount; f++) {
    const time = f / FPS;
    const centerSample = Math.floor(time * sampleRate);
    const start = centerSample - FFT_SIZE / 2;

    const windowed = new Float32Array(FFT_SIZE);
    let rmsSum = 0;

    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = start + i;
      const sample = idx >= 0 && idx < channel.length ? channel[idx] : 0;
      windowed[i] = sample * hann[i];
      rmsSum += sample * sample;
    }

    const rms = Math.sqrt(rmsSum / FFT_SIZE);
    const mags = fftMagnitudes(windowed);

    const bars = computeBars(mags, binHz);
    const { bass, mid, high } = bandEnergies(mags, binHz);
    const { centroid, spread, texture } = spectralTimbre(bars);
    const beat = detectBeat(rms, bars, prevRms, prevBars);
    prevRms = rms;
    prevBars = bars;

    beatPulse = decayBeatPulse(beatPulse, beat);
    const tempo = updateTempoState(beatTimes, time, beat);
    const pitch = estimatePitch(mags, binHz);

    const waveStart = Math.max(0, centerSample - 512);
    const waveEnd = Math.min(channel.length, centerSample + 512);
    const waveform = [];
    const waveLen = waveEnd - waveStart;
    const step = Math.max(1, Math.floor(waveLen / 128));
    for (let i = waveStart; i < waveEnd; i += step) {
      waveform.push(channel[i]);
    }

    frames.push({
      time, rms, bass, mid, high, bars, waveform, beat, beatPulse, tempo, pitch,
      centroid, spread, texture,
    });

    if (f % 20 === 0 || f === frameCount - 1) {
      const pct = 50 + ((f + 1) / frameCount) * 50;
      onProgress?.(pct, `Analyzing audio… frame ${f + 1} / ${frameCount}`);
      await yieldToMain();
    }
  }

  onProgress?.(100, 'Analysis complete');
  return { duration, sampleRate, frameCount, frames };
}

/** @param {{ duration: number, sampleRate: number, frameCount: number, frames: object[] }} analysis */
export function serializeAnalysis(analysis) {
  return {
    duration: analysis.duration,
    sampleRate: analysis.sampleRate,
    frameCount: analysis.frameCount,
    frames: analysis.frames.map((f) => ({
      time: f.time,
      rms: f.rms,
      bass: f.bass,
      mid: f.mid,
      high: f.high,
      bars: f.bars ? Array.from(f.bars) : [],
      waveform: f.waveform ?? [],
      beat: f.beat,
      beatPulse: f.beatPulse,
      tempo: f.tempo,
      pitch: f.pitch,
      centroid: f.centroid,
      spread: f.spread,
      texture: f.texture,
    })),
  };
}

/** @param {ReturnType<typeof serializeAnalysis>} data */
export function deserializeAnalysis(data) {
  if (!data?.frames?.length) return null;
  return {
    duration: data.duration,
    sampleRate: data.sampleRate,
    frameCount: data.frameCount,
    frames: data.frames.map((f) => ({
      ...f,
      bars: new Float32Array(f.bars ?? []),
    })),
  };
}

/** @param {File|Blob} file */
export function audioFileFingerprint(file) {
  return `${file.name}|${file.size}`;
}

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function computeBars(mags, binHz) {
  const bars = new Float32Array(BAR_COUNT);
  const maxBin = mags.length - 1;

  for (let b = 0; b < BAR_COUNT; b++) {
    const t0 = b / BAR_COUNT;
    const t1 = (b + 1) / BAR_COUNT;
    const minHz = 20 * Math.pow(1000, t0);
    const maxHz = 20 * Math.pow(1000, t1);
    const binStart = Math.max(1, Math.floor(minHz / binHz));
    const binEnd = Math.min(maxBin, Math.ceil(maxHz / binHz));

    let sum = 0;
    let count = 0;
    for (let i = binStart; i <= binEnd; i++) {
      sum += mags[i];
      count++;
    }
    bars[b] = count > 0 ? sum / count : 0;
  }

  return normalizeBars(bars);
}

function bandEnergies(mags, binHz) {
  const bands = [
    { name: 'bass', min: 20, max: 250 },
    { name: 'mid', min: 250, max: 4000 },
    { name: 'high', min: 4000, max: 16000 },
  ];
  const result = { bass: 0, mid: 0, high: 0 };

  for (const band of bands) {
    const binStart = Math.max(1, Math.floor(band.min / binHz));
    const binEnd = Math.min(mags.length - 1, Math.ceil(band.max / binHz));
    let sum = 0;
    let count = 0;
    for (let i = binStart; i <= binEnd; i++) {
      sum += mags[i];
      count++;
    }
    result[band.name] = count > 0 ? sum / count : 0;
  }

  const max = Math.max(result.bass, result.mid, result.high, 0.001);
  result.bass /= max;
  result.mid /= max;
  result.high /= max;
  return result;
}

function normalizeBars(bars) {
  const out = new Float32Array(bars.length);
  const max = Math.max(...bars, 0.001);
  for (let i = 0; i < bars.length; i++) {
    out[i] = Math.min(1, bars[i] / max);
  }
  return out;
}

/** Timbre features — slower-moving than beat, good for organic core motion. */
export function spectralTimbre(bars) {
  let weighted = 0;
  let total = 0;
  for (let i = 0; i < bars.length; i++) {
    weighted += i * bars[i];
    total += bars[i];
  }
  const centroid = total > 0 ? weighted / (bars.length * total) : 0.5;

  let varSum = 0;
  for (let i = 0; i < bars.length; i++) {
    const d = i / bars.length - centroid;
    varSum += bars[i] * d * d;
  }
  const spread = Math.min(1, Math.sqrt(varSum / (total || 1)) * 3.5);

  let texture = 0;
  for (let i = 0; i < bars.length - 1; i++) {
    texture += Math.abs(bars[i + 1] - bars[i]);
  }
  texture = Math.min(1, (texture / bars.length) * 5);

  return { centroid, spread, texture };
}

/** Normalised pitch brightness from dominant spectral peak (0 = low, 1 = high). */
export function estimatePitch(mags, binHz) {
  let peakBin = 1;
  let peakVal = 0;
  const maxBin = Math.min(mags.length - 1, Math.floor(4000 / binHz));
  for (let i = 1; i <= maxBin; i++) {
    if (mags[i] > peakVal) {
      peakVal = mags[i];
      peakBin = i;
    }
  }
  const hz = Math.max(60, peakBin * binHz);
  return Math.min(1, Math.max(0, (Math.log2(hz / 80) / Math.log2(2500 / 80))));
}

function normaliseTempo(bpm) {
  return Math.min(1, Math.max(0, (bpm - 65) / 115));
}

function updateTempoState(beatTimes, time, beat) {
  let tempo = 0.5;
  if (beat) {
    beatTimes.push(time);
    if (beatTimes.length > 14) beatTimes.shift();
  }
  if (beatTimes.length >= 3) {
    let sum = 0;
    for (let i = 1; i < beatTimes.length; i++) sum += beatTimes[i] - beatTimes[i - 1];
    const avg = sum / (beatTimes.length - 1);
    if (avg > 0.2 && avg < 2.5) tempo = normaliseTempo(60 / avg);
  }
  return tempo;
}

function decayBeatPulse(current, beat) {
  let pulse = current * 0.86;
  if (beat) pulse = Math.min(1, pulse + 0.85);
  return pulse;
}

function detectBeat(rms, bars, prevRms, prevBars) {
  if (!prevBars) return false;
  let flux = 0;
  for (let i = 0; i < bars.length; i++) {
    const d = bars[i] - prevBars[i];
    if (d > 0) flux += d;
  }
  const rmsJump = rms > prevRms * 1.08 && rms > 0.03;
  const fluxHit = flux > 0.045;
  const loud = rms > 0.1 && flux > 0.08;
  return (rmsJump && fluxHit) || loud;
}

let livePrevRms = 0;
let livePrevBars = null;
let liveBeatTimes = [];
let liveBeatPulse = 0;
let liveTempo = 0.5;

/**
 * Build live preview frame data from AnalyserNode readings.
 */
export function liveFrameFromAnalyser(analyser, waveformSamples) {
  const freqData = new Uint8Array(analyser.frequencyBinCount);
  const timeData = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(freqData);
  analyser.getByteTimeDomainData(timeData);

  const bars = new Float32Array(BAR_COUNT);
  const binCount = freqData.length;
  for (let b = 0; b < BAR_COUNT; b++) {
    const t0 = b / BAR_COUNT;
    const t1 = (b + 1) / BAR_COUNT;
    const binStart = Math.floor(t0 * binCount);
    const binEnd = Math.floor(t1 * binCount);
    let sum = 0;
    for (let i = binStart; i < binEnd; i++) sum += freqData[i];
    bars[b] = sum / ((binEnd - binStart) * 255 || 1);
  }

  const waveform = new Float32Array(waveformSamples);
  const step = Math.floor(timeData.length / waveformSamples);
  for (let i = 0; i < waveformSamples; i++) {
    waveform[i] = (timeData[i * step] - 128) / 128;
  }

  let rmsSum = 0;
  for (let i = 0; i < timeData.length; i++) {
    const v = (timeData[i] - 128) / 128;
    rmsSum += v * v;
  }
  const rms = Math.sqrt(rmsSum / timeData.length);

  const third = Math.floor(binCount / 3);
  let bass = 0, mid = 0, high = 0;
  for (let i = 0; i < third; i++) bass += freqData[i];
  for (let i = third; i < third * 2; i++) mid += freqData[i];
  for (let i = third * 2; i < binCount; i++) high += freqData[i];
  bass = bass / (third * 255);
  mid = mid / (third * 255);
  high = high / (third * 255);

  const beat = detectBeat(rms, bars, livePrevRms, livePrevBars);
  livePrevRms = rms;
  livePrevBars = bars;

  liveBeatPulse = decayBeatPulse(liveBeatPulse, beat);
  const now = performance.now() / 1000;
  liveTempo = updateTempoState(liveBeatTimes, now, beat);

  const { centroid, spread, texture } = spectralTimbre(bars);
  const pitch = estimatePitchFromBars(bars);

  return {
    rms, bass, mid, high, bars, waveform, beat, beatPulse: liveBeatPulse,
    tempo: liveTempo, pitch, centroid, spread, texture,
  };
}

function estimatePitchFromBars(bars) {
  let peak = 0;
  let peakIdx = 0;
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] > peak) {
      peak = bars[i];
      peakIdx = i;
    }
  }
  return bars.length > 1 ? peakIdx / (bars.length - 1) : 0.5;
}

export function resetLiveBeatState() {
  livePrevRms = 0;
  livePrevBars = null;
  liveBeatTimes = [];
  liveBeatPulse = 0;
  liveTempo = 0.5;
}

export async function decodeAudioFile(file, onProgress) {
  const totalMB = (file.size / (1024 * 1024)).toFixed(1);
  onProgress?.(0, `Reading file (0 / ${totalMB} MB)…`);

  const arrayBuffer = await readFileWithProgress(file, (readPct, loaded, total) => {
    const pct = readPct * 0.4;
    const loadedMB = (loaded / (1024 * 1024)).toFixed(1);
    const sizeMB = (total / (1024 * 1024)).toFixed(1);
    onProgress?.(pct, `Reading file… ${loadedMB} / ${sizeMB} MB`);
  });

  onProgress?.(40, 'Decoding audio…');
  const ctx = new AudioContext();
  let audioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } catch (err) {
    await ctx.close();
    throw new Error('Browser could not decode this audio format');
  }
  await ctx.close();

  onProgress?.(50, 'Audio decoded');
  return audioBuffer;
}

async function readFileWithProgress(file, onReadPct) {
  const total = file.size;
  if (!total) throw new Error('File is empty');

  const chunkSize = 2 * 1024 * 1024;
  const combined = new Uint8Array(total);
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = await file.slice(offset, end).arrayBuffer();
    combined.set(new Uint8Array(chunk), offset);
    offset = end;
    onReadPct((offset / total) * 100, offset, total);
    await yieldToMain();
  }

  return combined.buffer;
}
