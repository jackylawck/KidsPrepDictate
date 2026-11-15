// src/ui/canvas-trace.ts
import type { Point, StrokeData, VerifyResult } from '../types';
import { DictationMatcher } from '../core/dictation-matcher';

export class TraceCanvas {
  private traceCanvas: HTMLCanvasElement;
  private traceCtx: CanvasRenderingContext2D;
  private inkCanvas: HTMLCanvasElement;
  private inkCtx: CanvasRenderingContext2D;
  private staticGridCache: HTMLCanvasElement;

  private strokeBadge: HTMLElement | null;
  private currentData: StrokeData | null = null;

  private isBlindMode: boolean = true;
  private isFreeWriteMode: boolean = true;
  private userStrokes: Point[][] = [];
  private currentStrokePoints: Point[] = [];
  private lastScreenPos: { x: number; y: number } | null = null;

  private autoCheckTimer: number | null = null;
  private failClearTimer: number | null = null;
  private hintTimer: number | null = null;
  private resizeTimer: number | null = null;

  private onStrictResultCallback?: (result: VerifyResult) => void;
  private onFreeRecognizeCallback?: (strokes: Point[][]) => void;

  private isDrawing: boolean = false;
  private dpr: number = 1;
  private canvasWidth: number = 300;
  private canvasHeight: number = 300;
  private abortController = new AbortController();

  constructor(traceId: string, inkId: string, badgeId: string = 'stroke-badge') {
    const traceEl = document.getElementById(traceId) as HTMLCanvasElement;
    const inkEl = document.getElementById(inkId) as HTMLCanvasElement;
    if (!traceEl || !inkEl) throw new Error('找不到 Trace 或 Ink Canvas 容器');

    this.traceCanvas = traceEl;
    this.traceCtx = this.traceCanvas.getContext('2d')!;
    this.inkCanvas = inkEl;
    this.inkCtx = this.inkCanvas.getContext('2d')!;
    this.staticGridCache = document.createElement('canvas');
    this.strokeBadge = document.getElementById(badgeId);

    this.initRetinaDisplay();
    this.bindEvents();

    window.addEventListener('resize', () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.initRetinaDisplay();
        this.clearInk();
      }, 150);
    }, { signal: this.abortController.signal });
  }

  public getUserStrokeCount(): number {
    return this.userStrokes.length;
  }

  public getTargetStrokeCount(): number {
    if (!this.currentData) return 0;
    return this.currentData.medians?.length || this.currentData.totalStrokes || 0;
  }

  public destroy() {
    this.clearAllTimers();
    this.abortController.abort();
  }

  private clearAllTimers() {
    if (this.autoCheckTimer) { clearTimeout(this.autoCheckTimer); this.autoCheckTimer = null; }
    if (this.failClearTimer) { clearTimeout(this.failClearTimer); this.failClearTimer = null; }
    if (this.hintTimer) { clearTimeout(this.hintTimer); this.hintTimer = null; }
  }

  public setCallbacks(
    onStrictResult: (result: VerifyResult) => void,
    onFreeRecognize: (strokes: Point[][]) => void
  ) {
    this.onStrictResultCallback = onStrictResult;
    this.onFreeRecognizeCallback = onFreeRecognize;
  }

  private initRetinaDisplay() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.inkCanvas.getBoundingClientRect();
    const w = Math.max(120, Math.floor(rect.width));
    const h = Math.max(120, Math.floor(rect.height));
    this.canvasWidth = w;
    this.canvasHeight = h;

    [this.traceCanvas, this.inkCanvas, this.staticGridCache].forEach(canvas => {
      canvas.width = Math.floor(w * this.dpr);
      canvas.height = Math.floor(h * this.dpr);
    });

    this.traceCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.traceCtx.scale(this.dpr, this.dpr);

    this.inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.inkCtx.scale(this.dpr, this.dpr);
    this.inkCtx.lineCap = 'round';
    this.inkCtx.lineJoin = 'round';
    this.inkCtx.lineWidth = 14;
    this.inkCtx.strokeStyle = 'rgba(25, 118, 210, 0.88)';

    this.buildStaticGridCache();
  }

  private buildStaticGridCache() {
    const ctx = this.staticGridCache.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.staticGridCache.width, this.staticGridCache.height);
    ctx.scale(this.dpr, this.dpr);

    const w = this.canvasWidth;
    const h = this.canvasHeight;
    ctx.strokeStyle = '#E0A0A0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
    ctx.moveTo(0, 0); ctx.lineTo(w, h);
    ctx.moveTo(w, 0); ctx.lineTo(0, h);
    ctx.stroke();
  }

  public loadDictationTarget(data: StrokeData) {
    this.clearAllTimers();
    this.isDrawing = false;
    this.isFreeWriteMode = false;
    this.isBlindMode = true;
    this.currentData = data;
    this.clearInk();
  }

  public enterFreeWriteMode() {
    this.clearAllTimers();
    this.isDrawing = false;
    this.isFreeWriteMode = true;
    this.isBlindMode = true;
    this.currentData = null;
    this.clearInk();
  }

  public flashHint(durationMs: number = 1800) {
    if (!this.currentData || this.isFreeWriteMode) return;
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.isBlindMode = false;
    this.renderTrace();

    this.hintTimer = window.setTimeout(() => {
      this.isBlindMode = true;
      this.renderTrace();
    }, durationMs);
  }

  public updateBadge() {
    if (!this.strokeBadge) return;
    if (this.isFreeWriteMode) {
      this.strokeBadge.textContent = `自由寫字（已寫 ${this.userStrokes.length} 劃）`;
    } else if (this.currentData) {
      const total = this.getTargetStrokeCount();
      this.strokeBadge.textContent = `已寫 ${this.userStrokes.length} / 目標 ${total} 劃`;
    }
  }

  public renderTrace() {
    if (!this.canvasWidth) return;
    this.updateBadge();

    this.traceCtx.save();
    this.traceCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.traceCtx.clearRect(0, 0, this.traceCanvas.width, this.traceCanvas.height);
    this.traceCtx.drawImage(this.staticGridCache, 0, 0);
    this.traceCtx.restore();

    if (!this.currentData || this.isBlindMode) return;

    const minSide = Math.min(this.canvasWidth, this.canvasHeight);
    const safeScale = 0.85;
    const finalScale = (minSide / 1024) * safeScale;
    const offsetX = (this.canvasWidth - minSide * safeScale) / 2;
    const offsetY = (this.canvasHeight - minSide * safeScale) / 2;

    this.traceCtx.save();
    this.traceCtx.translate(offsetX, offsetY);
    this.traceCtx.scale(finalScale, finalScale);
    this.traceCtx.translate(0, 1024);
    this.traceCtx.scale(1, -1);

    this.currentData.strokes.forEach((strokePath) => {
      try {
        const path = new Path2D(strokePath);
        this.traceCtx.fillStyle = 'rgba(183, 28, 28, 0.28)';
        this.traceCtx.fill(path);
      } catch { /* ignore */ }
    });

    this.traceCtx.restore();
  }

  public clearInk() {
    if (this.autoCheckTimer) { clearTimeout(this.autoCheckTimer); this.autoCheckTimer = null; }
    if (this.failClearTimer) { clearTimeout(this.failClearTimer); this.failClearTimer = null; }
    this.userStrokes = [];
    this.currentStrokePoints = [];
    this.lastScreenPos = null;

    this.inkCtx.save();
    this.inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.inkCtx.clearRect(0, 0, this.inkCanvas.width, this.inkCanvas.height);
    this.inkCtx.restore();
    this.renderTrace();
  }

  public scheduleFailClear(delayMs: number = 950) {
    if (this.failClearTimer) clearTimeout(this.failClearTimer);
    this.failClearTimer = window.setTimeout(() => {
      this.clearInk();
    }, delayMs);
  }

  public triggerVerificationNow() {
    if (this.autoCheckTimer) { clearTimeout(this.autoCheckTimer); this.autoCheckTimer = null; }
    if (this.userStrokes.length === 0) return;

    if (this.isFreeWriteMode) {
      this.onFreeRecognizeCallback?.(this.userStrokes);
      return;
    }

    if (!this.currentData) return;
    const result = DictationMatcher.verifyCharacterStrict(this.userStrokes, this.currentData);
    this.onStrictResultCallback?.(result);
  }

  private bindEvents() {
    const opts = { signal: this.abortController.signal };
    this.inkCanvas.style.touchAction = 'none';

    const getPos = (e: PointerEvent) => {
      const rect = this.inkCanvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: PointerEvent) => {
      e.preventDefault();

      // P1-1 首次落筆自癒：若 CSS 實際顯示尺寸與 Canvas 緩衝區尺寸不符，立即校正
      const rect = this.inkCanvas.getBoundingClientRect();
      if (Math.abs(rect.width - this.canvasWidth) > 2 || Math.abs(rect.height - this.canvasHeight) > 2) {
        this.initRetinaDisplay();
        this.clearInk();
      }

      if (this.autoCheckTimer) { clearTimeout(this.autoCheckTimer); this.autoCheckTimer = null; }
      if (this.failClearTimer) { clearTimeout(this.failClearTimer); this.failClearTimer = null; }

      this.inkCanvas.setPointerCapture(e.pointerId);
      this.isDrawing = true;
      const pos = getPos(e);
      this.lastScreenPos = pos;
      this.currentStrokePoints = [
        DictationMatcher.screenToHanziCoords(pos.x, pos.y, this.canvasWidth, this.canvasHeight)
      ];
      this.inkCtx.beginPath();
      this.inkCtx.moveTo(pos.x, pos.y);
    };

    const move = (e: PointerEvent) => {
      e.preventDefault();
      if (!this.isDrawing) return;
      const pos = getPos(e);

      if (this.lastScreenPos && Math.hypot(pos.x - this.lastScreenPos.x, pos.y - this.lastScreenPos.y) < 2.5) {
        return;
      }
      this.lastScreenPos = pos;

      this.currentStrokePoints.push(
        DictationMatcher.screenToHanziCoords(pos.x, pos.y, this.canvasWidth, this.canvasHeight)
      );
      this.inkCtx.lineTo(pos.x, pos.y);
      this.inkCtx.stroke();
    };

    const stop = (e: PointerEvent) => {
      e.preventDefault();
      if (this.isDrawing) {
        this.inkCtx.closePath();
        this.isDrawing = false;

        if (this.currentStrokePoints.length > 1) {
          this.userStrokes.push(this.currentStrokePoints);
          this.updateBadge();
        }

        try {
          if (this.inkCanvas.hasPointerCapture(e.pointerId)) {
            this.inkCanvas.releasePointerCapture(e.pointerId);
          }
        } catch { /* ignore */ }

        if (this.isFreeWriteMode && this.userStrokes.length >= 1) {
          this.autoCheckTimer = window.setTimeout(() => {
            this.triggerVerificationNow();
          }, 950);
        } else if (this.currentData && this.userStrokes.length >= 1) {
          const targetTotal = this.getTargetStrokeCount();
          const delay = targetTotal > 0 && this.userStrokes.length >= targetTotal ? 850 : 1600;
          this.autoCheckTimer = window.setTimeout(() => {
            this.triggerVerificationNow();
          }, delay);
        }
      }
    };

    this.inkCanvas.addEventListener('pointerdown', start, opts);
    this.inkCanvas.addEventListener('pointermove', move, opts);
    this.inkCanvas.addEventListener('pointerup', stop, opts);
    this.inkCanvas.addEventListener('pointercancel', stop, opts);
  }
}
