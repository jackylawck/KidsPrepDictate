// src/ui/canvas-trace.ts
import { DictationMatcher, Point } from '../core/dictation-matcher';

export interface StrokeData {
  char: string;
  unicode: string;
  totalStrokes?: number;
  radical?: string;
  jyutping?: string[];
  pinyin?: string[];
  strokes: string[];
  medians?: number[][][];
}

export class TraceCanvas {
  private traceCanvas: HTMLCanvasElement;
  private traceCtx: CanvasRenderingContext2D;
  private inkCanvas: HTMLCanvasElement;
  private inkCtx: CanvasRenderingContext2D;

  private strokeBadge: HTMLElement | null;
  private currentData: StrokeData | null = null;
  private _currentStrokeIndex: number = 1;

  // 默書模式專屬狀態
  private isBlindMode: boolean = true;
  private userStrokes: Point[][] = [];
  private currentStrokePoints: Point[] = [];
  private autoCheckTimer: number | null = null;
  private hintTimer: number | null = null;
  private onMatchSuccessCallback?: () => void;
  private onMatchFailCallback?: () => void;

  private isPlaying: boolean = false;
  private playTimer: number | null = null;
  private strokeInterval: number = 900;
  private isDrawing: boolean = false;

  private dpr: number = 1;
  private canvasWidth: number = 300;
  private abortController = new AbortController();
  private resizeTimer: number | null = null;

  constructor(traceId: string, inkId: string, badgeId: string = 'stroke-badge') {
    const traceEl = document.getElementById(traceId) as HTMLCanvasElement;
    const inkEl = document.getElementById(inkId) as HTMLCanvasElement;
    if (!traceEl || !inkEl) throw new Error('找不到 Trace 或 Ink Canvas 容器');

    this.traceCanvas = traceEl;
    this.traceCtx = this.traceCanvas.getContext('2d')!;
    this.inkCanvas = inkEl;
    this.inkCtx = this.inkCanvas.getContext('2d')!;
    this.strokeBadge = document.getElementById(badgeId);

    this.initRetinaDisplay();
    this.bindEvents();

    window.addEventListener('resize', () => {
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        const savedInk = this.inkCanvas.width > 0 && this.inkCanvas.height > 0
          ? this.inkCtx.getImageData(0, 0, this.inkCanvas.width, this.inkCanvas.height)
          : null;
        this.initRetinaDisplay();
        this.renderTrace();
        if (savedInk) this.inkCtx.putImageData(savedInk, 0, 0);
      }, 150);
    }, { signal: this.abortController.signal });
  }

  public setDictationCallbacks(onSuccess: () => void, onFail?: () => void) {
    this.onMatchSuccessCallback = onSuccess;
    this.onMatchFailCallback = onFail;
  }

  private initRetinaDisplay() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.inkCanvas.getBoundingClientRect();
    const w = Math.floor(rect.width);
    const h = Math.floor(rect.height);
    this.canvasWidth = w;

    [this.traceCanvas, this.inkCanvas].forEach(canvas => {
      canvas.width = Math.floor(w * this.dpr);
      canvas.height = Math.floor(h * this.dpr);
    });

    this.traceCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.traceCtx.scale(this.dpr, this.dpr);

    this.inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.inkCtx.scale(this.dpr, this.dpr);
    this.inkCtx.lineCap = 'round';
    this.inkCtx.lineJoin = 'round';
    this.inkCtx.lineWidth = 16;
    this.inkCtx.strokeStyle = 'rgba(25, 118, 210, 0.88)';
  }

  public loadDictationTarget(data: StrokeData) {
    this.stopAutoPlay();
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.isDrawing = false;
    this.isBlindMode = true; // 默書模式預設隱藏字形
    this.currentData = data;
    this._currentStrokeIndex = 1;
    this.clearInk();
    this.renderTrace();
  }

  // 卡關偷睇提示：閃現標準筆順 1.8 秒後自動恢復盲寫
  public flashHint(durationMs: number = 1800) {
    if (!this.currentData) return;
    if (this.hintTimer) clearTimeout(this.hintTimer);
    this.isBlindMode = false;
    this._currentStrokeIndex = this.currentData.totalStrokes || this.currentData.strokes.length;
    this.renderTrace();

    this.hintTimer = window.setTimeout(() => {
      this.isBlindMode = true;
      this.renderTrace();
    }, durationMs);
  }

  public clearData() {
    this.stopAutoPlay();
    this.currentData = null;
    this.clearInk();
    if (this.strokeBadge) this.strokeBadge.textContent = '準備默書';
    this.renderTrace();
  }

  private drawGrid() {
    this.traceCtx.save();
    this.traceCtx.strokeStyle = '#E0A0A0';
    this.traceCtx.lineWidth = 3;
    this.traceCtx.beginPath();
    this.traceCtx.moveTo(0, 512); this.traceCtx.lineTo(1024, 512);
    this.traceCtx.moveTo(512, 0); this.traceCtx.lineTo(512, 1024);
    this.traceCtx.moveTo(0, 0); this.traceCtx.lineTo(1024, 1024);
    this.traceCtx.moveTo(1024, 0); this.traceCtx.lineTo(0, 1024);
    this.traceCtx.stroke();
    this.traceCtx.restore();
  }

  public renderTrace() {
    if (!this.canvasWidth) return;

    this.traceCtx.save();
    this.traceCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.traceCtx.clearRect(0, 0, this.traceCanvas.width, this.traceCanvas.height);
    this.traceCtx.restore();

    if (this.strokeBadge) {
      if (this.currentData) {
        const total = this.currentData.totalStrokes || this.currentData.strokes.length;
        this.strokeBadge.textContent = `已寫 ${this.userStrokes.length} / 目標 ${total} 劃`;
      } else {
        this.strokeBadge.textContent = '等待出題';
      }
    }

    const baseScaleFactor = this.canvasWidth / 1024;
    this.traceCtx.save();
    this.traceCtx.scale(baseScaleFactor, baseScaleFactor);
    this.traceCtx.translate(0, 1024);
    this.traceCtx.scale(1, -1);
    this.drawGrid();
    this.traceCtx.restore();

    // 盲寫模式下不顯示字形
    if (!this.currentData || this.isBlindMode) return;

    const safeScale = 0.85;
    const finalScaleFactor = baseScaleFactor * safeScale;
    const centerOffset = (this.canvasWidth * (1 - safeScale)) / 2;

    this.traceCtx.save();
    this.traceCtx.translate(centerOffset, centerOffset);
    this.traceCtx.scale(finalScaleFactor, finalScaleFactor);
    this.traceCtx.translate(0, 1024);
    this.traceCtx.scale(1, -1);

    this.currentData.strokes.forEach((strokePath, index) => {
      try {
        const path = new Path2D(strokePath);
        this.traceCtx.fillStyle = index + 1 === this._currentStrokeIndex ? '#d32f2f' : '#bdbdbd';
        this.traceCtx.fill(path);
      } catch { /* ignore */ }
    });

    this.traceCtx.restore();
  }

  public stopAutoPlay() {
    this.isPlaying = false;
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  public clearInk() {
    if (this.autoCheckTimer) clearTimeout(this.autoCheckTimer);
    this.userStrokes = [];
    this.currentStrokePoints = [];
    this.inkCtx.save();
    this.inkCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.inkCtx.clearRect(0, 0, this.inkCanvas.width, this.inkCanvas.height);
    this.inkCtx.restore();
    this.renderTrace();
  }

  private evaluateUserWriting() {
    if (!this.currentData) return;
    const isMatched = DictationMatcher.verifyCharacter(this.userStrokes, this.currentData);
    if (isMatched) {
      this.onMatchSuccessCallback?.();
    } else {
      this.onMatchFailCallback?.();
    }
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
      if (this.autoCheckTimer) clearTimeout(this.autoCheckTimer);
      this.inkCanvas.setPointerCapture(e.pointerId);
      this.isDrawing = true;
      const pos = getPos(e);
      this.currentStrokePoints = [DictationMatcher.screenToHanziCoords(pos.x, pos.y, this.canvasWidth)];
      this.inkCtx.beginPath();
      this.inkCtx.moveTo(pos.x, pos.y);
    };

    const move = (e: PointerEvent) => {
      e.preventDefault();
      if (!this.isDrawing) return;
      const pos = getPos(e);
      this.currentStrokePoints.push(DictationMatcher.screenToHanziCoords(pos.x, pos.y, this.canvasWidth));
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
          this.renderTrace(); // 更新已寫筆畫數
        }

        try {
          if (this.inkCanvas.hasPointerCapture(e.pointerId)) {
            this.inkCanvas.releasePointerCapture(e.pointerId);
          }
        } catch { /* ignore */ }

        // 當寫滿目標筆畫數（或達到目標筆畫-1）且停頓 750ms，自動觸發認字判定
        if (this.currentData) {
          const targetTotal = this.currentData.totalStrokes || this.currentData.strokes.length;
          if (this.userStrokes.length >= Math.max(1, targetTotal - 1)) {
            this.autoCheckTimer = window.setTimeout(() => {
              this.evaluateUserWriting();
            }, 750);
          }
        }
      }
    };

    this.inkCanvas.addEventListener('pointerdown', start, opts);
    this.inkCanvas.addEventListener('pointermove', move, opts);
    this.inkCanvas.addEventListener('pointerup', stop, opts);
    this.inkCanvas.addEventListener('pointercancel', stop, opts);
  }
}
