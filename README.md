# Music Visualizer

Upload an MP3 or WAV, preview a live audio-reactive visualization in your browser, and export a 720p MP4 synced to the full track length.

## Features

- Drag-and-drop MP3 / WAV upload
- Live preview (frequency bars + waveform) while playing
- Offline frame rendering driven by FFT analysis (RMS, bass/mid/high bands)
- Local MP4 export via ffmpeg.wasm — no server, audio stays on your machine

## Requirements

- Modern browser (Chrome or Edge recommended for export)
- ffmpeg.wasm loads ~25 MB on first export

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown (usually http://localhost:5173).

On first load (no saved files in browser storage), the app auto-loads bundled dev samples:
- `public/samples/aboud-vs-flab.wav` — *02 AboudVsFlab*
- `public/samples/flab-the-blue-monk.jpg` — FLAB cover art

## Usage

1. Drop or select an MP3 or WAV file
2. Click **Play** to preview the visualization
3. Click **Export MP4 (720p)** to render and download the video

Export time depends on track length (roughly 1–3× realtime for a 3-minute song). Shorter tracks work best for the first try.

## Tech

- Vite + vanilla JS
- Web Audio API (decode + live analyser)
- Custom FFT for per-frame analysis at 30 fps
- Canvas 2D renderer (1280×720)
- @ffmpeg/ffmpeg for MP4 muxing
