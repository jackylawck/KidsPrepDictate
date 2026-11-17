// src/ui/canvas-trace.ts
import type { Point, StrokeData, VerifyResult } from '../types';
import { DictationMatcher } from '../core/dictation-matcher';
import { t } from '../i18n';

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
  
  // 效能優化：使用基本數據型別快取螢幕座標，減少記憶體分配 (GC Churn)
  private lastScreenX: number = -1;
  private lastScreenY: number = -1;
  private activePointerId: number | null = null;

  private autoCheckTimer: number | null = null;
  private failClearTimer: number | null = null;
  private hintTimer: number | null = null;
  private resizeTimer: number | null = null;
  private rafId: number | null = null; // 用於 RAF 節流

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
    // 優化：提示瀏覽器可能需要頻繁讀取此畫布（若後續 matcher 會在此讀取像素）
    this.inkCtx = this.inkCanvas.getContext('2d', { willReadFrequently: true })!; 
    
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
    if (this.rafId) cancelAnimationFrame(this.rafId);
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
    
    // 配合視覺掃描引擎的光柵化特徵提取
    this.inkCtx.lineWidth = 16;
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
      this.strokeBadge.textContent = t('badgeFree', { count: this.userStrokes.length });
    } else if (this.currentData) {
      const total = this.getTargetStrokeCount();
      if (total > 0) {
        this.strokeBadge.textContent = t('badgeStrict', {
          current: this.userStrokes.length,
          total
        });
      } else {
        this.strokeBadge.textContent = t('badgeVisualScan', {
          current: this.userStrokes.length
        });
      }
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
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    
    this.userStrokes = [];
    this.currentStrokePoints = [];
    this.lastScreenX = -1;
    this.lastScreenY = -1;
    this.activePointerId = null;

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

  private scheduleAutoVerify() {
    if (this.isFreeWriteMode && this.userStrokes.length >= 1) {
      this.autoCheckTimer = window.setTimeout(() => {
        this.triggerVerificationNow();
      }, 950);
    } else if (this.currentData && this.userStrokes.length >= 1) {
      const targetTotal = this.getTargetStrokeCount();
      const delay = targetTotal > 0 && this.userStrokes.length >= targetTotal ? 850 : 1400;
      this.autoCheckTimer = window.setTimeout(() => {
        this.triggerVerificationNow();
      }, delay);
    }
  }

  private bindEvents() {
    const opts = { signal: this.abortController.signal };
    this.inkCanvas.style.touchAction = 'none';

    // 效能優化：使用物件重用，避免每次 getPos 創建新物件
    const currentPos = { x: 0, y: 0 };
    const getPos = (e: PointerEvent) => {
      const rect = this.inkCanvas.getBoundingClientRect();
      currentPos.x = e.clientX - rect.left;
      currentPos.y = e.clientY - rect.top;
      return currentPos;
    };

    const start = (e: PointerEvent) => {
      e.preventDefault();
      // 防呆：如果是其他手指觸碰，直接忽略
      if (!e.isPrimary || this.isDrawing) return;
      
      this.activePointerId = e.pointerId;
      const rect = this.inkCanvas.getBoundingClientRect();
      if (Math.abs(rect.width - this.canvasWidth) > 2 || Math.abs(rect.height - this.canvasHeight) > 2) {
        this.initRetinaDisplay();
        this.clearInk();
      }

      this.clearAllTimers();
      this.inkCanvas.setPointerCapture(this.activePointerId);
      this.isDrawing = true;
      
      const pos = getPos(e);
      this.lastScreenX = pos.x;
      this.lastScreenY = pos.y;
      
      this.currentStrokePoints = [
        DictationMatcher.screenToHanziCoords(pos.x, pos.y, this.canvasWidth, this.canvasHeight)
      ];
      
      this.inkCtx.beginPath();
      this.inkCtx.moveTo(pos.x, pos.y);
      this.inkCtx.lineTo(pos.x + 0.1, pos.y + 0.1);
      this.inkCtx.stroke();
    };

    // 效能優化：將繪製動作委託給 requestAnimationFrame 處理
    let pendingMoveEvent: PointerEvent | null = null;
    
    const drawMove = () => {
      if (!this.isDrawing || !pendingMoveEvent) return;
      const pos = getPos(pendingMoveEvent);
      pendingMoveEvent = null; // 處理完畢清空

      // 防抖：過於微小的移動不處理，減少轉換與繪製開銷
      if (this.lastScreenX !== -1 && Math.hypot(pos.x - this.lastScreenX, pos.y - this.lastScreenY) < 2.5) {
        this.rafId = null;
        return;
      }
      
      this.lastScreenX = pos.x;
      this.lastScreenY = pos.y;

      this.currentStrokePoints.push(
        DictationMatcher.screenToHanziCoords(pos.x, pos.y, this.canvasWidth, this.canvasHeight)
      );
      this.inkCtx.lineTo(pos.x, pos.y);
      this.inkCtx.stroke();
      this.rafId = null;
    };

    const move = (e: PointerEvent) => {
      e.preventDefault();
      if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
      
      // 節流：只記錄最後一次事件，交由下一影格繪製
      pendingMoveEvent = e;
      if (!this.rafId) {
        this.rafId = requestAnimationFrame(drawMove);
      }
    };

    const stop = (e: PointerEvent) => {
      e.preventDefault();
      if (!this.isDrawing || e.pointerId !== this.activePointerId) return;
      
      // 確保最後一點被繪製
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (pendingMoveEvent) drawMove();

      const pos = getPos(e);
      this.inkCtx.lineTo(pos.x, pos.y);
      this.inkCtx.stroke();
      this.inkCtx.closePath();

      this.isDrawing = false;
      this.activePointerId = null;
      pendingMoveEvent = null;

      if (this.currentStrokePoints.length > 0) {
        this.userStrokes.push(this.currentStrokePoints);
        this.updateBadge();
      }

      try {
        if (this.inkCanvas.hasPointerCapture(e.pointerId)) {
          this.inkCanvas.releasePointerCapture(e.pointerId);
        }
      } catch { /* ignore */ }

      this.scheduleAutoVerify();
    };

    const cancel = (e: PointerEvent) => {
      e.preventDefault();
      if (!this.isDrawing || e.pointerId !== this.activePointerId) return;

      if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
      pendingMoveEvent = null;

      this.inkCtx.closePath();
      this.isDrawing = false;
      this.activePointerId = null;
      this.currentStrokePoints = [];
      this.lastScreenX = -1;
      this.lastScreenY = -1;

      try {
        if (this.inkCanvas.hasPointerCapture(e.pointerId)) {
          this.inkCanvas.releasePointerCapture(e.pointerId);
        }
      } catch { /* ignore */ }

      this.scheduleAutoVerify();
    };

    this.inkCanvas.addEventListener('pointerdown', start, opts);
    this.inkCanvas.addEventListener('pointermove', move, opts);
    this.inkCanvas.addEventListener('pointerup', stop, opts);
    this.inkCanvas.addEventListener('pointercancel', cancel, opts);
  }
}
