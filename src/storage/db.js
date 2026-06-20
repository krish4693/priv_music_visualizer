const DB_NAME = 'music-visualizer';
const DB_VERSION = 1;
const AUDIO_STORE = 'audio';
const IMAGE_STORE = 'images';

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
    };
  });
}

function tx(store, mode) {
  return openDb().then((db) => db.transaction(store, mode).objectStore(store));
}

export async function saveAudio(file) {
  const id = 'current-audio';
  const record = {
    id,
    name: file.name,
    type: file.type,
    blob: file,
    savedAt: Date.now(),
  };
  const store = await tx(AUDIO_STORE, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAudio() {
  const store = await tx(AUDIO_STORE, 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get('current-audio');
    req.onsuccess = () => {
      const rec = req.result;
      if (!rec?.blob) return resolve(null);
      const file = new File([rec.blob], rec.name, { type: rec.type || 'audio/mpeg' });
      resolve(file);
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
