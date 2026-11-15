// src/core/dictation-matcher.ts
import type { Point, StrokeData, VerifyResult } from '../types';

export class DictationMatcher {
  public static screenToHanziCoords(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    safeScale: number = 0.85
  ): Point {
    const minSide = Math.min(canvasWidth, canvasHeight);
    const baseScale = minSide / 1024;
    const finalScale = baseScale * safeScale;

    const offsetX = (canvasWidth - minSide * safeScale) / 2;
    const offsetY = (canvasHeight - minSide * safeScale) / 2;

    return {
      x: (screenX - offsetX) / finalScale,
      y: 1024 - (screenY - offsetY) / finalScale
    };
  }

  private static resampleStroke(points: Point[], numPoints: number = 8): Point[] {
    if (points.length === 0) return [];
    if (points.length === 1) return Array(numPoints).fill(points[0]);

    let totalLen = 0;
    for (let i = 1; i < points.length; i++) {
      totalLen += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    if (totalLen === 0) return Array(numPoints).fill(points[0]);

    const step = totalLen / (numPoints - 1);
    const resampled: Point[] = [points[0]];
    let accumDist = 0;

    for (let i = 1; i < points.length; i++) {
      const p1 = points[i - 1];
      const p2 = points[i];
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (segLen === 0) continue;

      while (accumDist + segLen >= step && resampled.length < numPoints) {
        const t = (step - accumDist) / segLen;
        resampled.push({
          x: p1.x + t * (p2.x - p1.x),
          y: p1.y + t * (p2.y - p1.y)
        });
        accumDist = 0;
      }
      accumDist += segLen;
    }

    while (resampled.length < numPoints) {
      resampled.push(points[points.length - 1]);
    }
    return resampled;
  }

  private static scoreSingleStroke(userStroke: Point[], targetMedian: number[][]): number {
    if (userStroke.length < 2 || targetMedian.length < 2) return 0;

    const targetPts: Point[] = targetMedian.map(([x, y]) => ({ x, y }));
    const uSampled = this.resampleStroke(userStroke, 8);
    const tSampled = this.resampleStroke(targetPts, 8);

    // 1. 起點與終點精準度（收緊至 200 單位以內）
    const startDist = Math.hypot(uSampled[0].x - tSampled[0].x, uSampled[0].y - tSampled[0].y);
    const endDist = Math.hypot(uSampled[7].x - tSampled[7].x, uSampled[7].y - tSampled[7].y);
    if (startDist > 200 || endDist > 200) return 0;

    // 2. 中段 6 個等距點平均偏移距離
    let midDistSum = 0;
    for (let k = 1; k <= 6; k++) {
      midDistSum += Math.hypot(uSampled[k].x - tSampled[k].x, uSampled[k].y - tSampled[k].y);
    }
    const avgMidDist = midDistSum / 6;
    const shapeScore = Math.max(0, 1 - (startDist * 0.35 + avgMidDist * 0.3 + endDist * 0.35) / 200);

    // 3. 運筆方向餘弦相似度（收緊至 cosSim >= 0.68，約 47 度內）
    const uVec = { x: uSampled[7].x - uSampled[0].x, y: uSampled[7].y - uSampled[0].y };
    const tVec = { x: tSampled[7].x - tSampled[0].x, y: tSampled[7].y - tSampled[0].y };
    const dot = uVec.x * tVec.x + uVec.y * tVec.y;
    const mag = Math.hypot(uVec.x, uVec.y) * Math.hypot(tVec.x, tVec.y);
    const cosSim = mag > 0 ? dot / mag : 1;

    if (cosSim < 0.68) return 0;

    return shapeScore * 0.65 + cosSim * 0.35;
  }

  public static verifyCharacterStrict(userStrokes: Point[][], targetData: StrokeData): VerifyResult {
    if (!targetData.medians || targetData.medians.length === 0) {
      return {
        status: 'UNSUPPORTED',
        score: 0,
        message: `⚠️ 字庫暫未收錄「${targetData.char}」筆順幾何，請重寫或切換模式`
      };
    }

    if (!this.checkBoundingBoxSanity(userStrokes)) {
      return {
        status: 'TOO_SMALL',
        score: 0,
        message: '🔍 寫得太細啦，請喺米字格中間寫大隻啲！'
      };
    }

    const targetCount = targetData.medians.length;
    const userCount = userStrokes.length;

    if (userCount !== targetCount) {
      return {
        status: 'WRONG_STROKE_COUNT',
        score: 0,
        message: `❌ 筆畫數唔啱：「${targetData.char}」有 ${targetCount} 畫，你寫咗 ${userCount} 畫`
      };
    }

    let inOrderScoreSum = 0;
    for (let i = 0; i < targetCount; i++) {
      inOrderScoreSum += this.scoreSingleStroke(userStrokes[i], targetData.medians[i]);
    }
    const inOrderAvg = inOrderScoreSum / targetCount;

    if (inOrderAvg >= 0.64) {
      return {
        status: 'SUCCESS',
        score: inOrderAvg,
        message: `✅ 寫啱咗「${targetData.char}」字！`
      };
    }

    // 無序配對：檢查是否「字形寫對但筆順倒轉」
    const usedTargetIdx = new Set<number>();
    let unorderedScoreSum = 0;

    for (let u = 0; u < userCount; u++) {
      let bestScore = 0;
      let bestIdx = -1;
      for (let t = 0; t < targetCount; t++) {
        if (usedTargetIdx.has(t)) continue;
        const s = this.scoreSingleStroke(userStrokes[u], targetData.medians[t]);
        if (s > bestScore) {
          bestScore = s;
          bestIdx = t;
        }
      }
      if (bestIdx !== -1) {
        usedTargetIdx.add(bestIdx);
        unorderedScoreSum += bestScore;
      }
    }

    const unorderedAvg = unorderedScoreSum / targetCount;
    if (unorderedAvg >= 0.64) {
      return {
        status: 'WRONG_ORDER',
        score: unorderedAvg,
        message: '⚠️ 字形啱咗，但筆順掉轉咗！試下按「偷睇筆順」再寫'
      };
    }

    return {
      status: 'WRONG_SHAPE',
      score: inOrderAvg,
      message: '❌ 字形或運筆方向唔對，請重寫本字！'
    };
  }

  public static recognizeTopCandidates(
    userStrokes: Point[][],
    candidatePool: StrokeData[],
    topN: number = 5
  ): string[] {
    if (!this.checkBoundingBoxSanity(userStrokes)) return [];
    const userCount = userStrokes.length;
    const scored: { char: string; score: number }[] = [];

    for (const data of candidatePool) {
      if (!data.medians || data.medians.length === 0) continue;
      const targetCount = data.medians.length;
      if (Math.abs(userCount - targetCount) > 1) continue;

      const compareLen = Math.min(userCount, targetCount);
      let sum = 0;
      for (let i = 0; i < compareLen; i++) {
        sum += this.scoreSingleStroke(userStrokes[i], data.medians[i]);
      }
      const penalty = userCount === targetCount ? 1.0 : 0.85;
      const finalScore = (sum / Math.max(userCount, targetCount)) * penalty;

      if (finalScore >= 0.45) {
        scored.push({ char: data.char, score: finalScore });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
      .map(item => item.char);
  }

  private static checkBoundingBoxSanity(userStrokes: Point[][]): boolean {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let count = 0;
    for (const stroke of userStrokes) {
      for (const p of stroke) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
        count++;
      }
    }
    if (count < 4) return false;
    return (maxX - minX > 160) || (maxY - minY > 160);
  }
}
