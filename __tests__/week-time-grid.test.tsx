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

describe('일정 칸 줄 나누기와 요일 확대 보기', () => {
  const titleNodes = (root: ReactTestInstance) => root.findAll((node) => (node.type as unknown) === 'Text' && node.props.adjustsFontSizeToFit === true);

  it('구분(학교·학원…)을 이름 위 줄에 따로 보여주고, 이름은 한 줄에 글자를 줄여 맞춘다', () => {
    const grid = render(undefined);
    const english = cells(grid)[0];
    const lines = texts(english);
    expect(lines).toContain('학원');
    expect(lines).toContain('영어 학원');
    expect(lines.indexOf('학원')).toBeLessThan(lines.indexOf('영어 학원'));
    const title = titleNodes(english)[0];
    expect(title.props.numberOfLines).toBe(1);
    expect(title.props.minimumFontScale).toBeLessThan(1);
  });

  it('한 요일 확대 보기: 그 요일 칼럼 하나만 크게 그리고(헤더 줄 없이) 왼쪽 시간 칼럼은 그대로 둔다', () => {
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<WeekTimeGrid theme={defaultTheme} days={[days[0]]} today={1} onSelectDay={() => undefined} nowMinutes={17 * 60 + 30} focus showHeader={false} />); });
    const labels = texts(tree.root);
    expect(labels).not.toContain('시간'); // 요일은 위의 요일 탭에서 고르므로 표 안에 '시간 | 월요일' 줄을 두지 않는다
    expect(labels).not.toContain('월요일');
    expect(labels).not.toContain('화');
    expect(cells(tree.root)).toHaveLength(2); // 월요일 일정 2개만
    for (const clock of ['16:10', '17:10', '18:10']) expect(labels).toContain(clock);
    for (const cell of cells(tree.root)) expect(texts(cell).join(' ')).not.toMatch(/\d{1,2}:\d{2}/);
    const [, piano] = cells(tree.root);
    expect(flat(piano.props.style).borderWidth).toBe(2); // 17:30 진행 중인 피아노만 강조
  });

  it('안내 문구 없이 요일 헤더가 누를 수 있는 버튼으로 보이고, 눌러서 그 요일로 이동한다', () => {
    const onSelectDay = jest.fn();
    let tree!: ReturnType<typeof create>;
    act(() => { tree = create(<WeekTimeGrid theme={defaultTheme} days={days} today={1} onSelectDay={onSelectDay} />); });
    expect(texts(tree.root).join(' ')).not.toContain('누르면');
    const headers = tree.root.findAll((node) => typeof node.props.onPress === 'function' && /요일 시간표로 이동/.test(node.props.accessibilityLabel ?? ''));
    const unique = headers.filter((node, index) => headers.findIndex((other) => other.props.accessibilityLabel === node.props.accessibilityLabel) === index);
    expect(unique.map((node) => node.props.accessibilityLabel)).toEqual(['월요일 시간표로 이동', '화요일 시간표로 이동', '수요일 시간표로 이동', '목요일 시간표로 이동', '금요일 시간표로 이동']);
    act(() => { unique[2].props.onPress(); });
    expect(onSelectDay).toHaveBeenCalledWith(3);
  });

  it('높이를 주면 행 높이를 맞춰 표 전체가 그 높이 안에 들어간다', () => {
    const bodyHeight = (fitHeight?: number) => {
      let tree!: ReturnType<typeof create>;
      act(() => { tree = create(<WeekTimeGrid theme={defaultTheme} days={[days[0]]} today={1} onSelectDay={() => undefined} focus fitHeight={fitHeight} />); });
      const body = tree.root.findAll((node) => typeof node.type === 'string' && flat(node.props.style).flexDirection === 'row' && typeof flat(node.props.style).height === 'number' && flat(node.props.style).position === 'relative');
      return flat(body[0].props.style).height as number;
    };
    expect(bodyHeight(800)).toBeCloseTo(800 - 44, 0); // 헤더 44dp를 뺀 나머지에 딱 맞는다
    expect(bodyHeight(undefined)).not.toBeCloseTo(756, 0);
  });

  it('실제 오늘이 아닌 요일을 미리 보여줄 때는 화면 읽기 라벨이 지금 진행 중이라고 하지 않는다', () => {
    const labelsOf = (preview: boolean) => {
      let tree!: ReturnType<typeof create>;
      act(() => { tree = create(<WeekTimeGrid theme={defaultTheme} days={[days[0]]} today={1} onSelectDay={() => undefined} nowMinutes={17 * 60 + 30} focus showHeader={false} preview={preview} />); });
      return cells(tree.root).map((cell) => cell.props.accessibilityLabel as string).join('|');
    };
    expect(labelsOf(false)).toContain('지금 진행 중');
    expect(labelsOf(true)).toContain('지금 시각과 같은 시간대');
    expect(labelsOf(true)).not.toContain('지금 진행 중');
  });
});
