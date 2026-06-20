# Music Visualizer

Upload an MP3 or WAV, preview a live audio-reactive visualization in your browser, and export a **1080p MP4** synced to the full track length.

## Features

- Drag-and-drop MP3 / WAV upload (bundled dev sample loads automatically)
- **Pop Art (Classic)** — Canvas 2D with flat faces and Kanten outlines
- **Cinematic (WebGL)** — Three.js PBR, bloom, fog, film grain, shadows, optional ground floor, 3D song title
- Parameter mapping panel — route bass, mids, beats, etc. to geometry, color, motion, morphing
- Unified **Save config** / **Open config** (`.mviz.json`) — look, automation, renderer mode
- Preview clip export (time range, fast) + full **1080p** export (CRF 18)
- Live preview at 720p; export renders at 1920×1080

## Requirements

- Modern browser (Chrome or Edge recommended for export)
- ffmpeg.wasm loads ~25 MB on first export

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown (usually http://localhost:5173).

On first load, the app tries the bundled sample `public/samples/aboud-vs-flab.wav`, then falls back to audio saved in browser storage.

## Usage

1. Drop or select an MP3 or WAV file (or use the bundled sample)
2. Choose **Pop Art** or **Cinematic** above the preview
3. Tweak mappings, colors, and cinematic settings
4. Click **Play** to preview
5. **Save config** to keep your look; **Open config** to restore
6. **Export full MP4** for 1080p output, or **Preview clip** for a quick range test

Export time depends on track length (roughly 1–3× realtime for a 3-minute song at 1080p).

## Tech

- Vite + vanilla JS
- Web Audio API + custom FFT analysis at 30 fps
- Pop Art: Canvas 2D (`popArtScene.js`)
- Cinematic: Three.js WebGL + post-processing (`cinematicScene.js`)
- @ffmpeg/ffmpeg for MP4 muxing

## Git branches

- `main` — Pop Art classic (tag `popart-v1`)
- `feature/cinematic-threejs` — Cinematic WebGL + config system
