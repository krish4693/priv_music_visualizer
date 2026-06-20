import * as THREE from 'three';
import { TitleLetters3D } from '../titleText3d.js';
import { SHAPE_PRESETS } from '../shapePresets.js';
import { cinematicMaterial, updateCinematicMaterial, UNIT } from './shapeFactory.js';

/**
 * Voxel-style 3D title blocks parented to a host shape mesh (Cinematic mode).
 */
export class CinematicTitleGroup {
  constructor() {
    this.group = new THREE.Group();
    this.letters = new TitleLetters3D();
    this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this._meshes = [];
    /** @type {THREE.MeshStandardMaterial|null} */
    this._material = null;
    this._materialOpts = null;
  }

  clear() {
    for (const mesh of this._meshes) {
      this.group.remove(mesh);
    }
    this._meshes = [];
  }

  dispose() {
    this.clear();
    this._boxGeo.dispose();
    this._material?.dispose();
    this._material = null;
  }

  /** @param {string} text @param {THREE.Color} color @param {object} materialOpts */
  rebuild(text, color, materialOpts) {
    const css = `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`;
    this.letters.rebuild(text, css);
    this.clear();
    if (!this.letters.chars.length) return;

    this._materialOpts = materialOpts;
    const emissiveBoost = { ...materialOpts, emissive: Math.min(100, (materialOpts.emissive ?? 16) + 24) };
    if (!this._material) {
      this._material = cinematicMaterial(color, emissiveBoost);
      this._material.transparent = true;
    } else {
      updateCinematicMaterial(this._material, color, emissiveBoost);
    }

    const fitScale = 0.014;
    const footD = 0.38;
    const standH = 0.24;

    for (const ch of this.letters.chars) {
      const charCenterX = (ch.localX - this.letters.totalWidth / 2) * fitScale;
      const footW = ch.canvasW * fitScale;
      for (const col of ch.columns) {
        const lx = charCenterX + col.ux * footW;
        const lz = ((col.uz0 + col.uz1) / 2) * footD;
        const hw = Math.max(col.uw * footW * 0.55, 0.01);
        const hd = Math.max(((col.uz1 - col.uz0) * footD * 0.5), 0.008);
        const mesh = new THREE.Mesh(this._boxGeo, this._material);
        mesh.position.set(lx, standH * 0.5, lz);
        mesh.scale.set(hw * 2, standH, hd * 2);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        this.group.add(mesh);
        this._meshes.push(mesh);
      }
    }
  }

  /** @param {THREE.Object3D|null} hostMesh @param {object} shapeState */
  syncToHost(hostMesh, shapeState) {
    if (!hostMesh || !this._meshes.length) {
      if (this.group.parent) this.group.parent.remove(this.group);
      return;
    }

    if (this.group.parent !== hostMesh) {
      if (this.group.parent) this.group.parent.remove(this.group);
      hostMesh.add(this.group);
    }

    const type = shapeState.morphT < 0.5 ? shapeState.type : shapeState.morphTarget;
    const preset = SHAPE_PRESETS[type] ?? SHAPE_PRESETS.cube;
    const sizeMul = shapeState.sizeMul ?? 1;
    const topY = preset.ry * UNIT * sizeMul * (shapeState.scale ?? 1);
    const fit = Math.min(1.15, (preset.rx * UNIT * sizeMul * 1.6) / Math.max(this.letters.totalWidth * 0.014, 0.01));
    this.group.position.set(0, topY + 0.06, 0);
    this.group.rotation.set(0, 0, 0);
    this.group.scale.setScalar(fit);
  }

  /** @param {number} opacity 0–1 */
  setOpacity(opacity) {
    const visible = opacity > 0.02 && this._meshes.length > 0;
    this.group.visible = visible;
    if (!this._material) return;
    this._material.opacity = opacity;
    this._material.transparent = opacity < 0.98;
  }
}
