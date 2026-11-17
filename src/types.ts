// src/types.ts
import type { I18nKey } from './i18n';

/** 手寫筆跡座標點 (1024x1024 內部標準解析度) */
export interface Point {
  readonly x: number; // 0~1024 內部標準座標
  readonly y: number; // 0~1024 Cartesian Y 軸 (底部為 0)
}

/** 字庫分片資料結構 (SSOT: Single Source of Truth) */
export interface StrokeData {
  readonly char: string;
  readonly unicode: string;
  readonly totalStrokes?: number;
  readonly radical?: string;
  readonly jyutping?: readonly string[];
  readonly pinyin?: readonly string[];
  readonly strokes: readonly string[]; // SVG Path 陣列
  readonly medians?: readonly number[][][]; // 骨架特徵座標 [筆畫索引][點索引][x, y]
}

/** 默書題目與進度狀態 Token（自由寫字與選字修正時需動態更新 char，故保留 Mutable） */
export interface DictationToken {
  char: string;
  isPunctuation: boolean;
  revealed: boolean;
  skipped?: boolean;
}

/** 
 * 嚴格驗證狀態碼 
 * (已精準對齊 DictationMatcher 的實際輸出範圍)
 */
export type VerifyStatus =
  | 'SUCCESS'             // 辨識成功 (包含筆順正確、倒序容錯、缺字降級)
  | 'WRONG_STROKE_COUNT'  // 筆畫數落差大於 1 畫
  | 'WRONG_SHAPE'         // 幾何特徵或空間掃描相似度不足
  | 'TOO_SMALL';          // 塗鴉面積過小 (防呆防誤觸)

/** 雙引擎比對回傳結果 */
export interface VerifyResult {
  readonly status: VerifyStatus;
  readonly score: number;
  readonly message: string;
  readonly isFallback?: boolean; // 缺字降級放行標記 (供 UI 顯示半透明標籤)
  readonly i18nKey?: I18nKey;    // 保留供純核心模組抽離 t() 依賴時使用
  readonly meta?: Record<string, string | number>;
}
