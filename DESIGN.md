<!-- BASELINE SNAPSHOT: captures the current UI as of the pre-redesign state. This is the reference point the redesign moves away from, not a spec to preserve. -->
---
name: Music Parameter Visualizer
description: Browser-based tool for tuning and exporting audio-reactive music visualizations
colors:
  void-bg: "#0a0a12"
  surface: "#12121f"
  border: "#2a2a40"
  text-primary: "#e8e8f0"
  text-muted: "#8888a8"
  accent-violet: "#7c5cff"
  accent-violet-glow: "#a78bfa"
  band-bass: "#ff4d6d"
  band-mid: "#7c5cff"
  band-high: "#4dd4ff"
typography:
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "0.68rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
components:
  panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px"
  button-primary:
    backgroundColor: "{colors.accent-violet}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
---

# Design System: Music Parameter Visualizer

## 1. Overview

**Creative North Star: "Default Violet" — the pattern, not a destination**

This document captures the UI exactly as it stands today, before the redesign: a dark canvas at `#0a0a12`, one violet accent (`#7c5cff`) reused for buttons, active states, and the mid-frequency indicator alike, `system-ui` for every label and readout, and border-radius applied almost uniformly at 4–8px regardless of what the element is. It is functional and legible, and it is also — by the project's own PRODUCT.md anti-reference — indistinguishable from any other AI-scaffolded dark-mode SaaS panel: violet accent, rounded-corners-everywhere, default system font, undifferentiated card-in-a-box repetition.

This baseline exists so the redesign has something concrete to diverge from, not to preserve. Where PRODUCT.md calls for "precise/technical, moody/cinematic, playful/energetic" with the density and craft of pro audio/video tooling (Ableton, Resolume, TouchDesigner), this baseline currently delivers only the "dark" half of that brief — flat, uniform, no typographic hierarchy, no distinctive treatment for the tool's actual content (live audio meters, technical readouts, the palette/export actions).

**Key Characteristics:**
- Single accent hue (`#7c5cff` violet) carries buttons, focus states, and one of three frequency-band colors — no role separation.
- `system-ui` font stack throughout; no display/body pairing, no typographic hierarchy beyond size bumps.
- Border-radius applied near-uniformly (4–8px) to nearly every container, regardless of function.
- Flat by default; exactly one shadow in the entire stylesheet, on a modal-like panel, functioning as an outlier rather than a system.

## 2. Colors

A narrow, low-commitment palette: one dark neutral family, one accent reused for everything, three semi-arbitrary band colors.

### Primary
- **Default Violet** (`#7c5cff`): the sole accent — primary buttons, active toggle states, focus rings, and (confusingly) also the mid-frequency band indicator.

### Secondary
- **Violet Glow** (`#a78bfa`): a lighter tint of the same hue, used for hover/glow states. Not a distinct color, a lightness variant of Primary.

### Tertiary
- **Bass Red** (`#ff4d6d`) / **High Cyan** (`#4dd4ff`): the other two frequency-band indicator colors, paired with Default Violet as the mid band. Read as an arbitrary RGB-adjacent trio rather than a considered palette.

### Neutral
- **Void** (`#0a0a12`): page background. Near-black with a faint cool-violet bias.
- **Surface** (`#12121f`): panel/card background, one step up from Void.
- **Hairline** (`#2a2a40`): the only border color in use, on every panel edge and divider alike.
- **Ink** (`#e8e8f0`): primary text.
- **Fog** (`#8888a8`): secondary/muted text — used for labels, hints, and disabled states without distinction between them.

### Named Rules (current state, to be revised)
**The One Violet Rule (unintentional).** Every interactive and semantic color need is currently served by the same `#7c5cff` or a lightness variant of it. This is not a deliberate restraint strategy — restraint requires other colors to restrain against. It reads as under-resourced, not minimal.

## 3. Typography

**Body Font:** `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (used for every role — labels, values, buttons, headings)

**Character:** None by design — this is the browser default stack, unset. No display face, no pairing, no intentional contrast between roles. Size is the only lever currently pulled (ranging roughly 0.65rem to 1.5rem across the UI), and it's pulled inconsistently — dozens of near-duplicate sizes (0.68rem, 0.7rem, 0.72rem, 0.76rem, 0.78rem, 0.8rem, 0.82rem) with no evident scale logic.

### Hierarchy
- **Body** (400, 0.8rem, 1.4 line-height): the default for most readouts and control labels.
- **Label** (500, 0.68rem, 1.2 line-height): small caption-style text on toggles, chips, and technical values.
- No distinct Display, Headline, or Title role exists — the largest text in the app (1.5rem) is still the system font at default weight.

### Named Rules
**The No-Pairing Problem.** There is currently no display/body contrast at all — a single unstyled system font stack fills every typographic role from section headers to millisecond timecodes.

## 4. Elevation

Flat by default, with exactly one exception: a single `box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45)` on one modal-style panel. Everywhere else, depth (where it exists at all) is conveyed only by the one-step `Void` → `Surface` background shift and the uniform `Hairline` border — not by an actual elevation system.

### Shadow Vocabulary
- **Modal drop** (`box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45)`): the only shadow in the codebase. Applied to one overlay panel; not reused elsewhere, so it reads as an outlier rather than a documented "elevated" state.

### Named Rules
**The Accidental-Flat Rule (current state).** The system is flat not because flatness was chosen as a strategy, but because no elevation system was built. A genuine flat-by-default doctrine would state this on purpose and use tonal layering deliberately; this baseline does neither.

## 5. Components

### Buttons
- **Shape:** 6px radius, same as most other containers — no distinct button shape language.
- **Primary:** `#7c5cff` background, `#e8e8f0` text, ~8px/16px padding.
- **Hover / Focus:** lightens toward `#a78bfa`; no distinct focus-visible treatment observed beyond the hover color.
- **Secondary / Ghost:** transparent background with `#2a2a40` border — visually close to every other bordered panel in the UI, low differentiation from non-interactive containers.

### Panels / Containers
- **Corner Style:** 6–8px radius, applied almost uniformly regardless of whether the container is a settings group, a meter readout, or a modal.
- **Background:** `#12121f` (Surface) on `#0a0a12` (Void) — one step of contrast, repeated at every nesting level.
- **Shadow Strategy:** none, except the single modal outlier noted in Elevation.
- **Border:** `1px solid #2a2a40` on effectively every panel edge — the border does the differentiation work that color/shadow/spacing should be doing instead.
- **Internal Padding:** 16px, consistent but undifferentiated by content type.

### Inputs / Sliders / Toggles
- **Style:** native-leaning form controls with `#2a2a40` borders and `#12121f` backgrounds; ranges/sliders use the accent violet for the filled track.
- **Focus:** relies on browser default focus rings in most cases; no custom focus treatment observed.
- **Live/technical readouts** (audio levels, percentages, timecodes): styled identically to static labels — no monospace/tabular treatment, no visual distinction between a live value and a static caption.

### Navigation
- Panel-based, not a distinct nav bar; sections (Scene Settings / Session & Color / Clip Variation / Export) are laid out as adjacent bordered panels rather than through a navigational hierarchy.

## 6. Do's and Don'ts

Pulled directly from PRODUCT.md's anti-references — the current baseline already violates most of these, which is exactly the gap the redesign closes.

### Do:
- **Do** give the audio-reactive technical readouts (live levels, percentages, timecodes) their own typographic treatment — tabular figures, a distinct label face — instead of reusing the default body style.
- **Do** vary component treatment by function: a live meter, a destructive export action, and a settings toggle group should not all resolve to the same bordered-box-with-16px-padding shape.
- **Do** reference pro audio/video tool density (Ableton, Resolume, TouchDesigner) for how a control-surface stays legible under real information density — grouping and typographic hierarchy, not fewer controls.

### Don't:
- **Don't** carry forward the generic AI-SaaS-dashboard look named explicitly in PRODUCT.md: a single violet accent reused indiscriminately, uniform 4–8px rounded corners on every container, `system-ui` for every text role, and undifferentiated bordered-panel repetition.
- **Don't** let the frequency-band colors (bass/mid/high) share a hue with the UI's own interactive accent — `#7c5cff` currently serving double duty as both "the mid band" and "the primary button color" is a legibility and meaning collision, not an economy.
- **Don't** apply the same border-radius to a settings panel, a button, and a modal indiscriminately — radius should communicate something about the element's role, not be a global reset value.
