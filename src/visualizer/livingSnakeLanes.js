/** @param {object} baseRiver @param {number} objectIdx @param {number} lane @param {boolean} unicolor @param {number} [laneCount] */
export function livingSnakeLaneRiver(baseRiver, objectIdx, lane, unicolor, laneCount = 1) {
  if (unicolor) return baseRiver;
  const lanes = Math.max(1, laneCount);
  const laneStagger = lanes > 1 ? (lane / lanes) * 0.028 : 0;
  return {
    ...baseRiver,
    colorIdx: lane,
    pathSeed: (baseRiver.pathSeed ?? 42) + lane * 6151 + objectIdx * 31,
    startDelayRatio: (baseRiver.startDelayRatio ?? 0) + laneStagger,
  };
}
