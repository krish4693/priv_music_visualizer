/**
 * Slow cinematic camera — orbit, dolly, subtle vertical drift.
 */
export class CameraRig {
  /** @param {import('three').PerspectiveCamera} camera */
  constructor(camera) {
    this.camera = camera;
    this._baseY = 0.35;
    this._baseRadius = 9.2;
  }

  /** @param {number} [orbit] 0–100 */
  setOrbitAmount(orbit = 45) {
    this._orbitAmount = orbit / 100;
  }

  /** @param {number} time @param {number} [motion] */
  update(time = 0, motion = 0) {
    const orbitBase = 0.06 + (this._orbitAmount ?? 0.45) * 0.28;
    const orbit = orbitBase + motion * 0.12;
    const radius = this._baseRadius - Math.sin(time * 0.07) * 0.45 - motion * 0.35;
    const angle = time * 0.038 * orbit;
    const x = Math.sin(angle) * radius * 0.42;
    const z = Math.cos(angle) * radius;
    const y = this._baseY + Math.sin(time * 0.05) * 0.22;

    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 0, 0);
  }
}
