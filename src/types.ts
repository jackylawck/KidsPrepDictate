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

/** 默書題目與進度狀態 Token */
export interface DictationToken {
  readonly char: string;
  readonly isPunctuation: boolean;
  
  // 執行期間會頻繁變更的狀態，不設 readonly
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

/** 
 * 雙引擎比對回傳結果 
 */
export interface VerifyResult {
  readonly status: VerifyStatus;
  readonly score: number;
  readonly message: string;
  
  // v1.1 建議：以明確語意取代 score === 0.8 的浮點數巧合判斷
  readonly isFallback?: boolean;
  
  // 保留未來多語系進階錯誤分級的擴充空間
  readonly i18nKey?: I18nKey;
  readonly meta?: Record<string, string | number>;
}
