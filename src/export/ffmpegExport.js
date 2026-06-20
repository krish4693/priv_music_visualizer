import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { drawFrame, getCanvasSize, resetRenderer, drawBackdrop } from '../visualizer/renderer.js';
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

export async function exportToMp4({ analysis, audioFile, title, onProgress }) {
  const { frames, frameCount } = analysis;
  const { width, height } = getCanvasSize();

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

  onProgress?.(78, 'Encoding MP4…');
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
