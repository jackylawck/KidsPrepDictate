import { describe, it, expect } from 'vitest';
import { DictationMatcher } from '../src/core/dictation-matcher';
import type { Point, StrokeData } from '../src/types';

const YI_MEDIAN = [[100, 512], [300, 512], [500, 512], [700, 512], [900, 512]];
const yiData: StrokeData = {
  char: '一',
  unicode: '4E00',
  totalStrokes: 1,
  strokes: ['M100,512 L900,512'],
  medians: [YI_MEDIAN],
};

const shiData: StrokeData = {
  char: '十',
  unicode: '5341',
  totalStrokes: 2,
  strokes: ['M100,512 L900,512', 'M512,100 L512,900'],
  medians: [
    [[100, 512], [500, 512], [900, 512]],
    [[512, 900], [512, 500], [512, 100]],
  ],
};

const line = (x1: number, y1: number, x2: number, y2: number, n = 12): Point[] =>
  Array.from({ length: n }, (_, i) => ({
    x: x1 + (x2 - x1) * (i / (n - 1)),
    y: y1 + (y2 - y1) * (i / (n - 1)),
  }));

describe('DictationMatcher.verifyCharacterStrict', () => {
  it('SUCCESS：正確筆順與位置', () => {
    const res = DictationMatcher.verifyCharacterStrict([line(100, 512, 900, 512)], yiData);
    expect(res.status).toBe('SUCCESS');
    expect(res.score).toBeGreaterThan(0.64);
  });

  it('WRONG_STROKE_COUNT：少寫一筆', () => {
    const res = DictationMatcher.verifyCharacterStrict([line(100, 512, 900, 512)], shiData);
    expect(res.status).toBe('WRONG_STROKE_COUNT');
    expect(res.message).toContain('2 畫');
  });

  it('WRONG_ORDER：字形正確但筆順倒轉', () => {
    const strokes = [
      line(512, 900, 512, 100),
      line(100, 512, 900, 512),
    ];
    const res = DictationMatcher.verifyCharacterStrict(strokes, shiData);
    expect(res.status).toBe('WRONG_ORDER');
  });

  it('WRONG_SHAPE：筆畫數正確但方向錯（由右至左）', () => {
    const res = DictationMatcher.verifyCharacterStrict([line(900, 512, 100, 512)], yiData);
    expect(['WRONG_SHAPE', 'WRONG_ORDER']).toContain(res.status);
  });

  it('TOO_SMALL：塗鴉面積過小', () => {
    const tiny = [line(500, 500, 510, 510, 4)];
    const res = DictationMatcher.verifyCharacterStrict(tiny, yiData);
    expect(res.status).toBe('TOO_SMALL');
  });

  it('UNSUPPORTED：缺 medians 時誠實拒絕，不送分', () => {
    const noMedian: StrokeData = {
      char: '?',
      unicode: '003F',
      totalStrokes: 3,
      strokes: [],
      medians: [],
    };
    const res = DictationMatcher.verifyCharacterStrict([line(100, 512, 900, 512)], noMedian);
    expect(res.status).toBe('UNSUPPORTED');
  });

  it('空筆畫應回傳非 SUCCESS 狀態', () => {
    const res = DictationMatcher.verifyCharacterStrict([], yiData);
    expect(res.status).not.toBe('SUCCESS');
  });
});

describe('DictationMatcher.screenToHanziCoords', () => {
  it('正方形畫布：中心點應落在 (512, 512)', () => {
    const p = DictationMatcher.screenToHanziCoords(150, 150, 300, 300);
    expect(p.x).toBeCloseTo(512, 0);
    expect(p.y).toBeCloseTo(512, 0);
  });

  it('橫向畫布（w=600, h=300）：y 軸不應偏移', () => {
    const p = DictationMatcher.screenToHanziCoords(300, 150, 600, 300);
    expect(p.x).toBeCloseTo(512, 0);
    expect(p.y).toBeCloseTo(512, 0);
  });
});

describe('DictationMatcher.recognizeTopCandidates', () => {
  it('「一」字形應命中「一」且排第一', () => {
    const result = DictationMatcher.recognizeTopCandidates(
      [line(100, 512, 900, 512)],
      [yiData, shiData],
      3
    );
    expect(result[0]).toBe('一');
  });
});
