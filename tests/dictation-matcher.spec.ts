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

const threeStrokesData: StrokeData = {
  char: '三',
  unicode: '4E09',
  totalStrokes: 3,
  strokes: [],
  medians: [
    [[200, 750], [800, 750]],
    [[250, 512], [750, 512]],
    [[150, 250], [850, 250]],
  ],
};

const line = (x1: number, y1: number, x2: number, y2: number, n = 12): Point[] =>
  Array.from({ length: n }, (_, i) => ({
    x: x1 + (x2 - x1) * (i / (n - 1)),
    y: y1 + (y2 - y1) * (i / (n - 1)),
  }));

describe('DictationMatcher.verifyCharacterStrict（雙引擎版）', () => {
  it('SUCCESS：正確筆順與位置', () => {
    const res = DictationMatcher.verifyCharacterStrict([line(100, 512, 900, 512)], yiData);
    expect(res.status).toBe('SUCCESS');
    expect(res.score).toBeGreaterThan(0.48);
  });

  it('SUCCESS（無順序容錯）：字形正確即使筆順倒轉亦友善放行', () => {
    const strokes = [
      line(512, 900, 512, 100),
      line(100, 512, 900, 512),
    ];
    const res = DictationMatcher.verifyCharacterStrict(strokes, shiData);
    expect(res.status).toBe('SUCCESS');
    expect(res.message).toContain('留意下筆順');
  });

  it('WRONG_STROKE_COUNT：筆畫數差距大於 1 畫時擋下', () => {
    const res = DictationMatcher.verifyCharacterStrict([line(100, 512, 900, 512)], threeStrokesData);
    expect(res.status).toBe('WRONG_STROKE_COUNT');
  });

  it('WRONG_SHAPE：字形完全相反（由右至左）不通過', () => {
    const res = DictationMatcher.verifyCharacterStrict([line(900, 512, 100, 512)], yiData);
    expect(res.status).toBe('WRONG_SHAPE');
  });

  it('TOO_SMALL：塗鴉面積過小', () => {
    const tiny = [line(500, 500, 510, 510, 4)];
    const res = DictationMatcher.verifyCharacterStrict(tiny, yiData);
    expect(res.status).toBe('TOO_SMALL');
  });

  it('UNSUPPORTED（無 DOM 環境且缺 medians）：絕不無條件放水過關', () => {
    const noMedian: StrokeData = {
      char: '晚',
      unicode: '665A',
      totalStrokes: 0,
      strokes: [],
      medians: [],
    };
    const res = DictationMatcher.verifyCharacterStrict([line(100, 512, 900, 512)], noMedian);
    expect(res.status).toBe('UNSUPPORTED');
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
