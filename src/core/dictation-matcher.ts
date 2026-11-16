// src/core/dictation-matcher.ts
import type { Point, StrokeData, VerifyResult } from '../types';
import { t } from '../i18n';

const GRID_SIZE = 64;

interface GlyphMask {
  raw: Uint8Array;
  dilated: Uint8Array;
  pixelCount: number;
}

export class DictationMatcher {
  private static glyphMaskCache = new Map<string, GlyphMask | null>();

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

  private static getTargetGlyphMask(char: string): GlyphMask | null {
    if (this.glyphMaskCache.has(char)) {
      return this.glyphMaskCache.get(char)!;
    }
    if (typeof document === 'undefined') return null;

    try {
      const canvas = document.createElement('canvas');
      canvas.width = GRID_SIZE;
      canvas.height = GRID_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 50px "PingFang HK", "Heiti TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
      ctx.fillText(char, GRID_SIZE / 2, GRID_SIZE / 2 + 2);

      const img = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

      let minX = GRID_SIZE, maxX = 0, minY = GRID_SIZE, maxY = 0;
      let hasInk = false;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (img[(y * GRID_SIZE + x) * 4] > 100) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            hasInk = true;
          }
        }
      }
      if (!hasInk) {
        this.glyphMaskCache.set(char, null);
        return null;
      }

      const normCanvas = document.createElement('canvas');
      normCanvas.width = GRID_SIZE;
      normCanvas.height = GRID_SIZE;
      const nCtx = normCanvas.getContext('2d')!;
      const srcW = Math.max(1, maxX - minX + 1);
      const srcH = Math.max(1, maxY - minY + 1);
      const targetSpan = GRID_SIZE - 12;
      const scale = targetSpan / Math.max(srcW, srcH);
      const dstW = srcW * scale;
      const dstH = srcH * scale;
      const dstX = (GRID_SIZE - dstW) / 2;
      const dstY = (GRID_SIZE - dstH) / 2;

      nCtx.drawImage(canvas, minX, minY, srcW, srcH, dstX, dstY, dstW, dstH);
      const normData = nCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

      const raw = new Uint8Array(GRID_SIZE * GRID_SIZE);
      const dilated = new Uint8Array(GRID_SIZE * GRID_SIZE);
      let pixelCount = 0;

      const radius = 3;
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          if (normData[(y * GRID_SIZE + x) * 4] > 90) {
            raw[y * GRID_SIZE + x] = 1;
            pixelCount++;
            for (let dy = -radius; dy <= radius; dy++) {
              for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius + 1) {
                  const nx = x + dx;
                  const ny = y + dy;
                  if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
                    dilated[ny * GRID_SIZE + nx] = 1;
                  }
                }
              }
            }
          }
        }
      }

      const result = { raw, dilated, pixelCount };
      this.glyphMaskCache.set(char, result);
      return result;
    } catch {
      return null;
    }
  }

  private static rasterizeUserStrokes(userStrokes: Point[][]): { mask: Uint8Array; inkPixels: number } | null {
    if (typeof document === 'undefined') return null;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const stroke of userStrokes) {
      for (const p of stroke) {
        const sy = 1024 - p.y;
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }
    }
    if (!Number.isFinite(minX)) return null;

    const srcW = Math.max(40, maxX - minX);
    const srcH = Math.max(40, maxY - minY);
    const targetSpan = GRID_SIZE - 12;
    const scale = targetSpan / Math.max(srcW, srcH);
    const offsetX = (GRID_SIZE - srcW * scale) / 2;
    const offsetY = (GRID_SIZE - srcH * scale) / 2;

    const canvas = document.createElement('canvas');
    canvas.width = GRID_SIZE;
    canvas.height = GRID_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2;

    for (const stroke of userStrokes) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      stroke.forEach((p, idx) => {
        const nx = (p.x - minX) * scale + offsetX;
        const ny = ((1024 - p.y) - minY) * scale + offsetY;
        if (idx === 0) {
          ctx.moveTo(nx, ny);
          ctx.lineTo(nx + 0.1, ny + 0.1);
        } else {
          ctx.lineTo(nx, ny);
        }
      });
      ctx.stroke();
    }

    const data = ctx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;
    const mask = new Uint8Array(GRID_SIZE * GRID_SIZE);
    let inkPixels = 0;

    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      if (data[i * 4] > 80) {
        mask[i] = 1;
        inkPixels++;
      }
    }

    return { mask, inkPixels };
  }

  // 優化 1：引入光柵密度懲罰，防止「畫一條長線」獲得過高的字形重疊分數
  private static scoreGlyphWithRaster(
    user: { mask: Uint8Array; inkPixels: number },
    targetChar: string
  ): { f1: number; pixelRatioPenalty: number } | null {
    const target = this.getTargetGlyphMask(targetChar);
    if (!target || user.inkPixels === 0 || target.pixelCount === 0) return null;

    let hitDilated = 0;
    for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
      if (user.mask[i] && target.dilated[i]) {
        hitDilated++;
      }
    }
    const precision = hitDilated / user.inkPixels;

    let coveredTarget = 0;
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!target.raw[y * GRID_SIZE + x]) continue;
        let found = false;
        for (let dy = -2; dy <= 2 && !found; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE && user.mask[ny * GRID_SIZE + nx]) {
              found = true;
              break;
            }
          }
        }
        if (found) coveredTarget++;
      }
    }
    const recall = coveredTarget / target.pixelCount;

    if (precision < 0.56 || recall < 0.46) {
      return { f1: Math.min(precision, recall) * 0.6, pixelRatioPenalty: 0.7 };
    }

    const f1 = (2 * precision * recall) / (precision + recall);
    
    // 密度比例懲罰：防止少筆畫字被高密度多筆畫字搶分（或反之）
    const densityRatio = Math.min(user.inkPixels, target.pixelCount) / Math.max(user.inkPixels, target.pixelCount);
    const pixelRatioPenalty = 0.75 + 0.25 * densityRatio;

    return { f1, pixelRatioPenalty };
  }

  public static scoreGlyphVisual(userStrokes: Point[][], targetChar: string): number | null {
    const user = this.rasterizeUserStrokes(userStrokes);
    if (!user) return null;
    const res = this.scoreGlyphWithRaster(user, targetChar);
    return res ? res.f1 : null;
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

    const hasMedians = Boolean(targetData.medians && targetData.medians.length > 0);
    const visualScore = this.scoreGlyphVisual(userStrokes, targetData.char);

    if (visualScore !== null) {
      if (hasMedians) {
        const targetCount = targetData.medians!.length;
        const userCount = userStrokes.length;
        if (Math.abs(userCount - targetCount) > 2) {
          const meta = { char: targetData.char, target: targetCount, user: userCount };
          return {
            status: 'WRONG_STROKE_COUNT',
            score: 0,
            i18nKey: 'verifyWrongCount',
            meta,
            message: t('verifyWrongCount', meta)
          };
        }
      }

      if (visualScore >= 0.56) {
        const meta = { char: targetData.char };
        return {
          status: 'SUCCESS',
          score: visualScore,
          i18nKey: 'verifySuccessOrder',
          meta,
          message: t('verifySuccessOrder', meta)
        };
      }

      return {
        status: 'WRONG_SHAPE',
        score: visualScore,
        i18nKey: 'verifyWrongShape',
        message: t('verifyWrongShape')
      };
    }

    if (!hasMedians) {
      return {
        status: 'UNSUPPORTED',
        score: 0,
        message: `⚠️ 無法掃描「${targetData.char}」字形`
      };
    }

    const targetCount = targetData.medians!.length;
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
      inOrderScoreSum += this.scoreSingleStroke(userStrokes[i], targetData.medians![i]);
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
        const s = this.scoreSingleStroke(userStrokes[u], targetData.medians![t]);
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
    const userRaster = this.rasterizeUserStrokes(userStrokes);

    for (const data of candidatePool) {
      // 1. 優先使用視覺光柵引擎（實機預設）
      if (userRaster) {
        const res = this.scoreGlyphWithRaster(userRaster, data.char);
        
        // 取得備用筆劃資訊作防搶字約束
        const targetCount = data.medians && data.medians.length > 0 ? data.medians.length : 0;
        if (targetCount > 0 && Math.abs(userCount - targetCount) > 2) continue; // 差距 > 2 直接過濾

        if (res && res.f1 >= 0.42) {
          scored.push({ char: data.char, score: res.f1 * res.pixelRatioPenalty });
        }
        continue;
      }

      // 2. 備用向量比對引擎（無 DOM 或光柵失效時使用）
      if (!data.medians || data.medians.length === 0) continue;
      const targetCount = data.medians.length;
      
      // 優化 2：加回筆劃數約束與懲罰機制，防止 5 畫「外」被 16 畫「學」搶走
      const strokeCountGap = Math.abs(userCount - targetCount);
      if (strokeCountGap > 2) continue; // 差距 > 2 直接排除

      const compareLen = Math.min(userCount, targetCount);
      let sum = 0;
      for (let i = 0; i < compareLen; i++) {
        sum += this.scoreSingleStroke(userStrokes[i], data.medians[i]);
      }
      
      const penalty = userCount === targetCount ? 1.0 : 0.88;
      const finalScore = (sum / Math.max(userCount, targetCount)) * penalty;
      
      // 筆畫數差距越大，分數扣減越多
      const strokePenalty = strokeCountGap === 0 ? 1.0 : strokeCountGap === 1 ? 0.9 : 0.72;
      const weightedScore = finalScore * strokePenalty;

      if (weightedScore >= 0.38) {
        scored.push({ char: data.char, score: weightedScore });
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
