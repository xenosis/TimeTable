import { fitRowHeights } from '../src/utils/timetableGrid';

describe('fitRowHeights (요일 확대 보기를 한 화면에 맞춤)', () => {
  it('합계가 주어진 높이가 되도록 비율을 유지하며 늘린다', () => {
    const fitted = fitRowHeights([60, 120, 60], 480, 40);
    expect(fitted.reduce((a, b) => a + b, 0)).toBeCloseTo(480);
    expect(fitted[1] / fitted[0]).toBeCloseTo(2);
  });

  it('줄여야 할 때도 비율을 유지한다', () => {
    const fitted = fitRowHeights([100, 100, 100, 100], 320, 40);
    expect(fitted).toEqual([80, 80, 80, 80]);
  });

  it('가장 낮은 행이 최소 높이 밑으로 내려가면 맞추지 않고 원래 높이를 돌려준다(스크롤)', () => {
    const original = [30, 300, 30];
    expect(fitRowHeights(original, 200, 40)).toBe(original);
  });

  it('높이를 알 수 없거나 행이 없으면 원래 값을 그대로 돌려준다', () => {
    const original = [50, 50];
    expect(fitRowHeights(original, 0, 40)).toBe(original);
    expect(fitRowHeights(original, Number.NaN, 40)).toBe(original);
    expect(fitRowHeights([], 300, 40)).toEqual([]);
  });
});
