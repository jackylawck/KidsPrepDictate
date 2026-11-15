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

  /**
   * 計算手寫筆畫與目標字 StrokeData 的幾何相似度分數 (0 ~ 1)
   */
  public static scoreCharacter(userStrokes: Point[][], targetData: StrokeData): number {
    if (!userStrokes.length) return 0;

    const targetCount = targetData.totalStrokes || targetData.strokes.length;
    const userCount = userStrokes.length;

    // 筆畫數差距超過 1 畫直接淘汰
    const strokeDiff = Math.abs(userCount - targetCount);
    if (strokeDiff > 1) return 0;

    if (!targetData.medians || targetData.medians.length === 0) {
      return this.checkBoundingBoxSanity(userStrokes) ? 0.5 : 0;
    }

    const compareCount = Math.min(userCount, targetData.medians.length);
    let totalStrokeScore = 0;

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

      // 距離分數 (0~1)：允許起終點偏差最多 320 單位
      const posScore = Math.max(0, 1 - (startDist + endDist) / 640);

      // 方向向量餘弦相似度 (-1 ~ 1)
      const uVec = { x: uEnd.x - uStart.x, y: uEnd.y - uStart.y };
      const tVec = { x: tEnd.x - tStart.x, y: tEnd.y - tStart.y };
      const dot = uVec.x * tVec.x + uVec.y * tVec.y;
      const mag = Math.hypot(uVec.x, uVec.y) * Math.hypot(tVec.x, tVec.y);
      const cosSim = mag > 0 ? dot / mag : 1;

      // 方向嚴重相反直接計 0 分
      const dirScore = cosSim > 0.35 ? cosSim : 0;

      totalStrokeScore += posScore * 0.55 + dirScore * 0.45;
    }

    // 筆畫數完全吻合有加分，差 1 畫扣減 15%
    const countPenalty = strokeDiff === 0 ? 1.0 : 0.85;
    return (totalStrokeScore / Math.max(userCount, targetCount)) * countPenalty;
  }

  /**
   * 嚴格驗證模式（家長有出題時使用，絕不放水）
   */
  public static verifyCharacter(userStrokes: Point[][], targetData: StrokeData): boolean {
    if (!this.checkBoundingBoxSanity(userStrokes)) return false;
    const score = this.scoreCharacter(userStrokes, targetData);
    return score >= 0.58;
  }

  /**
   * 無家長模式：從候選字庫中找出最吻合的 Top N 個繁體字
   */
  public static recognizeTopCandidates(
    userStrokes: Point[][],
    candidatePool: StrokeData[],
    topN: number = 5
  ): string[] {
    if (!this.checkBoundingBoxSanity(userStrokes)) return [];

    const scored = candidatePool
      .map(data => ({
        char: data.char,
        score: this.scoreCharacter(userStrokes, data)
      }))
      .filter(item => item.score > 0.35)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, topN).map(item => item.char);
  }

  private static checkBoundingBoxSanity(userStrokes: Point[][]): boolean {
    const allPoints = userStrokes.flat();
    if (allPoints.length < 5) return false;
    const xs = allPoints.map(p => p.x);
    const ys = allPoints.map(p => p.y);
    return (Math.max(...xs) - Math.min(...xs) > 140) || (Math.max(...ys) - Math.min(...ys) > 140);
  }
}
