import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { drawFrame, getCanvasSize, resetRenderer, drawBackdrop } from '../visualizer/renderer.js';
import { FPS } from '../audio/analyzer.js';

// #region agent log
const debugLog = (location, message, data, hypothesisId) => {
  fetch('http://127.0.0.1:7257/ingest/e20d7077-f29a-4df5-b261-725d376d98f6', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '788c72' },
    body: JSON.stringify({ sessionId: '788c72', location, message, data, timestamp: Date.now(), hypothesisId }),
  }).catch(() => {});
};
// #endregion

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

export async function exportToMp4({ analysis, audioFile, title, onProgress }) {
  const { frames, frameCount } = analysis;
  const { width, height } = getCanvasSize();
  const exportStart = performance.now();

  // #region agent log
  debugLog('ffmpegExport.js:export-start', 'export started', {
    frameCount,
    durationSec: frameCount / FPS,
    width,
    height,
    audioSize: audioFile?.size,
  }, 'D');
  // #endregion

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d');
  resetRenderer(width, height);
  drawBackdrop(offCtx);

  onProgress?.(0, 'Loading video encoder (first time may take a moment)…');
  const ffmpeg = await getFFmpeg();

  const inputAudio = audioInputName(audioFile);
  onProgress?.(3, 'Writing audio track…');
  await ffmpeg.writeFile(inputAudio, await fetchFile(audioFile));

  const renderWeight = 72;
  for (let i = 0; i < frameCount; i++) {
    drawFrame(offCtx, frames[i], title);
    const blob = await canvasToJpeg(offscreen, 0.85);
    await ffmpeg.writeFile(`frame${padFrame(i)}.jpg`, new Uint8Array(await blob.arrayBuffer()));

    const pct = 3 + ((i + 1) / frameCount) * renderWeight;
    if (i % 10 === 0 || i === frameCount - 1) {
      onProgress?.(pct, `Rendering frame ${i + 1} / ${frameCount}…`);
    }
  }

  const renderMs = Math.round(performance.now() - exportStart);
  // #region agent log
  debugLog('ffmpegExport.js:render-done', 'frame render complete', { frameCount, renderMs }, 'D');
  // #endregion

  onProgress?.(78, 'Encoding MP4… 0%');
  const execStart = performance.now();
  let lastFfmpegProgress = 0;
  let progressEventCount = 0;
  const encodeStartPct = 78;
  const encodeEndPct = 95;

  const onFfmpegProgress = ({ progress, time }) => {
    progressEventCount += 1;
    lastFfmpegProgress = progress;
    const encodePct = encodeStartPct + Math.min(1, Math.max(0, progress)) * (encodeEndPct - encodeStartPct);
    onProgress?.(encodePct, `Encoding MP4… ${Math.round(progress * 100)}%`);
    if (progressEventCount <= 3 || progressEventCount % 20 === 0) {
      // #region agent log
      debugLog('ffmpegExport.js:ffmpeg-progress', 'ffmpeg encoding progress', {
        progress,
        time,
        progressEventCount,
        elapsedMs: Math.round(performance.now() - execStart),
      }, 'A');
      // #endregion
    }
  };

  const onFfmpegLog = ({ type, message }) => {
    if (type === 'fferr' || /error|fail|memory|abort/i.test(message)) {
      // #region agent log
      debugLog('ffmpegExport.js:ffmpeg-log', 'ffmpeg log', { type, message: message.slice(0, 200) }, 'B');
      // #endregion
    }
  };

  ffmpeg.on('progress', onFfmpegProgress);
  ffmpeg.on('log', onFfmpegLog);

  // #region agent log
  debugLog('ffmpegExport.js:exec-start', 'ffmpeg.exec starting', { frameCount, execStartMs: execStart }, 'B');
  // #endregion

  try {
    await ffmpeg.exec([
      '-framerate', String(FPS),
      '-i', 'frame%06d.jpg',
      '-i', inputAudio,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '23',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      'output.mp4',
    ]);
  } catch (execErr) {
    // #region agent log
    debugLog('ffmpegExport.js:exec-error', 'ffmpeg.exec threw', {
      message: execErr?.message,
      renderMs,
      execMs: Math.round(performance.now() - execStart),
      progressEventCount,
      lastFfmpegProgress,
    }, 'C');
    // #endregion
    throw execErr;
  } finally {
    ffmpeg.off('progress', onFfmpegProgress);
    ffmpeg.off('log', onFfmpegLog);
  }

  // #region agent log
  debugLog('ffmpegExport.js:exec-done', 'ffmpeg.exec finished', {
    execMs: Math.round(performance.now() - execStart),
    progressEventCount,
    lastFfmpegProgress,
    totalMs: Math.round(performance.now() - exportStart),
  }, 'A');
  // #endregion

  onProgress?.(95, 'Finalizing…');
  const data = await ffmpeg.readFile('output.mp4');
  const mp4Blob = new Blob([data.buffer], { type: 'video/mp4' });

  await ffmpeg.deleteFile(inputAudio);
  await ffmpeg.deleteFile('output.mp4');
  for (let i = 0; i < frameCount; i++) {
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
