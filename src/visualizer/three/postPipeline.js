import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.1 },
    darkness: { value: 1.15 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * vec2(offset);
      float vig = 1.0 - dot(uv, uv);
      color.rgb *= clamp(pow(vig, darkness), 0.0, 1.0);
      gl_FragColor = color;
    }
  `,
};

const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    amount: { value: 0.12 },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float amount;
    uniform float time;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7)) + time) * 43758.5453);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float n = hash(vUv * vec2(1920.0, 1080.0) + time * 17.0) - 0.5;
      color.rgb += n * amount;
      gl_FragColor = color;
    }
  `,
};

/** @param {{ bloom: UnrealBloomPass, vignette: ShaderPass, grain: ShaderPass, time: number }} pipeline @param {import('../cinematicSettingsStore.js').CinematicSettings} settings */
export function applyPostSettings(pipeline, settings) {
  const bloomStrength = (settings.bloom / 100) * 1.15;
  const bloomRadius = 0.08 + (settings.bloomRadius / 100) * 0.72;
  pipeline.bloom.strength = bloomStrength;
  pipeline.bloom.radius = bloomRadius;
  pipeline.bloom.threshold = Math.max(0.55, 0.92 - bloomStrength * 0.35);

  const vig = settings.vignette / 100;
  pipeline.vignette.uniforms.offset.value = 0.85 + vig * 0.55;
  pipeline.vignette.uniforms.darkness.value = 0.65 + vig * 1.35;

  const grainAmt = (settings.filmGrain / 100) * 0.22;
  pipeline.grain.uniforms.amount.value = grainAmt;
}

/** @param {number} time */
export function updatePostTime(pipeline, time) {
  if (pipeline?.grain) pipeline.grain.uniforms.time.value = time;
}

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {number} width
 * @param {number} height
 * @param {import('../cinematicSettingsStore.js').CinematicSettings} settings
 */
export function createPostPipeline(renderer, scene, camera, width, height, settings) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.52, 0.38, 0.78);
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  const grain = new ShaderPass(FilmGrainShader);
  composer.addPass(grain);

  const pipeline = { composer, bloom, vignette, grain, time: 0 };
  applyPostSettings(pipeline, settings);
  return pipeline;
}

/** @param {{ composer: EffectComposer }} pipeline */
export function resizePostPipeline(pipeline, width, height) {
  pipeline.composer.setSize(width, height);
}

/** @param {{ composer: EffectComposer }} pipeline */
export function disposePostPipeline(pipeline) {
  pipeline.composer.dispose();
}
