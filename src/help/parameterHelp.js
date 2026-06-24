/** @typedef {{ name: string, desc: string, when?: string }} HelpItem */
/** @typedef {{ id: string, title: string, items: HelpItem[] }} HelpSection */

/** @type {HelpSection[]} */
export const HELP_SECTIONS = [
  {
    id: 'scene',
    title: 'Scene settings (top)',
    items: [
      { name: 'Visual concept', desc: 'Chooses the whole style: geometric shapes, particles, lava, Living Song, Globe, etc.' },
      { name: 'Globe shape', desc: 'Shape of each Globe blob (sphere, torus, cube…).', when: 'Living Song · Globe only' },
      { name: 'Detail', desc: 'Line/tube density on each Globe blob. Higher = busier lines.', when: 'Globe only' },
      { name: 'Line profile', desc: 'Round or square tubes on Globe.', when: 'Globe only' },
      { name: 'Shape types', desc: 'Which 3D shapes can appear (cube, oval, pillar…).', when: 'Geometric concept only' },
    ],
  },
  {
    id: 'session',
    title: 'Session & color (top)',
    items: [
      { name: 'Active audio', desc: 'Load MP3 or WAV. Track 09 — The Blue Monk loads automatically on first visit.' },
      { name: 'Save / Open config', desc: 'Save or restore the full session (look, colors, clip, automation).' },
      { name: 'Visualization palette', desc: 'Click a swatch to use it; Add for custom colors.' },
      { name: 'BG', desc: 'Background color behind the scene.' },
    ],
  },
  {
    id: 'export',
    title: 'Export (top)',
    items: [
      { name: 'From / To', desc: 'Start and end of the clip to export (seconds).' },
      { name: 'Preview clip', desc: 'Quick short MP4 of the selected range.' },
      { name: 'Include audio', desc: 'Put the song in the exported video or not.' },
      { name: 'Export full MP4', desc: 'Render the full video file.' },
    ],
  },
  {
    id: 'variation',
    title: 'Clip variation (left)',
    items: [
      { name: 'Rounded edges', desc: 'Softer, rounder shape corners.' },
      { name: 'Kanten', desc: 'Dark edge outlines on shapes.' },
      { name: 'Corner roundness', desc: 'How round corners are (with Rounded edges on).' },
      { name: 'Color cycling', desc: 'Manual = palette only · Tempo = follows BPM · Energy = reacts to beats & volume.' },
      { name: 'Color shift', desc: 'How much colors change and blend (when not Manual).' },
      { name: 'Shape count', desc: 'How many shapes/blobs/elements (1–28).' },
      { name: 'Element size From / To', desc: 'Smallest → largest size across all elements.' },
      { name: 'Element distance From / To', desc: 'Closest → widest spacing; elements gently push apart when overlapping.' },
      { name: 'Size spread', desc: 'How randomly sizes differ inside the size range.' },
      { name: 'Layout spread', desc: 'How scattered shapes are on screen.' },
      { name: 'Fixed layout', desc: 'On = shapes stay in place. Off = they drift with the music.' },
      { name: 'Depth range', desc: 'How far shapes sit in front/behind (3D depth).' },
      { name: 'Spin intensity', desc: 'How fast shapes rotate.' },
      { name: 'Speed spread', desc: 'Low = similar speeds · High = more random speeds.' },
      { name: 'Motion activity', desc: 'Overall amount of movement.' },
      { name: 'Element turn', desc: 'How much elements spin/rotate.' },
      { name: '3D motion', desc: 'Movement in depth (forward/back, up/down).' },
      { name: 'Motion speed', desc: 'Animation speed only (¼× … 16×). Music stays normal.' },
      { name: 'Manual speed', desc: 'Ignore music for motion; use the slider instead.' },
      { name: 'Surprises', desc: 'Random bursts (bigger spin, scale jumps…).' },
      { name: 'Surprise rate', desc: 'How often surprises happen.' },
      { name: 'Global viscosity', desc: 'High = smooth, heavy motion. Low = snappy reactions to music.' },
      { name: 'Flow speed / Thickness / Relief / Turbulence', desc: 'Volcano lava look and flow.', when: 'Volcano lava concept' },
      { name: 'Surface wobble', desc: 'Organic wobble on Living Song lines; reacts to bass and BPM.', when: 'Living Song concepts' },
    ],
  },
  {
    id: 'preview',
    title: 'Preview (center)',
    items: [
      { name: 'Renderer', desc: 'Pop Art = classic 2D · Cinematic = WebGL with lights and effects.' },
      { name: 'Camera zoom', desc: '0 = very far (tiny dots) · 50 = normal · 100 = very close / inside shapes.' },
      { name: 'Play / Stop / Mute', desc: 'Playback controls.' },
      { name: 'Timeline', desc: 'Scrub through the song.' },
      { name: 'Record / Clear', desc: 'Record slider changes while playing; clear recording.' },
    ],
  },
  {
    id: 'right',
    title: 'Right panel (click header to open — narrows column when collapsed)',
    items: [
      { name: 'Cinematic look', desc: 'Fog, bloom, lights, materials, letterbox, film grain, floor, shadows.', when: 'Cinematic or Living Song' },
      { name: 'Parameter mapping', desc: 'Connects bass/mids/beats to geometry, color, motion, and morphing.' },
      { name: 'Song analysis', desc: 'Live readout of bass, mids, highs, volume, tempo, and beat pulse.' },
    ],
  },
  {
    id: 'cinematic',
    title: 'Cinematic look sliders',
    items: [
      { name: 'Fog / Bloom / Vignette / Exposure', desc: 'Atmosphere and brightness.' },
      { name: 'Key / Fill / Rim / Ambient / Front light', desc: 'Lighting setup.' },
      { name: 'Surface metal / roughness / emissive', desc: 'Material look.' },
      { name: 'Letterbox / Film grain / Camera orbit', desc: 'Film framing and camera motion.' },
      { name: 'Floor reflectivity / Ground floor / Cast shadows', desc: 'Floor and shadows.' },
      { name: 'True swatch colors', desc: 'On = match palette squares · Off = natural lit look.' },
    ],
  },
  {
    id: 'mapping',
    title: 'Parameter mapping rows',
    items: [
      { name: 'Geometry / Size', desc: 'Scale, depth, line thickness.' },
      { name: 'Color dynamics', desc: 'How colors shift and blend.' },
      { name: 'Motion / Drift', desc: 'Speed and rotation.' },
      { name: 'Shape morphing', desc: 'How fast shapes change into other shapes.' },
      { name: 'Source / Sens. / In use', desc: 'Which audio signal drives each property and how strongly.' },
    ],
  },
];
