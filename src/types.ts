// src/types.ts
import type { I18nKey } from './i18n';

/** 手寫筆跡座標點 */
export interface Point {
  readonly x: number; // 0~1024 內部標準座標
  readonly y: number; // 0~1024 Cartesian Y 軸 (底部為 0)
}

/** 字庫分片資料結構 (SSOT) */
export interface StrokeData {
  readonly char: string;
  readonly unicode: string;
  readonly totalStrokes?: number;
  readonly radical?: string;
  readonly jyutping?: string[];
  readonly pinyin?: string[];
  readonly strokes: string[];
  readonly medians?: number[][][];
}

/** 默書題目與進度狀態 Token（自由寫字與選字修正時需動態更新 char） */
export interface DictationToken {
  char: string;
  isPunctuation: boolean;
  revealed: boolean;
  skipped?: boolean;
}

/** 嚴格驗證狀態碼 */
export type VerifyStatus =
  | 'SUCCESS'
  | 'WRONG_STROKE_COUNT'
  | 'WRONG_ORDER'
  | 'WRONG_SHAPE'
  | 'TOO_SMALL'
  | 'UNSUPPORTED';

/** 雙引擎比對回傳結果 */
export interface VerifyResult {
  readonly status: VerifyStatus;
  readonly score: number;
  readonly message: string;
  readonly isFallback?: boolean;
  readonly i18nKey?: I18nKey;
  readonly meta?: Record<string, string | number>;
}
