import { act, create, type ReactTestInstance } from 'react-test-renderer';

import { WeekTimeGrid } from '../src/components/WeekTimeGrid';
import type { TimetableItem } from '../src/db/timetableRepository';
import { defaultTheme } from '../src/theme';

const item = (id: number, weekday: number, title: string, startTime: string, endTime: string, memo = ''): TimetableItem => (
  { id, weekday, title, startTime, endTime, category: 'academy', colorKey: 'math', iconKey: 'number', memo } as unknown as TimetableItem
);
const days = [
  { day: 1, items: [item(1, 1, '영어 학원', '16:10', '17:10'), item(2, 1, '피아노', '17:10', '18:10', '차 타고 이동')] },
  { day: 2, items: [item(3, 2, '수학', '16:20', '17:00')] },
  { day: 3, items: [] }, { day: 4, items: [] }, { day: 5, items: [] },
];

const texts = (node: ReactTestInstance): string[] => node.findAll((child) => (child.type as unknown) === 'Text').map((child) => child.children.filter((value) => typeof value === 'string').join(''));
const cells = (root: ReactTestInstance) => root.findAll((node) => typeof node.type === 'string' && typeof node.props.accessibilityLabel === 'string' && /요일 \d/.test(node.props.accessibilityLabel));
const flat = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(5).filter(Boolean) as object[]);

function render(nowMinutes?: number, today = 1) {
  let tree!: ReturnType<typeof create>;
  act(() => { tree = create(<WeekTimeGrid theme={defaultTheme} days={days} today={today} onSelectDay={() => undefined} nowMinutes={nowMinutes} />); });
  return tree.root;
}

describe('주간표 시간 칼럼 (P10.1)', () => {
  it('헤더에 시간 칼럼 제목이 있고, 모든 시작·종료 시각이 왼쪽 시간 칼럼에서 읽힌다', () => {
    const labels = texts(render());
    expect(labels).toContain('시간');
    for (const clock of ['16:10', '16:20', '17:00', '17:10', '18:10']) expect(labels).toContain(clock);
  });

  it('일정 칸 안에는 시간 문자열이 없고 제목·메모·아이콘만 있다', () => {
    const grid = render();
    const found = cells(grid);
    expect(found).toHaveLength(3);
    for (const cell of found) expect(texts(cell).join(' ')).not.toMatch(/\d{1,2}:\d{2}/);
    expect(texts(found[1]).join(' ')).toContain('피아노');
    expect(texts(found[1]).join(' ')).toContain('📝');
  });
});

describe('주간표 현재 시각 강조 (P10.2)', () => {
  const borderOf = (cell: ReactTestInstance) => flat(cell.props.style).borderWidth;
  const backgroundOf = (cell: ReactTestInstance) => flat(cell.props.style).backgroundColor;

  it('오늘 요일에서 진행 중인 일정만 원래 색과 테두리로 강조하고 나머지는 연하게 보인다', () => {
    const grid = render(17 * 60 + 30, 1); // 월요일 17:30 → 피아노만 진행 중
    const [english, piano, math] = cells(grid);
    expect(borderOf(piano)).toBe(2);
    expect(borderOf(english)).toBeUndefined();
    expect(backgroundOf(english)).not.toBe(backgroundOf(piano));
    expect(backgroundOf(math)).toBe(backgroundOf(english)); // 다른 요일은 같은 시각이어도 실제 진행이 아니므로 연한 색
  });

  it('진행 중인 일정이 없으면(일정 사이·종료 후) 아무것도 강조하지 않는다', () => {
    const grid = render(19 * 60, 1);
    for (const cell of cells(grid)) expect(borderOf(cell)).toBeUndefined();
  });

  it('오늘이 주말이거나 시각 정보가 없으면 오늘 강조가 없고, 시각 정보가 없을 때는 예전처럼 원래 색이다', () => {
    for (const cell of cells(render(17 * 60 + 30, 6))) expect(borderOf(cell)).toBeUndefined();
    const plain = cells(render(undefined));
    expect(new Set(plain.map(backgroundOf)).size).toBe(1);
  });
});
