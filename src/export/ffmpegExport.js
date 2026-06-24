import { FFmpeg, FFFSType } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';
import { createExportSession } from '../visualizer/renderer.js';
import { FPS } from '../audio/analyzer.js';
import { livingSongVisualTimeAt } from '../visualizer/concepts/visualLivingSongConcept.js';
import { writeAudioSliceWavToFfmpeg } from '../audio/wavEncode.js';
import {
  putExportSegment,
  getExportSegment,
  deleteExportSegment,
  clearExportSegments,
} from '../storage/db.js';

let ffmpegInstance = null;
/** Cached blob URLs — avoids re-fetching CDN on worker reload. */
let cachedFfmpegLoadConfig = null;

/** @type {Promise<{ coreURL: string, wasmURL: string }>|null} */
let cachedFfmpegLoadPromise = null;

async function resolveFfmpegLoadConfig() {
  if (cachedFfmpegLoadConfig) return cachedFfmpegLoadConfig;
  if (!cachedFfmpegLoadPromise) {
    cachedFfmpegLoadPromise = (async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      cachedFfmpegLoadConfig = {
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      };
      return cachedFfmpegLoadConfig;
    })();
  }
  return cachedFfmpegLoadPromise;
}

function exportError(label, err) {
  const detail = String(err?.message ?? err ?? 'Unknown error');
  return new Error(`${label}: ${detail}`);
}

async function getFFmpeg() {
  if (ffmpegInstance?.loaded) return ffmpegInstance;

  if (ffmpegInstance) {
    try { ffmpegInstance.terminate(); } catch { /* ignore */ }
    ffmpegInstance = null;
  }

  const ffmpeg = new FFmpeg();
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await ffmpeg.load(await resolveFfmpegLoadConfig());
      ffmpegInstance = ffmpeg;
      return ffmpeg;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw exportError('FFmpeg load', lastErr);
}

/** Max JPEG frames kept in FFmpeg MEMFS per encode pass (~0.5 s @ 30 fps). */
const SEGMENT_FRAMES = 15;
/** Streamed exports use longer segments — fewer mux boundaries = smoother playback. */
const STREAM_SEGMENT_FRAMES = 60;
/** Full export resolution — 540p keeps browser memory within limits for long tracks. */
const FULL_EXPORT_WIDTH = 960;
const FULL_EXPORT_HEIGHT = 540;

const MERGED_MP4 = 'merged.mp4';

function byteLength(data) {
  if (!data) return 0;
  if (data instanceof Uint8Array) return data.byteLength;
  if (data instanceof Blob) return data.size;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof data === 'string') return data.length;
  return data.length ?? data.byteLength ?? data.size ?? 0;
}

async function writeStreamChunks(writable, bytes) {
  const chunkSize = 1024 * 1024;
  for (let off = 0; off < bytes.byteLength; off += chunkSize) {
    await writable.write(bytes.subarray(off, Math.min(off + chunkSize, bytes.byteLength)));
  }
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** getFile() after stream write often reports .size but returns an empty arrayBuffer. */
async function readBlobFileBytes(file) {
  const direct = await file.arrayBuffer();
  if (direct.byteLength > 0) return new Uint8Array(direct);
  const reader = file.stream().getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return concatUint8Arrays(chunks);
}

/** @returns {Promise<{ byteLength: number, finalized: boolean }>} */
async function finalizeStreamedVideoOnDisk(outputFileHandle, bytesWritten, onProgress, resetWorker) {
  if (bytesWritten > STREAM_FINALIZE_MAX_BYTES) {    return { byteLength: bytesWritten, finalized: false };
  }
  onProgress?.(97, 'Finalizing video for playback…');
  const ff = await resetWorker();
  const videoFile = await outputFileHandle.getFile();
  const bytes = await readBlobFileBytes(videoFile);
  if (bytes.byteLength < 1024) {
    throw new Error(`Stream file empty (${bytes.byteLength} bytes)`);
  }
  await ff.writeFile('stream_in.ts', bytes);
  await assertExec(
    ff,
    ['-f', 'mpegts', '-i', 'stream_in.ts', '-c', 'copy', '-movflags', '+faststart', 'stream_out.mp4'],
    'Finalize stream',
  );
  const fixed = await ff.readFile('stream_out.mp4');
  const fixedBytes = fixed instanceof Uint8Array ? fixed : new Uint8Array(fixed);
  const w = await outputFileHandle.createWritable();
  await writeStreamChunks(w, fixedBytes);
  await w.close();
  await ff.deleteFile('stream_in.ts').catch(() => {});
  await ff.deleteFile('stream_out.mp4').catch(() => {});  return { byteLength: fixedBytes.byteLength, finalized: true };
}

function padFrame(index) {
  return String(index).padStart(6, '0');
}

/** WORKERFS paths must be simple — spaces/special chars in File.name cause FS errors. */
function workfsFile(file, safeName) {
  return new File([file], safeName, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
  });
}

/** Above this size, in-browser mux OOMs — save video to disk and download audio separately. */
const STREAM_MUX_IN_BROWSER_MAX = 12 * 1024 * 1024;
/** Only keep streamed fMP4 parts in RAM for short clips (~15 s @ 30 fps). */
const STREAM_PARTS_RAM_MAX_FRAMES = 450;
/** Remux streamed TS in-browser only for short clips — larger files OOM in WASM. */
const STREAM_FINALIZE_MAX_BYTES = 10 * 1024 * 1024;

function yieldToMain() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function assertExec(ffmpeg, args, label) {
  const code = await ffmpeg.exec(args);
  if (code !== 0) {
    throw new Error(`${label} failed (FFmpeg exit code ${code})`);
  }
  return code;
}

/**
 * @param {object} opts
 * @param {{ frames: object[], frameCount: number }} opts.analysis
 * @param {File} opts.audioFile
 * @param {(pct: number, label: string) => void} [opts.onProgress]
 * @param {number} [opts.startTime] seconds
 * @param {number|null} [opts.endTime] seconds (exclusive cap)
 * @param {boolean} [opts.preview] faster lower-quality export
 * @param {boolean} [opts.includeAudio] mux audio track (default false — video only)
 * @param {FileSystemWritableFileStream|null} [opts.outputWritable] pre-opened save stream (full export)
 * @param {FileSystemFileHandle|null} [opts.outputFileHandle] save handle — used to mux audio after stream
 * @param {AudioBuffer|null} [opts.audioBuffer] decoded audio — used for mux instead of WORKERFS
 * @param {import('../visualizer/automationStore.js').AutomationKeyframe[]} [opts.automationKeyframes]
 * @returns {Promise<Blob|{ streamed: true, byteLength: number }>}
 */
export async function exportToMp4({
  analysis,
  audioFile,
  onProgress,
  startTime = 0,
  endTime = null,
  preview = false,
  includeAudio = false,
  outputWritable = null,
  outputFileHandle = null,
  audioBuffer = null,
  automationKeyframes = null,
}) {
  const { frames, frameCount } = analysis;
  const width = preview ? 960 : FULL_EXPORT_WIDTH;
  const height = preview ? 540 : FULL_EXPORT_HEIGHT;
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
  const jpegQuality = preview ? 0.62 : 0.60;
  const audioFrameCount = Math.ceil((endFrame - startFrame) / frameStep);

  const offscreen = document.createElement('canvas');
  offscreen.width = width;
  offscreen.height = height;
  const offCtx = offscreen.getContext('2d');

  let exportSession = createExportSession(width, height, automationKeyframes ?? null);
  exportSession.drawBackdrop(offCtx);

  const livingTimeline = exportSession.getLivingSongExportTimeline(clipDuration);
  const exportDuration = livingTimeline.totalDuration;
  const outputFrameCount = Math.ceil((exportDuration * exportFps) / frameStep);

  const exportId = `exp-${Date.now()}`;
  /** @type {string[][]} merge tiers — only merge same-size segments during export */
  const mergeTiers = [[]];
  let segmentStoreCounter = 0;

  const audioMountPoint = '/audio';
  const exportMediaMount = '/exportmedia';
  let audioMounted = false;
  let exportMediaMounted = false;
  const EXPORT_AUDIO_WAV = 'export_audio.wav';
  const STREAM_AUDIO_AAC = 'stream_audio.m4a';
  const STREAM_VIDEO_SAFE = 'export_video.mp4';
  const STREAM_AUDIO_SAFE = 'export_audio.wav';
  /** @type {FileSystemWritableFileStream|null} */
  let streamWritable = outputWritable;
  let streamBytesWritten = 0;
  const needsAudioMux = !!(includeAudio && audioFile);
  const keepVideoPartsInRam = needsAudioMux && outputFileHandle
    && outputFrameCount <= STREAM_PARTS_RAM_MAX_FRAMES;
  /** @type {Uint8Array[]|null} in-memory fMP4 parts for short-clip mux only */
  let streamVideoParts = keepVideoPartsInRam ? [] : null;

  try {
    onProgress?.(0, preview ? 'Starting preview export…' : 'Loading video encoder…');
    await resolveFfmpegLoadConfig();
    let ffmpeg = await getFFmpeg();

    if (streamWritable) {
      onProgress?.(1, needsAudioMux ? 'Saving video (audio added at end)…' : 'Saving directly to file…');
    } else if (!preview && !needsAudioMux) {
      throw new Error(
        'Full video export needs a save location (Chrome/Edge). Click Export once and choose a file.',
      );
    }

    const onFfmpegProgress = ({ progress }) => {
      if (typeof progress !== 'number' || progress <= 0) return;
    };
    ffmpeg.on('progress', onFfmpegProgress);

    async function resetFfmpegWorker() {
      ffmpeg.off('progress', onFfmpegProgress);
      ffmpeg.terminate();
      ffmpegInstance = null;
      ffmpeg = await getFFmpeg();
      ffmpeg.on('progress', onFfmpegProgress);
      return ffmpeg;
    }

    function nextSegmentKey() {
      const key = `${exportId}:s${segmentStoreCounter}`;
      segmentStoreCounter += 1;
      return key;
    }

    let audioPath = null;

    async function prepareAudioForMux() {
      if (!needsAudioMux) return null;
      onProgress?.(95, 'Preparing audio…');      try {
        if (audioBuffer) {
          const wavEndSec = clipStart + exportDuration;
          const wavBytesWritten = await writeAudioSliceWavToFfmpeg(
            ffmpeg,
            audioBuffer,
            clipStart,
            wavEndSec,
            EXPORT_AUDIO_WAV,
            (args, label) => assertExec(ffmpeg, args, label),
          );
          if (wavBytesWritten < 48) {
            throw new Error(`Audio clip encode produced empty WAV (${wavBytesWritten} bytes)`);
          }          return EXPORT_AUDIO_WAV;
        }
        audioPath = `${audioMountPoint}/${audioFile.name}`;
        await ffmpeg.unmount(audioMountPoint).catch(() => {});
        const mounted = await ffmpeg.mount(FFFSType.WORKERFS, { files: [audioFile] }, audioMountPoint);
        if (!mounted) throw new Error('WORKERFS mount returned false');
        audioMounted = true;
        return audioPath;
      } catch (audioErr) {        throw exportError('Audio mount', audioErr);
      }
    }

    if (needsAudioMux) {
      onProgress?.(3, 'Rendering video with audio…');
    } else {
      onProgress?.(3, 'Rendering video (no audio)…');
    }

    const x264Preset = preview ? 'ultrafast' : (streamWritable ? 'veryfast' : 'ultrafast');
    const crf = preview ? '28' : '26';
    const renderWeight = 70;
    let globalIdx = 0;
    let segmentLocalIdx = 0;
    let segmentIdx = 0;
    let streamFrameOffset = 0;
    /** @type {Uint8Array|null} */
    let previewVideoBytes = null;

    function framesPerSegment() {
      if (preview && !streamWritable) return outputFrameCount;
      return streamWritable ? STREAM_SEGMENT_FRAMES : SEGMENT_FRAMES;
    }

    function normalizeFfmpegBytes(data, label) {
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      if (byteLength(bytes) < 1024) {
        throw new Error(`${label} produced empty output (${byteLength(bytes)} bytes)`);
      }
      return bytes;
    }

    async function loadMergeParts(keys, label) {
      const parts = await Promise.all(keys.map((k) => getExportSegment(k)));
      const sizes = parts.map((p) => byteLength(p));      for (let p = 0; p < parts.length; p++) {
        if (!parts[p] || byteLength(parts[p]) < 1024) {
          throw new Error(`${label} missing part ${p} (key ${keys[p]}, ${sizes[p] ?? 0} bytes)`);
        }
      }
      return parts;
    }

    async function concatMp4Parts(parts, outName, label) {
      for (let p = 0; p < parts.length; p++) {
        if (!parts[p] || byteLength(parts[p]) < 1024) {
          throw new Error(`${label} missing part ${p}`);
        }
        await ffmpeg.writeFile(`part${padFrame(p)}.mp4`, parts[p]);
      }
      const list = parts.map((_, p) => `file 'part${padFrame(p)}.mp4'`).join('\n');
      await ffmpeg.writeFile('concat.txt', list);
      await assertExec(ffmpeg, [
        '-f', 'concat', '-safe', '0', '-i', 'concat.txt',
        '-c', 'copy', outName,
      ], label);
      await ffmpeg.deleteFile('concat.txt').catch(() => {});
      for (let p = 0; p < parts.length; p++) {
        await ffmpeg.deleteFile(`part${padFrame(p)}.mp4`).catch(() => {});
      }
      const merged = await ffmpeg.readFile(outName);
      await ffmpeg.deleteFile(outName).catch(() => {});
      return normalizeFfmpegBytes(merged, label);
    }

    async function collapseMergeTiers() {
      // Defer all segment merging to finalizeSegmentQueue — avoids IDB churn during encode.
    }

    async function finalizeSegmentQueue() {
      /** @type {string[]} */
      let keys = mergeTiers.flat();
      let round = 0;
      const estimatedRounds = Math.max(1, Math.ceil(Math.log2(keys.length)));
      while (keys.length > 1) {
        /** @type {string[]} */
        const next = [];
        const roundPairs = Math.ceil(keys.length / 2);
        for (let i = 0; i < keys.length; i += 2) {
          if (i + 1 >= keys.length) {
            next.push(keys[i]);
            continue;
          }
          const pairKeys = [keys[i], keys[i + 1]];
          const parts = await loadMergeParts(pairKeys, `Final round ${round}`);
          await deleteExportSegment(keys[i]);
          await deleteExportSegment(keys[i + 1]);
          const merged = await concatMp4Parts(parts, 'batch_out.mp4', `Final round ${round}`);
          const mergedKey = nextSegmentKey();
          await putExportSegment(mergedKey, merged);
          next.push(mergedKey);
          await resetFfmpegWorker();
          const pairIdx = i / 2;
          onProgress?.(
            76 + ((round + pairIdx / roundPairs) / estimatedRounds) * 19,
            `Joining segments (round ${round + 1}/${estimatedRounds})…`,
          );
        }
        keys = next;
        round += 1;
      }
      if (!keys.length) return null;
      const finalBytes = await getExportSegment(keys[0]);      return finalBytes;
    }

    async function concatTsParts(ff, parts, outName, label) {
      for (let p = 0; p < parts.length; p++) {
        await ff.writeFile(`tspart${padFrame(p)}.ts`, parts[p]);
      }
      const list = parts.map((_, p) => `file 'tspart${padFrame(p)}.ts'`).join('\n');
      await ff.writeFile('tsconcat.txt', list);
      await assertExec(ff, [
        '-f', 'concat', '-safe', '0', '-i', 'tsconcat.txt',
        '-c', 'copy', '-f', 'mpegts', outName,
      ], label);
      await ff.deleteFile('tsconcat.txt').catch(() => {});
      for (let p = 0; p < parts.length; p++) {
        await ff.deleteFile(`tspart${padFrame(p)}.ts`).catch(() => {});
      }
    }

    async function remuxTsToMp4(ff, tsName, mp4Name, label) {
      await assertExec(ff, [
        '-f', 'mpegts', '-i', tsName,
        '-c', 'copy', '-movflags', '+faststart', mp4Name,
      ], label);
    }

    async function flushSegment() {
      if (segmentLocalIdx === 0) return;
      const segName = streamWritable
        ? `seg_${padFrame(segmentIdx)}.ts`
        : `seg_${padFrame(segmentIdx)}.mp4`;
      onProgress?.(
        3 + (globalIdx / outputFrameCount) * (streamWritable ? 95 : renderWeight),
        streamWritable
          ? `Writing segment ${segmentIdx + 1}…`
          : `Encoding segment ${segmentIdx + 1}…`,
      );
      try {
        const execArgs = [
          '-framerate', String(exportFps),
          '-i', 'frame%06d.jpg',
          '-frames:v', String(segmentLocalIdx),
          '-c:v', 'libx264',
          '-pix_fmt', 'yuv420p',
          '-preset', x264Preset,
          '-crf', crf,
        ];
        if (streamWritable) {
          const tsOffset = streamFrameOffset / exportFps;
          execArgs.push(
            '-vsync', 'cfr',
            '-force_key_frames', 'expr:eq(n,0)',
            '-g', String(Math.max(segmentLocalIdx, 1)),
            '-keyint_min', '1',
            '-sc_threshold', '0',
          );
          if (tsOffset > 0.001) {
            execArgs.push('-output_ts_offset', tsOffset.toFixed(6));
          }
          execArgs.push('-f', 'mpegts');
        }
        execArgs.push(segName);
        await assertExec(ffmpeg, execArgs, `Segment ${segmentIdx}`);
        for (let j = 0; j < segmentLocalIdx; j++) {
          await ffmpeg.deleteFile(`frame${padFrame(j)}.jpg`).catch(() => {});
        }
        const segBytes = await ffmpeg.readFile(segName);
        await ffmpeg.deleteFile(segName).catch(() => {});
        const segLen = byteLength(segBytes);
        if (segLen < 1024) {
          throw new Error(`Segment ${segmentIdx} produced empty output (${segLen} bytes)`);
        }
        const segData = segBytes instanceof Uint8Array ? segBytes : new Uint8Array(segBytes);
        if (streamWritable) {
          if (streamVideoParts) {
            streamVideoParts.push(segData);
          }
          await writeStreamChunks(streamWritable, segData);
          streamBytesWritten += segLen;
          streamFrameOffset += segmentLocalIdx;
          await resetFfmpegWorker();
        } else if (preview && !streamWritable) {
          previewVideoBytes = segData;        } else {
          const segKey = nextSegmentKey();
          await putExportSegment(segKey, segData);
          mergeTiers[0].push(segKey);
          await collapseMergeTiers();
        }
      } catch (segErr) {
        throw exportError('Segment encode', segErr);
      }
      segmentIdx += 1;
      segmentLocalIdx = 0;
    }

    /** @type {object|null} */
    let lastAudioFrame = null;

    for (globalIdx = 0; globalIdx < outputFrameCount; globalIdx += 1) {
      const clipLocalTime = (globalIdx * frameStep) / exportFps;
      const visualTime = clipStart + livingSongVisualTimeAt(clipLocalTime, clipDuration);

      if (globalIdx < audioFrameCount) {
        const i = startFrame + globalIdx * frameStep;
        lastAudioFrame = { ...frames[i], time: visualTime };
        frames[i] = null;
      } else if (lastAudioFrame) {
        lastAudioFrame = { ...lastAudioFrame, time: visualTime };
      } else {
        const i = Math.max(startFrame, endFrame - 1);
        lastAudioFrame = { ...(frames[i] ?? {}), time: visualTime };
      }

      const progressLabel = clipLocalTime > clipDuration
        ? `Holding final frame… ${globalIdx + 1} / ${outputFrameCount}`
        : `Rendering ${globalIdx + 1} / ${outputFrameCount}…`;

      try {
        const automationTime = Math.min(visualTime, clipEnd - 1 / FPS);
        exportSession.drawFrameAt(offCtx, lastAudioFrame, visualTime, automationTime);
        const blob = await canvasToJpeg(offscreen, jpegQuality);
        const bytes = new Uint8Array(await blob.arrayBuffer());
        await ffmpeg.writeFile(`frame${padFrame(segmentLocalIdx)}.jpg`, bytes);
      } catch (frameErr) {
        throw exportError('Frame render', frameErr);
      }

      segmentLocalIdx += 1;

      if (globalIdx % 5 === 0 || globalIdx + 1 === outputFrameCount) {
        onProgress?.(
          3 + ((globalIdx + 1) / outputFrameCount) * (streamWritable ? 95 : renderWeight),
          progressLabel,
        );
      }

      if (segmentLocalIdx >= framesPerSegment()) {
        await flushSegment();
      }

      if (globalIdx > 0 && globalIdx % 200 === 0) {
        exportSession.dispose();
        exportSession = createExportSession(width, height, automationKeyframes ?? null);
      }

      if (globalIdx % 3 === 0) await yieldToMain();
    }

    await flushSegment();

    if (streamWritable) {
      await streamWritable.close();
      streamWritable = null;

      const useSidecarForAudio = needsAudioMux && streamBytesWritten > STREAM_MUX_IN_BROWSER_MAX;
      const willMuxInBrowser = needsAudioMux && outputFileHandle && !useSidecarForAudio;
      let streamNeedsRemux = false;

      if (outputFileHandle && streamBytesWritten > 0 && !willMuxInBrowser) {
        try {
          const fin = await finalizeStreamedVideoOnDisk(
            outputFileHandle,
            streamBytesWritten,
            onProgress,
            resetFfmpegWorker,
          );
          if (fin.finalized) {
            streamBytesWritten = fin.byteLength;
          } else {
            streamNeedsRemux = true;
          }
        } catch (finErr) {          streamNeedsRemux = true;
        }
      }

      if (needsAudioMux && outputFileHandle) {
        onProgress?.(88, 'Adding audio…');
        try {
          await resetFfmpegWorker();
          /** @type {Uint8Array[]|null} */
          const savedVideoParts = streamVideoParts;
          streamVideoParts = null;

          const holdPad = Math.max(0, exportDuration - clipDuration);
          const useSidecarAudio = streamBytesWritten > STREAM_MUX_IN_BROWSER_MAX;

          async function encodeStreamAudioAac() {
            if (audioBuffer) {
              const wavEndSec = clipStart + exportDuration;
              const wavBytes = await writeAudioSliceWavToFfmpeg(
                ffmpeg,
                audioBuffer,
                clipStart,
                wavEndSec,
                'stream_clip.wav',
                (args, label) => assertExec(ffmpeg, args, label),
              );              await assertExec(ffmpeg, [
                '-i', 'stream_clip.wav',
                '-c:a', 'aac', '-b:a', '192k',
                STREAM_AUDIO_AAC,
              ], 'Stream audio encode');
              await ffmpeg.deleteFile('stream_clip.wav').catch(() => {});
              return;
            }
            await ffmpeg.unmount(exportMediaMount).catch(() => {});
            const wrapped = workfsFile(audioFile, STREAM_AUDIO_SAFE);
            const ok = await ffmpeg.mount(
              FFFSType.WORKERFS,
              { files: [wrapped] },
              exportMediaMount,
            );
            if (!ok) throw new Error('WORKERFS audio mount failed');
            exportMediaMounted = true;
            audioMounted = true;
            const audioInput = `${exportMediaMount}/${STREAM_AUDIO_SAFE}`;
            const audioEncodeArgs = [
              '-ss', String(clipStart),
              '-i', audioInput,
              '-t', String(clipDuration),
            ];
            if (holdPad > 0.01) {
              audioEncodeArgs.push('-af', `apad=pad_dur=${holdPad.toFixed(3)}`);
            }
            audioEncodeArgs.push('-c:a', 'aac', '-b:a', '192k', STREAM_AUDIO_AAC);
            await assertExec(ffmpeg, audioEncodeArgs, 'Stream audio encode');
            await ffmpeg.unmount(exportMediaMount).catch(() => {});
            exportMediaMounted = false;
          }

          onProgress?.(89, 'Encoding audio track…');
          await encodeStreamAudioAac();

          const audioAacSize = byteLength(await ffmpeg.readFile(STREAM_AUDIO_AAC));
          if (useSidecarAudio) {
            onProgress?.(95, 'Saving audio track…');
            const aacBytes = await ffmpeg.readFile(STREAM_AUDIO_AAC);
            await ffmpeg.deleteFile(STREAM_AUDIO_AAC).catch(() => {});
            const aacBlob = new Blob([aacBytes instanceof Uint8Array ? aacBytes : new Uint8Array(aacBytes)], {
              type: 'audio/mp4',
            });
            const aacUrl = URL.createObjectURL(aacBlob);
            const aacLink = document.createElement('a');
            aacLink.href = aacUrl;
            const base = audioFile.name.replace(/\.(mp3|wav|m4a|flac|ogg|aac)$/i, '');
            aacLink.download = `${base}-visualizer-audio.m4a`;
            aacLink.click();
            URL.revokeObjectURL(aacUrl);            onProgress?.(100, 'Video saved — audio downloaded separately');
            return {
              streamed: true,
              byteLength: streamBytesWritten,
              audioSidecar: true,
              needsRemux: streamNeedsRemux,
            };
          }

          const videoFile = await outputFileHandle.getFile();
          onProgress?.(92, 'Muxing audio into video…');
          let videoPath = STREAM_VIDEO_SAFE;
          if (savedVideoParts?.length) {
            const partCount = savedVideoParts.length;
            const tsMerged = 'stream_video.ts';
            if (partCount > 1) {
              await concatTsParts(ffmpeg, savedVideoParts, tsMerged, 'Stream video concat');
            } else {
              await ffmpeg.writeFile(tsMerged, savedVideoParts[0]);
            }
            await remuxTsToMp4(ffmpeg, tsMerged, STREAM_VIDEO_SAFE, 'Stream video remux');
            await ffmpeg.deleteFile(tsMerged).catch(() => {});          } else {
            const videoBytes = await readBlobFileBytes(videoFile);            if (videoBytes.byteLength < 1024) {
              throw new Error(
                `Video read back empty (${videoBytes.byteLength} bytes, expected ~${streamBytesWritten}). `
                + 'Try Chrome/Edge or a shorter clip.',
              );
            }
            await ffmpeg.writeFile('stream_readback.ts', videoBytes);
            await remuxTsToMp4(ffmpeg, 'stream_readback.ts', STREAM_VIDEO_SAFE, 'Stream video remux');
            await ffmpeg.deleteFile('stream_readback.ts').catch(() => {});
          }
          const videoReadySize = byteLength(await ffmpeg.readFile(STREAM_VIDEO_SAFE));
          if (videoReadySize < 1024) {
            throw new Error(`Video prepare for mux produced empty file (${videoReadySize} bytes)`);
          }          const muxArgs = [
            '-i', videoPath,
            '-i', STREAM_AUDIO_AAC,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'copy',
            '-c:a', 'copy',
            '-fflags', '+genpts',
            '-t', String(exportDuration),
            'output.mp4',
          ];          await assertExec(ffmpeg, muxArgs, 'Stream mux');
          await ffmpeg.deleteFile(STREAM_VIDEO_SAFE).catch(() => {});
          await ffmpeg.deleteFile(STREAM_AUDIO_AAC).catch(() => {});

          onProgress?.(96, 'Writing final file…');
          let muxed;
          try {
            muxed = await ffmpeg.readFile('output.mp4');
          } catch (readErr) {
            const readMsg = String(readErr?.message ?? readErr);            if (readMsg.includes('Array buffer allocation failed')) {
              throw new Error(
                'Mux finished but the file is too large to load in memory. '
                + 'Your video-only file is saved — uncheck Include audio, or use a shorter clip.',
              );
            }
            throw new Error(
              'Mux succeeded but reading the final file failed. '
              + 'Your video-only file was already saved — try Export without audio, or use a shorter clip.',
            );
          }
          await ffmpeg.deleteFile('output.mp4').catch(() => {});
          const muxedBytes = muxed instanceof Uint8Array ? muxed : new Uint8Array(muxed);          const finalWritable = await outputFileHandle.createWritable();
          await writeStreamChunks(finalWritable, muxedBytes);
          await finalWritable.close();
          onProgress?.(100, 'Saved to file');
          return { streamed: true, byteLength: muxedBytes.byteLength };
        } catch (streamMuxErr) {          throw exportError('Stream audio mux', streamMuxErr);
        }
      }

      if (streamNeedsRemux) {
        onProgress?.(100, 'Video saved (convert with ffmpeg for QuickTime)');
        return {
          streamed: true,
          byteLength: streamBytesWritten,
          needsRemux: true,
        };
      }

      onProgress?.(100, 'Saved to file');
      return { streamed: true, byteLength: streamBytesWritten };
    }

    let outputBytes;
    if (preview && !streamWritable && previewVideoBytes) {
      outputBytes = previewVideoBytes;    } else {
      onProgress?.(76, 'Joining segments…');
      outputBytes = await finalizeSegmentQueue();
    }
    if (!outputBytes || byteLength(outputBytes) < 1024) {
      throw new Error(`Export produced no video segments (${byteLength(outputBytes)} bytes)`);
    }

    onProgress?.(78, 'Finalizing MP4…');
    ffmpeg.off('progress', onFfmpegProgress);

    if (needsAudioMux) {
      audioPath = await prepareAudioForMux();
      await ffmpeg.writeFile(MERGED_MP4, outputBytes);
      const muxArgs = [
        '-i', MERGED_MP4,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', preview ? '128k' : '192k',
        '-t', String(exportDuration),
        'output.mp4',
      ];      const muxCode = await ffmpeg.exec(muxArgs);      if (muxCode !== 0) {
        throw new Error(`Final mux with audio failed (FFmpeg exit code ${muxCode})`);
      }
      await ffmpeg.deleteFile(MERGED_MP4).catch(() => {});
      if (audioPath === EXPORT_AUDIO_WAV) {
        await ffmpeg.deleteFile(EXPORT_AUDIO_WAV).catch(() => {});
      }

      onProgress?.(95, 'Finalizing…');
      let data;
      try {
        data = await ffmpeg.readFile('output.mp4');
      } catch (readErr) {
        throw exportError('Read output', readErr);
      }

      const mp4Blob = new Blob([data instanceof Uint8Array ? data : new Uint8Array(data)], { type: 'video/mp4' });
      await ffmpeg.deleteFile('output.mp4').catch(() => {});
      onProgress?.(100, 'Done!');
      return mp4Blob;
    }

    onProgress?.(100, 'Done!');
    const mp4Blob = new Blob([outputBytes instanceof Uint8Array ? outputBytes : new Uint8Array(outputBytes)], { type: 'video/mp4' });
    return mp4Blob;
  } catch (err) {
    if (err instanceof Error && String(err.message ?? '').trim()) throw err;
    throw exportError('Export', err);
  } finally {
    if (streamWritable) {
      try { await streamWritable.close(); } catch { /* ignore */ }
      streamWritable = null;
    }
    if (audioMounted) {
      try {
        const ffmpeg = await getFFmpeg();
        await ffmpeg.unmount(audioMountPoint);
      } catch {
        /* ignore */
      }
    }
    if (exportMediaMounted) {
      try {
        const ffmpeg = await getFFmpeg();
        await ffmpeg.unmount(exportMediaMount);
      } catch {
        /* ignore */
      }
    }
    exportSession.dispose();
    await clearExportSegments(exportId).catch(() => {});
  }
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode frame'))), 'image/jpeg', quality);
  });
}
