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

  private static sharedCanvas: HTMLCanvasElement | null = null;
  private static sharedCtx: CanvasRenderingContext2D | null = null;
  private static normCanvas: HTMLCanvasElement | null = null;
  private static normCtx: CanvasRenderingContext2D | null = null;

  private static getSharedCanvases() {
    if (!this.sharedCanvas && typeof document !== 'undefined') {
      this.sharedCanvas = document.createElement('canvas');
      this.sharedCanvas.width = GRID_SIZE;
      this.sharedCanvas.height = GRID_SIZE;
      this.sharedCtx = this.sharedCanvas.getContext('2d', { willReadFrequently: true });

      this.normCanvas = document.createElement('canvas');
      this.normCanvas.width = GRID_SIZE;
      this.normCanvas.height = GRID_SIZE;
      this.normCtx = this.normCanvas.getContext('2d', { willReadFrequently: true });
    }
    return {
      canvas: this.sharedCanvas,
      ctx: this.sharedCtx,
      normCanvas: this.normCanvas,
      normCtx: this.normCtx
    };
  }

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

    const { canvas, ctx, normCanvas, normCtx } = this.getSharedCanvases();
    if (!ctx || !normCtx || !canvas || !normCanvas) return null;

    try {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, GRID_SIZE, GRID_SIZE);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '600 46px "PingFang HK", "Heiti TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
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

      const srcW = Math.max(1, maxX - minX + 1);
      const srcH = Math.max(1, maxY - minY + 1);
      const targetSpan = GRID_SIZE - 12;
      const scale = targetSpan / Math.max(srcW, srcH);
      const dstW = srcW * scale;
      const dstH = srcH * scale;
      const dstX = (GRID_SIZE - dstW) / 2;
      const dstY = (GRID_SIZE - dstH) / 2;

      normCtx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
      normCtx.drawImage(canvas, minX, minY, srcW, srcH, dstX, dstY, dstW, dstH);
      const normData = normCtx.getImageData(0, 0, GRID_SIZE, GRID_SIZE).data;

      const raw = new Uint8Array(GRID_SIZE * GRID_SIZE);
      const dilated = new Uint8Array(GRID_SIZE * GRID_SIZE);
      let pixelCount = 0;

      const radius = 2;
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
    const { ctx } = this.getSharedCanvases();
    if (!ctx) return null;

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

    ctx.clearRect(0, 0, GRID_SIZE, GRID_SIZE);
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
      if (data[i * 4 + 3] > 80) {
        mask[i] = 1;
        inkPixels++;
      }
    }

    return { mask, inkPixels };
  }

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
        for (let dy = -1; dy <= 1 && !found; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
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

    if (precision < 0.48 || recall < 0.36) {
      return { f1: Math.min(precision, recall) * 0.65, pixelRatioPenalty: 0.75 };
    }

    const f1 = (2 * precision * recall) / (precision + recall);
    const densityRatio = Math.min(user.inkPixels, target.pixelCount) / Math.max(user.inkPixels, target.pixelCount);
    const pixelRatioPenalty = 0.8 + 0.2 * densityRatio;

    return { f1, pixelRatioPenalty };
  }

  public static scoreGlyphVisual(userStrokes: Point[][], targetChar: string): number | null {
    const user = this.rasterizeUserStrokes(userStrokes);
    if (!user) return null;
    const res = this.scoreGlyphWithRaster(user, targetChar);
    return res ? res.f1 * res.pixelRatioPenalty : null;
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

  private static scoreSingleStroke(userStroke: Point[], targetMedian: readonly number[][]): number {
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

  private static scoreVectorMedians(userStrokes: Point[][], medians: readonly number[][][]): {
    inOrderAvg: number;
    unorderedAvg: number;
  } {
    const userCount = userStrokes.length;
    const targetCount = medians.length;
    const compareLen = Math.min(userCount, targetCount);

    let inOrderScoreSum = 0;
    for (let i = 0; i < compareLen; i++) {
      inOrderScoreSum += this.scoreSingleStroke(userStrokes[i], medians[i]);
    }
    const inOrderAvg = inOrderScoreSum / Math.max(userCount, targetCount);

    const usedTargetIdx = new Set<number>();
    let unorderedScoreSum = 0;
    for (let u = 0; u < userCount; u++) {
      let bestScore = 0;
      let bestIdx = -1;
      for (let t = 0; t < targetCount; t++) {
        if (usedTargetIdx.has(t)) continue;
        const s = this.scoreSingleStroke(userStrokes[u], medians[t]);
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

    return { inOrderAvg, unorderedAvg };
  }

  public static verifyCharacterStrict(userStrokes: Point[][], targetData: StrokeData): VerifyResult {
    if (!this.checkBoundingBoxSanity(userStrokes)) {
      return {
        status: 'TOO_SMALL',
        score: 0,
        message: t('verifyTooSmall')
      };
    }

    const hasMedians = Boolean(targetData.medians && targetData.medians.length > 0);
    // 缺字優先友善放行（不再因視覺參數收緊而誤卡小朋友）
    if (!hasMedians) {
      return {
        status: 'SUCCESS',
        score: 0.8,
        message: t('verifyFallbackSuccess', { char: targetData.char }),
        isFallback: true
      };
    }

    const targetCount = targetData.medians!.length;
    const userCount = userStrokes.length;

    if (Math.abs(userCount - targetCount) > 1) {
      return {
        status: 'WRONG_STROKE_COUNT',
        score: 0,
        message: t('verifyWrongCount', { char: targetData.char, target: targetCount, user: userCount })
      };
    }

    const visualScore = this.scoreGlyphVisual(userStrokes, targetData.char);
    const { inOrderAvg, unorderedAvg } = this.scoreVectorMedians(userStrokes, targetData.medians!);

    if (visualScore !== null) {
      const vectorBest = Math.max(inOrderAvg, unorderedAvg * 0.95);
      const combinedScore = Math.max(visualScore, vectorBest);

      if (combinedScore >= 0.52) {
        const isUnordered = inOrderAvg < 0.48 && unorderedAvg >= 0.48;
        return {
          status: 'SUCCESS',
          score: combinedScore,
          message: t(isUnordered ? 'verifySuccessUnordered' : 'verifySuccessOrder', { char: targetData.char })
        };
      }

      return {
        status: 'WRONG_SHAPE',
        score: visualScore,
        message: t('verifyWrongShape')
      };
    }

    if (inOrderAvg >= 0.48) {
      return {
        status: 'SUCCESS',
        score: inOrderAvg,
        message: t('verifySuccessOrder', { char: targetData.char })
      };
    }

    if (unorderedAvg >= 0.48) {
      return {
        status: 'SUCCESS',
        score: unorderedAvg,
        message: t('verifySuccessUnordered', { char: targetData.char })
      };
    }

    return {
      status: 'WRONG_SHAPE',
      score: Math.max(inOrderAvg, unorderedAvg),
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
      const hasMedians = Boolean(data.medians && data.medians.length > 0);
      const targetCount = hasMedians ? data.medians!.length : 0;
      const strokeCountGap = targetCount > 0 ? Math.abs(userCount - targetCount) : 0;

      if (targetCount > 0 && strokeCountGap > 2) continue;

      const strokePenalty =
        targetCount === 0 ? 1.0 : strokeCountGap === 0 ? 1.0 : strokeCountGap === 1 ? 0.9 : 0.72;

      let vectorScore: number | null = null;
      if (hasMedians) {
        const { inOrderAvg, unorderedAvg } = this.scoreVectorMedians(userStrokes, data.medians!);
        vectorScore = Math.max(inOrderAvg, unorderedAvg * 0.92) * strokePenalty;
      }

      let rasterScore: number | null = null;
      if (userRaster) {
        const res = this.scoreGlyphWithRaster(userRaster, data.char);
        if (res) {
          rasterScore = res.f1 * res.pixelRatioPenalty * strokePenalty;
        }
      }

      let finalScore = 0;
      if (vectorScore !== null && rasterScore !== null) {
        finalScore = Math.max(vectorScore, vectorScore * 0.6 + rasterScore * 0.4);
      } else if (vectorScore !== null) {
        finalScore = vectorScore;
      } else if (rasterScore !== null) {
        finalScore = rasterScore;
      }

      if (finalScore >= 0.36) {
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
