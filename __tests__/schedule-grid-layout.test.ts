import { buildWeekGrid, cellRect, rowOffsets } from '../src/utils/timetableGrid';
import { cellTitleFontSize, fitScheduleRows, gridItemTitle, MOVE_TITLE_SHRINK } from '../src/utils/scheduleGridLayout';

const item = (id: number, startTime: string, endTime: string) => ({ id, title: '일정', startTime, endTime });
const options = { minCellHeight: 38, labelHeight: 14, dpPerMinute: 0.8 };
const sum = (values: readonly number[]) => values.reduce((total, n) => total + n, 0);

it('마지막 종료까지 남은 화면을 채우며 최소 높이에 걸리지 않으면 40분과 30분은 4:3이다', () => {
  const grid = buildWeekGrid([{ day: 1, items: [item(1, '14:00', '14:40'), item(2, '14:40', '15:10')] }]);
  for (const viewport of [250, 500]) {
    const heights = fitScheduleRows(grid.rows, grid.cells, viewport, options);
    expect(sum(heights)).toBeCloseTo(viewport);
    expect(heights[0] / heights[1]).toBeCloseTo(4 / 3);
  }
});

it('10분 이동도 두 줄 높이를 확보하며 오후 250분 전체는 화면 안에 둔다', () => {
  const grid = buildWeekGrid([
    { day: 1, items: [item(1, '13:00', '13:40'), item(2, '13:50', '14:00'), item(3, '14:10', '15:50'), item(4, '16:00', '16:10'), item(5, '16:10', '17:10')] },
    { day: 2, items: [item(6, '13:00', '13:40'), item(7, '13:50', '15:10'), item(8, '15:10', '15:50'), item(9, '16:00', '17:00')] },
    { day: 5, items: [item(10, '14:10', '14:50'), item(11, '14:50', '15:10'), item(12, '15:10', '16:10'), item(13, '16:10', '17:10')] },
  ]);
  const heights = fitScheduleRows(grid.rows, grid.cells, 460, options);
  expect(rowOffsets(heights).total).toBeCloseTo(460);
  for (const cell of grid.cells) expect(cellRect(cell, heights).height).toBeGreaterThanOrEqual(38 - 1e-8);
  const sameTime = grid.cells.filter((cell) => cell.item.startTime === '16:10');
  expect(cellRect(sameTime[0], heights).top).toBe(cellRect(sameTime[1], heights).top);
});

it('다른 요일의 5분 경계만으로 표 전체를 늘리지 않는다', () => {
  const grid = buildWeekGrid([{ day: 1, items: [item(1, '13:00', '14:20')] }, { day: 2, items: [item(2, '13:05', '14:00')] }]);
  const heights = fitScheduleRows(grid.rows, grid.cells, 300, options);
  expect(sum(heights)).toBeCloseTo(300);
  expect(heights[0] / heights[1]).toBeCloseTo(5 / 55);
});

it('작은 가로 화면에서도 제목을 숨기지 않고 필요한 높이만 표 스크롤로 남긴다', () => {
  const grid = buildWeekGrid([{ day: 1, items: [item(1, '14:00', '14:05'), item(2, '14:05', '14:10'), item(3, '14:10', '14:15')] }]);
  const heights = fitScheduleRows(grid.rows, grid.cells, 50, options);
  expect(sum(heights)).toBeCloseTo(114);
  for (const height of heights) expect(height).toBeCloseTo(38);
  expect(fitScheduleRows([], [], 400, options)).toEqual([]);
});

it('이동 경로와 5교시 이름을 두 줄로 읽는다', () => {
  expect(gridItemTitle('일루스터 → 지니리')).toBe('일루스터\n→ 지니리');
  expect(gridItemTitle('5교시 · 수학')).toBe('5교시\n수학');
});

it('요일별 보기에서는 이동 이름을 한 줄로 두고 교시 이름만 나눈다', () => {
  expect(gridItemTitle('일루스터 → 지니리', false)).toBe('일루스터 → 지니리');
  expect(gridItemTitle('5교시 · 수학', false)).toBe('5교시\n수학');
});

it('칸마다 최소 높이를 다르게 줄 수 있다(짧은 이동 칸은 낮게)', () => {
  const grid = buildWeekGrid([{ day: 1, items: [item(1, '14:00', '14:05'), { id: 2, title: '돌봄 → 일루스터', startTime: '14:05', endTime: '14:10' }] }]);
  const heights = fitScheduleRows(grid.rows, grid.cells, 10, { ...options, minCellHeight: (cell) => (cell.item.title.includes('→') ? 20 : 38) });
  expect(heights[0]).toBeCloseTo(38);
  expect(heights[1]).toBeCloseTo(20);
});

describe('칸 제목 글자 크기', () => {
  const base = { base: 12, fontScale: 1, heightDp: 60 };
  it('이동 일정은 조금 줄인다', () => {
    expect(cellTitleFontSize({ ...base, lines: ['돌봄', '→ 일루스터'], move: true, widthDp: 200 })).toBe(12 - MOVE_TITLE_SHRINK);
  });
  it('줄마다 칸 폭(95%)과 높이에 들어가는 만큼 2pt, 안 되면 1pt 키운다', () => {
    expect(cellTitleFontSize({ ...base, lines: ['과학실험'], move: false, widthDp: 60 })).toBe(14);
    expect(cellTitleFontSize({ ...base, lines: ['5교시', '수학'], move: false, widthDp: 60 })).toBe(14);
    expect(cellTitleFontSize({ ...base, lines: ['과학실험'], move: false, widthDp: 56 })).toBe(13);
  });
  it('키우면 줄이 넘어가거나 칸이 모자라면 그대로 둔다', () => {
    expect(cellTitleFontSize({ ...base, lines: ['자율·자치활동'], move: false, widthDp: 60 })).toBe(12);
    expect(cellTitleFontSize({ ...base, lines: ['과학실험'], move: false, widthDp: 50 })).toBe(12);
    expect(cellTitleFontSize({ ...base, lines: ['과학실험'], move: false, widthDp: 60, heightDp: 15 })).toBe(12);
    expect(cellTitleFontSize({ ...base, lines: ['과학실험'], move: false, widthDp: undefined })).toBe(12);
  });
});

it('주간 표에서는 -> 표기 이동도 두 줄로 나눈다', () => {
  expect(gridItemTitle('교실->돌봄')).toBe('교실\n-> 돌봄');
});
