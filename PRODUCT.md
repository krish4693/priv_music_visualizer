# Product

## Register

product

## Users

Musicians and producers making audio-reactive visualizers for their own tracks — releases, YouTube, social clips. They upload a track, tune parameters while watching it react live, and export a finished 1080p MP4. Session is typically solo, focused, iterative: adjust a slider, watch the preview, adjust again.

## Product Purpose

A browser-based tool that turns an MP3/WAV into a tuned, exportable audio-reactive visualization. Two renderers (Pop Art Canvas 2D, Cinematic WebGL/Three.js), a parameter-mapping system routing audio features (bass, mids, beats, energy) to geometry/color/motion, and a config save/restore system so a look can be dialed in and reused. Success = the user can go from raw audio to a video they're proud to publish, without fighting the tool to get there.

## Brand Personality

Precise/technical, moody/cinematic, playful/energetic. This is professional-grade creative tooling that should feel like it belongs next to the visuals it produces — not a generic form-filling dashboard bolted onto a canvas. Confident with dense technical readouts (exact percentages, live audio levels) rendered with intention, not just default form controls. Dark, atmospheric surface; controls should feel like a precise instrument, and the moments where the visualization itself is the star (playback, export) should feel alive.

## Anti-references

Generic AI-generated SaaS dashboard: purple gradient accents, rounded cards everywhere (including nested cards), generic system-font labels, templated panel-in-a-box layout repeated without variation, uniform spacing with no hierarchy. This is what the current UI looks like today and is explicitly what we're moving away from.

## Design Principles

- **The visualization is the product; the UI is the instrument panel around it.** Controls should never visually compete with or outweigh the preview — but they also shouldn't look like an afterthought. Precision and craft in the chrome signal precision and craft in the output.
- **Dense but not cluttered.** This tool has a lot of parameters (audio response, motion, clip variation, palette, export). Reference pro audio/video tools (Ableton, Resolume, TouchDesigner) for how real control-surface density stays legible: grouping, typographic hierarchy, and consistent rhythm — not fewer controls.
- **Technical readouts are a design opportunity, not a default.** Live audio levels, percentages, timecodes — these are the tool's real content and deserve the same typographic care as any headline, not default browser-input styling.
- **No templated panel-in-a-box repetition.** Every section shouldn't look like the same rounded card with a label on top. Vary treatment by what the section actually is (a live meter, a toggle group, a destructive export action, a color palette) rather than a uniform component reused everywhere.
- **Respect the moody-cinematic register even in idle/empty states.** The tool should feel considered before a file is even loaded, not just once a visualization is playing.

## Accessibility & Inclusion

WCAG AA contrast minimum throughout, including on the dark surface (verify muted/secondary text specifically — the most common failure point). All animated UI chrome (not the audio-reactive visualization itself, which is the point) respects `prefers-reduced-motion`. Keyboard-operable controls for all sliders/toggles/dropdowns.
