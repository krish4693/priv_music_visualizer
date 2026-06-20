import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import {
  drawFrameAt,
  getCanvasSize,
  resetRenderer,
  setPlaybackAutomation,
  clearAutomationPaletteCache,
  drawBackdrop,
} from '../visualizer/renderer.js';
import { FPS } from '../audio/analyzer.js';

let ffmpegInstance = null;

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

function padFrame(index) {
  return String(index).padStart(6, '0');
}

function audioInputName(file) {
  return file.name.match(/\.wav$/i) ? 'input.wav' : 'input.mp3';
}

/**
 * @param {object} opts
 * @param {{ frames: object[], frameCount: number }} opts.analysis
 * @param {File} opts.audioFile
 * @param {(pct: number, label: string) => void} [opts.onProgress]
 * @param {number} [opts.startTime] seconds
 * @param {number|null} [opts.endTime] seconds (exclusive cap)
 * @param {boolean} [opts.preview] faster lower-quality export
 * @param {import('../visualizer/automationStore.js').AutomationKeyframe[]} [opts.automationKeyframes]
 */
export async function exportToMp4({
  analysis,
  audioFile,
  onProgress,
  startTime = 0,
  endTime = null,
  preview = false,
  automationKeyframes = null,
}) {
  const { frames, frameCount } = analysis;
  const { width, height } = getCanvasSize();
  const totalDuration = frameCount / FPS;

  const clipStart = Math.max(0, Math.min(startTime, totalDuration));
  const clipEnd = endTime != null
    ? Math.max(clipStart + 0.1, Math.min(endTime, totalDuration))
    : totalDuration;
  const clipDuration = clipEnd - clipStart;

  const startFrame = Math.floor(clipStart * FPS);
  const endFrame = Math.min(frameCount, Math.ceil(clipEnd * FPS));
  const frameStep = preview ? 2 : 1;
  const exportFps = preview ? 15 : FPS;
  const jpegQuality = preview ? 0.62 : 0.85;
  const outputFrameCount = Math.ceil((endFrame - startFrame) / frameStep);

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d');

  resetRenderer(width, height);
  clearAutomationPaletteCache();
  setPlaybackAutomation(automationKeyframes ?? null);
  drawBackdrop(offCtx);

  onProgress?.(0, preview ? 'Starting preview export…' : 'Loading video encoder…');
  const ffmpeg = await getFFmpeg();

  const inputAudio = audioInputName(audioFile);
  onProgress?.(3, 'Writing audio…');
  await ffmpeg.writeFile(inputAudio, await fetchFile(audioFile));

  const renderWeight = 72;
  let outIdx = 0;
  for (let i = startFrame; i < endFrame; i += frameStep) {
    const timeSec = i / FPS;
    drawFrameAt(offCtx, { ...frames[i], time: timeSec }, timeSec);
    const blob = await canvasToJpeg(offscreen, jpegQuality);
    await ffmpeg.writeFile(`frame${padFrame(outIdx)}.jpg`, new Uint8Array(await blob.arrayBuffer()));
    outIdx += 1;

    const pct = 3 + (outIdx / outputFrameCount) * renderWeight;
    if (outIdx % 5 === 0 || outIdx === outputFrameCount) {
      onProgress?.(pct, `Rendering ${outIdx} / ${outputFrameCount}…`);
    }
  }

  onProgress?.(78, 'Encoding MP4…');
  const x264Preset = preview ? 'ultrafast' : 'fast';
  const crf = preview ? '28' : '23';

  await ffmpeg.exec([
    '-framerate', String(exportFps),
    '-i', 'frame%06d.jpg',
    '-ss', String(clipStart),
    '-i', inputAudio,
    '-t', String(clipDuration),
    '-map', '0:v:0',
    '-map', '1:a:0',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', x264Preset,
    '-crf', crf,
    '-c:a', 'aac',
    '-b:a', preview ? '128k' : '192k',
    '-shortest',
    'output.mp4',
  ]);

  onProgress?.(95, 'Finalizing…');
  const data = await ffmpeg.readFile('output.mp4');
  const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });

  await ffmpeg.deleteFile(inputAudio);
  await ffmpeg.deleteFile('output.mp4');
  for (let i = 0; i < outIdx; i++) {
    await ffmpeg.deleteFile(`frame${padFrame(i)}.jpg`).catch(() => {});
  }

  onProgress?.(100, 'Done!');
  return mp4Blob;
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode frame'))), 'image/jpeg', quality);
  });
}
