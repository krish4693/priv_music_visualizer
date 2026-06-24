function writeAscii(view, offset, text) {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

/**
 * Encode an audio slice as 16-bit PCM WAV. Samples beyond the buffer are zero (silence).
 * @param {AudioBuffer} buffer
 * @param {number} startSec absolute start in the source buffer
 * @param {number} endSec absolute end (exclusive cap) — may extend past buffer for hold/pad
 * @returns {Uint8Array}
 */
export function encodeAudioBufferSliceToWav(buffer, startSec, endSec) {
  const sampleRate = buffer.sampleRate;
  const numChannels = Math.max(1, buffer.numberOfChannels);
  const bufferSamples = Number.isFinite(buffer.length) && buffer.length > 0
    ? buffer.length
    : Math.floor(buffer.duration * sampleRate);

  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.max(startSample + 1, Math.ceil(endSec * sampleRate));
  const numFrames = endSample - startSample;
  const blockAlign = numChannels * 2;
  const dataSize = numFrames * blockAlign;
  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    const srcIdx = startSample + i;
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = srcIdx < bufferSamples ? (buffer.getChannelData(ch)[srcIdx] ?? 0) : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
      offset += 2;
    }
  }
  return out;
}

/** ~1.7 MB PCM @ 44.1 kHz stereo — conservative for low-memory tabs. */
const WAV_CHUNK_SECONDS = 10;

/**
 * Write a WAV slice to FFmpeg MEMFS, chunking long clips to avoid OOM.
 * @param {import('@ffmpeg/ffmpeg').FFmpeg} ffmpeg
 * @param {AudioBuffer} buffer
 * @param {number} startSec
 * @param {number} endSec
 * @param {string} outName
 * @param {(args: string[], label: string) => Promise<number>} exec
 */
export async function writeAudioSliceWavToFfmpeg(ffmpeg, buffer, startSec, endSec, outName, exec) {
  const durationSec = endSec - startSec;
  if (durationSec <= WAV_CHUNK_SECONDS) {
    const wav = encodeAudioBufferSliceToWav(buffer, startSec, endSec);
    await ffmpeg.writeFile(outName, wav);
    return wav.byteLength;
  }

  /** @type {string[]} */
  const partNames = [];
  let totalBytes = 0;
  for (let t = startSec; t < endSec; t += WAV_CHUNK_SECONDS) {
    const chunkEnd = Math.min(endSec, t + WAV_CHUNK_SECONDS);
    const wav = encodeAudioBufferSliceToWav(buffer, t, chunkEnd);
    totalBytes += wav.byteLength;
    const partName = `audio_part${String(partNames.length).padStart(3, '0')}.wav`;
    await ffmpeg.writeFile(partName, wav);
    partNames.push(partName);
  }

  if (partNames.length === 1) {
    await ffmpeg.writeFile(outName, await ffmpeg.readFile(partNames[0]));
    await ffmpeg.deleteFile(partNames[0]).catch(() => {});
    return totalBytes;
  }

  const list = partNames.map((n) => `file '${n}'`).join('\n');
  await ffmpeg.writeFile('audio_concat.txt', list);
  const code = await exec(
    ['-f', 'concat', '-safe', '0', '-i', 'audio_concat.txt', '-c', 'copy', outName],
    'Audio concat',
  );
  await ffmpeg.deleteFile('audio_concat.txt').catch(() => {});
  for (const n of partNames) await ffmpeg.deleteFile(n).catch(() => {});
  if (code !== 0) throw new Error(`Audio concat failed (FFmpeg exit code ${code})`);
  return totalBytes;
}
