import { fitRowHeights } from '../src/utils/timetableGrid';

describe('fitRowHeights (요일 확대 보기를 한 화면에 맞춤)', () => {
  it('공간이 남아도 적은 일정을 화면 높이까지 늘리지 않는다', () => {
    const fitted = fitRowHeights([60, 120, 60], 480, 40);
    expect(fitted).toEqual([60, 120, 60]);
    expect(fitted[1] / fitted[0]).toBeCloseTo(2);
  });

  it('줄여야 할 때도 비율을 유지한다', () => {
    const fitted = fitRowHeights([100, 100, 100, 100], 320, 40);
    expect(fitted).toEqual([80, 80, 80, 80]);
  });

  it('시각 라벨 전체를 넣을 높이도 없으면 자연 높이로 스크롤한다', () => {
    const original = [30, 300, 30];
    expect(fitRowHeights(original, 100, 40)).toBe(original);
    fitRowHeights(original, 200, 40).forEach((height, index) => expect(height).toBeCloseTo([200 / 12, 200 * 10 / 12, 200 / 12][index]));
  });

  it('높이를 알 수 없거나 행이 없으면 원래 값을 그대로 돌려준다', () => {
    const original = [50, 50];
    expect(fitRowHeights(original, 0, 40)).toBe(original);
    expect(fitRowHeights(original, Number.NaN, 40)).toBe(original);
    expect(fitRowHeights([], 300, 40)).toEqual([]);
  });
});
