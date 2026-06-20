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

/**
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.Camera} camera
 * @param {number} width
 * @param {number} height
 */
export function createPostPipeline(renderer, scene, camera, width, height) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.52, 0.38, 0.78);
  composer.addPass(bloom);

  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);

  return { composer, bloom, vignette };
}

/** @param {{ composer: EffectComposer }} pipeline */
export function resizePostPipeline(pipeline, width, height) {
  pipeline.composer.setSize(width, height);
}

/** @param {{ composer: EffectComposer }} pipeline */
export function disposePostPipeline(pipeline) {
  pipeline.composer.dispose();
}
