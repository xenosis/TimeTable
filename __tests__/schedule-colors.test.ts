import { timetableCategories } from '../src/db/types';
import { colorKeys, themes } from '../src/theme';
import { contrastRatio } from '../src/theme/contrast';
import { isMoveTitle, MOVE_STRIPE_COLOR, readableScheduleText, resolveScheduleColor, scheduleColorFamilies, scheduleStripeColor } from '../src/theme/scheduleColors';
import { lightenColor } from '../src/utils/scheduleClock';

it('분류별 다른 색 계열과 과목별 색조를 제공하고 두 테마에서 읽을 수 있다', () => {
  expect(new Set(timetableCategories.map((kind) => resolveScheduleColor(kind, 'other').backgroundColor)).size).toBe(5);
  for (const kind of timetableCategories) {
    expect(new Set(colorKeys.map((key) => resolveScheduleColor(kind, key).backgroundColor)).size).toBe(colorKeys.length);
    for (const key of colorKeys) {
      const color = resolveScheduleColor(kind, key);
      expect(contrastRatio(color.textColor, color.backgroundColor)).toBeGreaterThanOrEqual(4.5);
      const dimmed = lightenColor(color.backgroundColor, 0.12);
      for (const theme of themes) {
        expect(theme.colors.text).toBeTruthy();
        expect(contrastRatio(readableScheduleText(dimmed), dimmed)).toBeGreaterThanOrEqual(4.5);
      }
    }
  }
  expect(resolveScheduleColor('after_school', 'unknown')).toEqual(resolveScheduleColor('after_school', 'other'));
});

it('같은 계열의 색도 흰색 혼합의 미세한 차이보다 뚜렷하게 구분된다', () => {
  const channels = (color: string) => [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
  for (const kind of timetableCategories) {
    const colors = colorKeys.map((key) => channels(resolveScheduleColor(kind, key).backgroundColor));
    for (let a = 0; a < colors.length; a++) for (let b = a + 1; b < colors.length; b++) {
      expect(Math.hypot(...colors[a].map((value, index) => value - colors[b][index]))).toBeGreaterThanOrEqual(30);
    }
  }
});

it('기본 색은 이름별로 안정적으로 나뉘고, 직접 고른 과목 색은 이름에 영향받지 않는다', () => {
  const color = (title: string) => resolveScheduleColor('academy', 'other', title).backgroundColor;
  expect(color('생명융합과학')).toBe(color(' 생명 융합 과학 '));
  expect(new Set(['생명융합과학', '피아노', '해법수학', '리틀 포레스트', '미술'].map(color)).size).toBeGreaterThanOrEqual(4);
  expect(resolveScheduleColor('academy', 'math', '학원A')).toEqual(resolveScheduleColor('academy', 'math', '학원B'));
});

it('이동 일정은 종류·저장된 색·이름과 상관없이 같은 색이다', () => {
  const moves = [
    resolveScheduleColor('life', 'other', '돌봄 → 일루스터'), resolveScheduleColor('life', 'other', '일루스터 → 루미애'),
    resolveScheduleColor('care', 'math', '교실 → 돌봄'), resolveScheduleColor('academy', 'english', '지니리→일루스터'),
  ];
  expect(new Set(moves.map((color) => color.backgroundColor)).size).toBe(1);
  expect(moves[0].label).toBe('이동');
  expect(contrastRatio(moves[0].textColor, moves[0].backgroundColor)).toBeGreaterThanOrEqual(4.5);
  // 이동 색은 어느 종류·과목 색과도 겹치지 않는다
  for (const kind of timetableCategories) for (const key of colorKeys) {
    expect(resolveScheduleColor(kind, key).backgroundColor).not.toBe(moves[0].backgroundColor);
  }
});

it('이동 판정은 → 와 -> 를 모두 인정하고 띠 색도 이동이면 고정한다', () => {
  expect(isMoveTitle('돌봄 -> 일루스터')).toBe(true);
  expect(isMoveTitle('피아노')).toBe(false);
  expect(scheduleStripeColor('care', '교실 → 돌봄')).toBe(MOVE_STRIPE_COLOR);
  expect(scheduleStripeColor('academy', '지니리 → 일루스터')).toBe(MOVE_STRIPE_COLOR);
  expect(scheduleStripeColor('academy', '피아노')).toBe(scheduleColorFamilies.academy.base);
});
