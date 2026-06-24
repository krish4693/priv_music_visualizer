import { audioFileFingerprint, serializeAnalysis } from '../audio/analyzer.js';

const DB_NAME = 'music-visualizer';
const DB_VERSION = 2;
const AUDIO_STORE = 'audio';
const IMAGE_STORE = 'images';
const EXPORT_SEG_STORE = 'exportSegments';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(EXPORT_SEG_STORE)) {
        db.createObjectStore(EXPORT_SEG_STORE, { keyPath: 'id' });
      }
    };
  });
}

function tx(store, mode) {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}

/**
 * @param {File} file
 * @param {object|null} [analysis]
 */
export async function saveAudio(file, analysis = null) {
  const id = 'current-audio';
  const record = {
    id,
    name: file.name,
    type: file.type,
    blob: file,
    savedAt: Date.now(),
    fingerprint: audioFileFingerprint(file),
  };
  if (analysis) record.analysis = serializeAnalysis(analysis);

  const store = await tx(AUDIO_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

/** @param {object} analysis */
export async function saveAudioAnalysis(analysis) {
  const store = await tx(AUDIO_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const getReq = store.get('current-audio');
    getReq.onerror = () => reject(getReq.error);
    getReq.onsuccess = () => {
      const rec = getReq.result;
      if (!rec) {
        resolve(null);
        return;
      }
      rec.analysis = serializeAnalysis(analysis);
      const putReq = store.put(rec);
      putReq.onsuccess = () => resolve(rec);
      putReq.onerror = () => reject(putReq.error);
    };
  });
}

/** @returns {Promise<{ file: File, fingerprint: string, analysis: object|null }|null>} */
export async function loadAudio() {
  const store = await tx(AUDIO_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get('current-audio');
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec?.blob) return resolve(null);
      const file = new File([rec.blob], rec.name, {
        type: rec.type || 'audio/mpeg',
        lastModified: rec.savedAt ?? Date.now(),
      });
      resolve({
        file,
        fingerprint: rec.fingerprint ?? audioFileFingerprint(file),
        analysis: rec.analysis ?? null,
      });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveImage(file, palette) {
  const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    name: file.name,
    type: file.type,
    blob: file,
    palette,
    savedAt: Date.now(),
  };
  const store = await tx(IMAGE_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAllImages() {
  const store = await tx(IMAGE_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteImage(id) {
  const store = await tx(IMAGE_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearImages() {
  const store = await tx(IMAGE_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} id @param {Blob|Uint8Array} data */
export async function putExportSegment(id, data) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: 'video/mp4' });
  const store = await tx(EXPORT_SEG_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put({ id, blob, savedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} id @returns {Promise<Uint8Array|null>} */
export async function getExportSegment(id) {
  const db = await openDb();
  const rec = await new Promise((resolve, reject) => {
    const tx = db.transaction(EXPORT_SEG_STORE, 'readonly');
    const req = tx.objectStore(EXPORT_SEG_STORE).get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  if (!rec?.blob) return null;
  return new Uint8Array(await rec.blob.arrayBuffer());
}

/** @param {string} id */
export async function deleteExportSegment(id) {
  const store = await tx(EXPORT_SEG_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** @param {string} exportId */
export async function clearExportSegments(exportId) {
  const store = await tx(EXPORT_SEG_STORE, 'readwrite');
  const prefix = `${exportId}:`;
  return new Promise((resolve, reject) => {
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const keys = (req.result ?? []).filter((k) => String(k).startsWith(prefix));
      if (!keys.length) {
        resolve();
        return;
      }
      let pending = keys.length;
      keys.forEach((key) => {
        const del = store.delete(key);
        del.onsuccess = () => { if (--pending === 0) resolve(); };
        del.onerror = () => reject(del.error);
      });
    };
    req.onerror = () => reject(req.error);
  });
}
