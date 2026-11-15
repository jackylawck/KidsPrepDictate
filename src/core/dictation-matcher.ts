// src/core/dictation-matcher.ts
import type { Point, StrokeData, VerifyResult } from '../types';
import { t } from '../i18n';

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

    const cumDist: number[] = [0];
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      cumDist.push(cumDist[i - 1] + d);
    }

    const totalLen = cumDist[cumDist.length - 1];
    if (totalLen === 0) return Array(numPoints).fill(points[0]);

    const resampled: Point[] = [points[0]];
    let segIdx = 1;

    for (let k = 1; k < numPoints - 1; k++) {
      const targetDist = (totalLen * k) / (numPoints - 1);
      while (segIdx < cumDist.length - 1 && cumDist[segIdx] < targetDist) {
        segIdx++;
      }
      const segStartDist = cumDist[segIdx - 1];
      const segEndDist = cumDist[segIdx];
      const segLen = segEndDist - segStartDist;
      const t = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

      const p1 = points[segIdx - 1];
      const p2 = points[segIdx];
      resampled.push({
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y)
      });
    }

    resampled.push(points[points.length - 1]);
    return resampled;
  }

  private static scoreSingleStroke(userStroke: Point[], targetMedian: number[][]): number {
    if (userStroke.length < 2 || targetMedian.length < 2) return 0;

    const targetPts: Point[] = targetMedian.map(([x, y]) => ({ x, y }));
    const uSampled = this.resampleStroke(userStroke, 8);
    const tSampled = this.resampleStroke(targetPts, 8);

    const startDist = Math.hypot(uSampled[0].x - tSampled[0].x, uSampled[0].y - tSampled[0].y);
    const endDist = Math.hypot(uSampled[7].x - tSampled[7].x, uSampled[7].y - tSampled[7].y);
    if (startDist > 280 || endDist > 280) return 0;

    let midDistSum = 0;
    for (let k = 1; k <= 6; k++) {
      midDistSum += Math.hypot(uSampled[k].x - tSampled[k].x, uSampled[k].y - tSampled[k].y);
    }
    const avgMidDist = midDistSum / 6;
    const shapeScore = Math.max(0, 1 - (startDist * 0.35 + avgMidDist * 0.3 + endDist * 0.35) / 280);

    const uVec = { x: uSampled[7].x - uSampled[0].x, y: uSampled[7].y - uSampled[0].y };
    const tVec = { x: tSampled[7].x - tSampled[0].x, y: tSampled[7].y - tSampled[0].y };
    const dot = uVec.x * tVec.x + uVec.y * tVec.y;
    const mag = Math.hypot(uVec.x, uVec.y) * Math.hypot(tVec.x, tVec.y);
    const cosSim = mag > 0 ? dot / mag : 1;

    if (cosSim < 0.45) return 0;

    return shapeScore * 0.65 + cosSim * 0.35;
  }

  public static verifyCharacterStrict(userStrokes: Point[][], targetData: StrokeData): VerifyResult {
    if (!this.checkBoundingBoxSanity(userStrokes)) {
      return {
        status: 'TOO_SMALL',
        score: 0,
        i18nKey: 'verifyTooSmall',
        message: t('verifyTooSmall')
      };
    }

    if (!targetData.medians || targetData.medians.length === 0) {
      const meta = { char: targetData.char };
      return {
        status: 'SUCCESS',
        score: 0.8,
        i18nKey: 'verifyFallbackSuccess',
        meta,
        message: t('verifyFallbackSuccess', meta)
      };
    }

    const targetCount = targetData.medians.length;
    const userCount = userStrokes.length;

    if (Math.abs(userCount - targetCount) > 1) {
      const meta = { char: targetData.char, target: targetCount, user: userCount };
      return {
        status: 'WRONG_STROKE_COUNT',
        score: 0,
        i18nKey: 'verifyWrongCount',
        meta,
        message: t('verifyWrongCount', meta)
      };
    }

    const compareLen = Math.min(userCount, targetCount);
    let inOrderScoreSum = 0;
    for (let i = 0; i < compareLen; i++) {
      inOrderScoreSum += this.scoreSingleStroke(userStrokes[i], targetData.medians[i]);
    }
    const inOrderAvg = inOrderScoreSum / Math.max(userCount, targetCount);

    if (inOrderAvg >= 0.48) {
      const meta = { char: targetData.char };
      return {
        status: 'SUCCESS',
        score: inOrderAvg,
        i18nKey: 'verifySuccessOrder',
        meta,
        message: t('verifySuccessOrder', meta)
      };
    }

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

    const unorderedAvg = unorderedScoreSum / Math.max(userCount, targetCount);
    if (unorderedAvg >= 0.48) {
      const meta = { char: targetData.char };
      return {
        status: 'SUCCESS',
        score: unorderedAvg,
        i18nKey: 'verifySuccessUnordered',
        meta,
        message: t('verifySuccessUnordered', meta)
      };
    }

    return {
      status: 'WRONG_SHAPE',
      score: Math.max(inOrderAvg, unorderedAvg),
      i18nKey: 'verifyWrongShape',
      message: t('verifyWrongShape')
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
      const penalty = userCount === targetCount ? 1.0 : 0.88;
      const finalScore = (sum / Math.max(userCount, targetCount)) * penalty;

      if (finalScore >= 0.4) {
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
    return (maxX - minX > 150) || (maxY - minY > 150);
  }
}
