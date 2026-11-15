// tests/dictation-matcher.spec.ts
import { describe, it, expect } from 'vitest';
import { DictationMatcher, Point } from '../src/core/dictation-matcher';
import { StrokeData } from '../src/ui/canvas-trace';

describe('KidsPrepDictate 手寫筆畫比對引擎測試', () => {
  // 模擬「十」字標準數據 (先橫後豎)
  const mockCharShi: StrokeData = {
    char: '十',
    unicode: '5341',
    totalStrokes: 2,
    strokes: ['M 100 500 L 900 500', 'M 500 900 L 500 100'],
    medians: [
      [[150, 520], [880, 520]], // 第一畫：橫 (由左至右)
      [[512, 880], [512, 120]]  // 第二畫：豎 (由上至下)
    ]
  };

  it('座標轉換器應正確將螢幕座標映射至 1024 Cartesian 座標系', () => {
    const canvasWidth = 400;
    // 畫布正中央 (200, 200) 應對應 (512, 512)
    const center = DictationMatcher.screenToHanziCoords(200, 200, canvasWidth, 0.85);
    expect(Math.round(center.x)).toBe(512);
    expect(Math.round(center.y)).toBe(512);
  });

  it('當小朋友按正確筆順與方向書寫時，應判定為通過', () => {
    const childStrokes: Point[][] = [
      [{ x: 180, y: 500 }, { x: 850, y: 510 }], // 稍微歪斜的橫
      [{ x: 500, y: 850 }, { x: 520, y: 150 }]  // 稍微歪斜的豎
    ];
    expect(DictationMatcher.verifyCharacter(childStrokes, mockCharShi)).toBe(true);
  });

  it('當小朋友亂畫（方向完全相反或筆畫數嚴重不符）時，應拒絕通過', () => {
    const wrongStrokes: Point[][] = [
      [{ x: 880, y: 520 }, { x: 150, y: 520 }], // 倒筆（由右至左）
      [{ x: 512, y: 120 }, { x: 512, y: 880 }]  // 倒筆（由下至上）
    ];
    expect(DictationMatcher.verifyCharacter(wrongStrokes, mockCharShi)).toBe(false);
  });

  it('對於無 medians 数据的生僻字，應啟用安全邊界框檢查防止亂點過關', () => {
    const rareChar: StrokeData = {
      char: '龘',
      unicode: '9F98',
      totalStrokes: 1,
      strokes: []
    };

    // 隨便點兩點（範圍極小）應不通過
    const tinyDot: Point[][] = [[{ x: 500, y: 500 }, { x: 510, y: 510 }]];
    expect(DictationMatcher.verifyCharacter(tinyDot, rareChar)).toBe(false);

    // 認真寫滿格子應通過（模擬真實書寫軌跡的連續取樣點）
    const validBox: Point[][] = [[
      { x: 200, y: 800 },
      { x: 350, y: 650 },
      { x: 500, y: 500 },
      { x: 650, y: 350 },
      { x: 800, y: 200 }
    ]];
    expect(DictationMatcher.verifyCharacter(validBox, rareChar)).toBe(true);
  });
});
