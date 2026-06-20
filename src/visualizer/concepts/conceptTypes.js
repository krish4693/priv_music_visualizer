/**
 * @typedef {Object} ConceptInitContext
 * @property {import('../variationStore.js').VariationSettings} variation
 * @property {number} width
 * @property {number} height
 * @property {{ r: number, g: number, b: number }[]} palette
 * @property {string} [songTitle]
 */

/**
 * @typedef {Object} ConceptModule
 * @property {string} id
 * @property {(ctx: ConceptInitContext) => { entities: object[], state: object }} initEntities
 * @property {(entities: object[], state: object, ctx: object) => void} [updateEntities]
 * @property {(scene: object, ctx: CanvasRenderingContext2D) => void} drawPopArt
 * @property {(scene: object) => void} syncCinematic
 * @property {(scene: object) => void} [updateMeshColors]
 * @property {(scene: object) => void} [applyTransforms]
 * @property {(scene: object) => void} disposeCinematic
 */

export {};
