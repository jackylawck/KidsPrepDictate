// src/core/dictation-matcher.ts
import { StrokeData } from '../ui/canvas-trace';

export interface Point {
  x: number; // 0~1024 標準座標
  y: number; // 0~1024 Cartesian Y 軸 (底部為 0)
}

export class DictationMatcher {
  public static screenToHanziCoords(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    safeScale: number = 0.85
  ): Point {
    const baseScale = canvasWidth / 1024;
    const finalScale = baseScale * safeScale;
    const centerOffset = (canvasWidth * (1 - safeScale)) / 2;

    return {
      x: (screenX - centerOffset) / finalScale,
      y: 1024 - (screenY - centerOffset) / finalScale
    };
  }

  public static verifyCharacter(userStrokes: Point[][], targetData: StrokeData): boolean {
    if (!userStrokes.length) return false;

    const targetCount = targetData.totalStrokes || targetData.strokes.length;
    const userCount = userStrokes.length;

    // 允許 ±1 畫連筆或微細誤差
    if (Math.abs(userCount - targetCount) > 1) {
      return false;
    }

    if (!targetData.medians || targetData.medians.length === 0) {
      return this.checkBoundingBoxSanity(userStrokes);
    }

    const compareCount = Math.min(userCount, targetData.medians.length);
    let matchedStrokes = 0;

    for (let i = 0; i < compareCount; i++) {
      const uStroke = userStrokes[i];
      const tMedian = targetData.medians[i];
      if (uStroke.length < 2 || tMedian.length < 2) continue;

      const uStart = uStroke[0];
      const uEnd = uStroke[uStroke.length - 1];
      const tStart = { x: tMedian[0][0], y: tMedian[0][1] };
      const tEnd = { x: tMedian[tMedian.length - 1][0], y: tMedian[tMedian.length - 1][1] };

      const startDist = Math.hypot(uStart.x - tStart.x, uStart.y - tStart.y);
      const endDist = Math.hypot(uEnd.x - tEnd.x, uEnd.y - tEnd.y);

      const uVec = { x: uEnd.x - uStart.x, y: uEnd.y - uStart.y };
      const tVec = { x: tEnd.x - tStart.x, y: tEnd.y - tStart.y };
      const dot = uVec.x * tVec.x + uVec.y * tVec.y;
      const mag = Math.hypot(uVec.x, uVec.y) * Math.hypot(tVec.x, tVec.y);
      const cosSim = mag > 0 ? dot / mag : 1;

      if (startDist < 290 && endDist < 290 && cosSim > 0.4) {
        matchedStrokes++;
      }
    }

    // 整體達標率 >= 60% 即判定通過，鼓勵小朋友建立信心
    return matchedStrokes / targetCount >= 0.6;
  }

  private static checkBoundingBoxSanity(userStrokes: Point[][]): boolean {
    const allPoints = userStrokes.flat();
    if (allPoints.length < 5) return false;
    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    return (Math.max(...xs) - Math.min(...xs) > 150) || (Math.max(...ys) - Math.min(...ys) > 150);
  }
}
