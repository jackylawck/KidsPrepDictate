// src/types.ts

export interface Point {
  x: number; // 0~1024 標準座標
  y: number; // 0~1024 Cartesian Y 軸 (底部為 0)
}

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

export interface DictationToken {
  char: string;
  isPunctuation: boolean;
  revealed: boolean;
  skipped?: boolean; // 標記為「跳過／未掌握」，供家長檢視
}

export type VerifyStatus =
  | 'SUCCESS'
  | 'WRONG_STROKE_COUNT'
  | 'WRONG_ORDER'
  | 'WRONG_SHAPE'
  | 'TOO_SMALL'
  | 'UNSUPPORTED';

export interface VerifyResult {
  status: VerifyStatus;
  score: number;
  message: string;
}
