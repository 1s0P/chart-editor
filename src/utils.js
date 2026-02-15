import { INTERNAL_DIV } from './constants.js';

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mirrorLane(lane, laneCount){
  return (laneCount - 1) - lane;
}

export function getCanvasCoords(canvas, evt){
  const r = canvas.getBoundingClientRect();
  return { x: evt.clientX - r.left, y: evt.clientY - r.top };
}

export function intersects(rx,ry,rw,rh,x,y,w,h){
  return !(rx > x+w || rx+rw < x || ry > y+h || ry+rh < y);
}

/**
 * rawUnits: 画面座標から計算した「絶対units」（小節跨ぎ含む）
 * unitDiv: 16/24/32/48/96 の選択値（= 1/unitDiv）
 */
export function snapUnits(rawUnits, unitDiv, measureCount){
  const g = INTERNAL_DIV / unitDiv; // グリッド幅（units）
  const max = INTERNAL_DIV * measureCount - 1;
  const clamped = clamp(rawUnits, 0, max);
  return Math.floor(clamped / g) * g;
}

export function splitToMeasureUnit(globalUnits){
  const m = Math.floor(globalUnits / INTERNAL_DIV);
  const u = globalUnits % INTERNAL_DIV;
  return { m, u };
}

export function toGlobalUnits(measure, unit){
  return measure * INTERNAL_DIV + unit;
}
