import { buildWeekGrid, cellRect, needsOwnTimeLabel, rowHeights, rowOffsets, timeAxisConnector, timeAxisLabels, type GridDay, type GridItem } from '../src/utils/timetableGrid';

let nextId = 1;
const item = (title: string, startTime: string, endTime: string): GridItem => ({ id: nextId++, title, startTime, endTime });

/**
 * 시간표1.png(학기 중) 내용. 5교시 수업은 하나의 일정으로 합쳐 표현한다.
 * 이미지에 시각이 적히지 않은 값은 칸 위치로 읽은 추정이다: 수 수업 종료 13:10(다음 일정 시작에서 추론),
 * 수·금 해법수학 등. 수요일 수업이 13:00에 끝나면 경계가 하나 늘어 15행이 된다.
 */
const semester: readonly GridDay[] = [
  { day: 1, items: [item('수업', '09:00', '13:50'), item('생명융합과학', '13:50', '15:10'), item('돌봄', '15:10', '15:50'), item('해법수학', '16:10', '17:10'), item('피아노', '17:10', '18:10')] },
  { day: 2, items: [item('수업', '09:00', '13:50'), item('리틀 포레스트', '14:10', '16:20'), item('일루스터', '17:00', '18:00')] },
  { day: 3, items: [item('수업', '09:00', '13:10'), item('주산암산 A', '13:10', '14:30'), item('돌봄', '14:30', '14:50'), item('미술', '15:10', '16:10'), item('해법수학', '16:10', '17:10'), item('피아노', '17:10', '18:10')] },
  { day: 4, items: [item('수업', '09:00', '13:50'), item('리틀 포레스트', '14:10', '16:20'), item('일루스터', '17:00', '18:00')] },
  { day: 5, items: [item('수업', '09:00', '13:50'), item('돌봄', '13:50', '14:45'), item('해법수학', '15:10', '15:50'), item('미술', '16:10', '17:10'), item('피아노', '17:10', '18:10')] },
];

/** 시간표2.png(7/27~31 방학 특강 주) 내용. 칸 경계는 이미지에서 읽은 근사값이다(수·금 돌봄은 글자 위치로 보아 16:10까지). */
const vacationWeek: readonly GridDay[] = [
  { day: 1, items: [item('생명융합과학A', '09:00', '10:20'), item('돌봄', '10:20', '15:00'), item('해법수학', '15:10', '16:10'), item('피아노', '16:10', '17:00')] },
  { day: 2, items: [item('돌봄', '09:00', '12:50'), item('리틀 포레스트', '12:50', '15:00'), item('피아노', '15:10', '16:10'), item('미술', '16:10', '17:00')] },
  { day: 3, items: [item('주산암산A', '09:00', '10:20'), item('돌봄', '10:20', '16:10'), item('피아노', '16:10', '17:00')] },
  { day: 4, items: [item('돌봄', '09:00', '16:10'), item('피아노', '16:10', '17:00')] },
  { day: 5, items: [item('요리교실', '09:00', '10:20'), item('돌봄', '10:20', '16:10'), item('피아노', '16:10', '17:00')] },
];

describe('buildWeekGrid', () => {
  const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

  it('학기 시간표(시간표1): 경계를 합쳐 14행이 되고 모든 일정이 칸으로 배치된다', () => {
    const { rows, cells } = buildWeekGrid(semester);
    expect(rows).toHaveLength(14);
    expect(cells).toHaveLength(semester.reduce((count, { items }) => count + items.length, 0));
    // 요일마다 시각이 5~10분씩 어긋나(14:45/14:50, 16:10/16:20, 17:00/17:10, 18:00/18:10) 10분 이하 얇은 행이 4개 생긴다
    expect(rows.filter(({ startMin, endMin }) => endMin - startMin <= 10)).toHaveLength(4);
    const school = cells.find((cell) => cell.day === 1 && cell.item.title === '수업');
    expect([school?.startRow, school?.rowSpan]).toEqual([0, 2]); // 수요일 수업이 13:10에 끝나 13:10 경계가 생기므로 월요일 수업은 2개 행에 걸친다
    const forest = cells.find((cell) => cell.day === 2 && cell.item.title === '리틀 포레스트');
    expect(forest?.rowSpan).toBeGreaterThan(1);
  });

  it.each([[semester], [vacationWeek]])('짧은 경계와 긴 수업이 섞여도 표 전체가 같은 분당 높이를 쓴다', (days) => {
    const { rows, cells } = buildWeekGrid(days);
    const heights = rowHeights(rows, 1.5, 14);
    const scale = heights[0] / (rows[0].endMin - rows[0].startMin);
    rows.forEach((row, i) => expect(heights[i]).toBeCloseTo((row.endMin - row.startMin) * scale));
    cells.forEach((cell) => {
      const duration = cell.item.endTime.split(':').map(Number).reduce((h, m) => h * 60 + m)
        - cell.item.startTime.split(':').map(Number).reduce((h, m) => h * 60 + m);
      expect(cellRect(cell, heights).height).toBeCloseTo(duration * scale);
    });
  });

  it('방학 특강 주(시간표2)는 6행이다', () => {
    expect(buildWeekGrid(vacationWeek).rows).toHaveLength(6);
  });

  it('다른 요일 경계가 30분 칸을 나누어도 40분 칸과의 높이 비율은 4:3이다', () => {
    const grid = buildWeekGrid([
      { day: 1, items: [item('40분', '14:00', '14:40')] },
      { day: 2, items: [item('30분', '14:40', '15:10')] },
      { day: 3, items: [item('다른 경계', '14:50', '15:10')] },
    ]);
    const heights = rowHeights(grid.rows, 1.5, 14);
    const first = cellRect(grid.cells.find((cell) => cell.item.title === '40분')!, heights);
    const second = cellRect(grid.cells.find((cell) => cell.item.title === '30분')!, heights);
    expect(first.height / second.height).toBeCloseTo(4 / 3);
  });

  it('5분 경계가 있어도 80분 일정은 64dp이며 모든 시각은 겹치지 않고 축에 남는다', () => {
    const grid = buildWeekGrid([
      { day: 1, items: [item('생명융합과학', '13:50', '15:10')] },
      { day: 2, items: [item('다른 수업', '14:45', '15:30')] },
      { day: 3, items: [item('다른 요일 수업', '14:50', '15:40')] },
    ]);
    const heights = rowHeights(grid.rows, 0.8, 14);
    expect(cellRect(grid.cells[0], heights).height).toBeCloseTo(64);
    const labels = timeAxisLabels(grid.rows, heights, 14);
    expect(labels.map(({ minutes }) => minutes)).toEqual([830, 885, 890, 910, 930, 940]);
    labels.forEach((label, index) => {
      expect(label.top).toBeGreaterThanOrEqual(0);
      if (index) expect(label.top - labels[index - 1].top).toBeGreaterThanOrEqual(14);
    });
    expect(labels[1].anchor).toBeCloseTo(44);
    expect(labels[2].anchor).toBeCloseTo(48);
    expect(labels.at(-1)?.top).toBeCloseTo(88);
    const connectors = labels.map(({ top, anchor }) => timeAxisConnector(top, anchor, 14, 36, 46));
    connectors.forEach((connector, index) => {
      const radians = connector.angle * Math.PI / 180;
      expect(connector.width * Math.cos(radians)).toBeCloseTo(10);
      expect(connector.width * Math.sin(radians)).toBeCloseTo(connector.toY - connector.fromY);
      if (index) {
        // 양 끝의 순서가 같은 직선은 교차하거나 합쳐지지 않는다.
        expect(connector.fromY).toBeGreaterThan(connectors[index - 1].fromY);
        expect(connector.toY).toBeGreaterThan(connectors[index - 1].toY);
      }
    });
  });

  it('모든 요일이 비는 구간도 시간축에 남겨 일정 사이 간격을 유지한다', () => {
    const { rows, cells } = buildWeekGrid([
      { day: 1, items: [item('앞', '09:00', '10:00')] },
      { day: 2, items: [item('뒤', '11:00', '12:00')] },
    ]);
    expect(rows).toEqual([{ startMin: 540, endMin: 600 }, { startMin: 600, endMin: 660 }, { startMin: 660, endMin: 720 }]);
    expect(cells.map(({ startRow, rowSpan }) => [startRow, rowSpan])).toEqual([[0, 1], [2, 1]]);
  });

  it('겹치는 일정은 나란히 놓고 잘못된 시간은 표 밖에 따로 남긴다', () => {
    const grid = buildWeekGrid([{ day: 1, items: [item('A', '10:00', '11:00'), item('B', '10:30', '11:30'), item('C', '12:00', '12:00'), item('E', '', ''), item('D', '13:00', '14:00')] }]);
    const byTitle = Object.fromEntries(grid.cells.map((cell) => [cell.item.title, cell]));
    expect(byTitle.C).toBeUndefined();
    expect(grid.unplaced.map(({ day, item: unplaced }) => [day, unplaced.title])).toEqual([[1, 'C'], [1, 'E']]); // 길이 0·빈 시각 일정은 숨기지 않고 표 밖에 남긴다
    expect([byTitle.A.lane, byTitle.B.lane]).toEqual([0, 1]);
    expect([byTitle.A.laneCount, byTitle.B.laneCount, byTitle.D.laneCount]).toEqual([2, 2, 1]);
    expect(needsOwnTimeLabel(byTitle.D, grid.rows)).toBe(false);
  });

  it('칸의 세로 위치·높이와 겹침 칸의 가로 비율을 계산한다', () => {
    const { rows, cells } = buildWeekGrid([{ day: 1, items: [item('A', '10:00', '11:00'), item('B', '10:30', '11:30'), item('D', '13:00', '14:00')] }]);
    const heights = rowHeights(rows, 1, 30);
    expect(rowOffsets(heights)).toEqual({ tops: [0, 30, 60, 90, 180], total: sum(heights) });
    const b = cells.find((cell) => cell.item.title === 'B')!;
    expect(cellRect(b, heights)).toMatchObject({ leftRatio: 0.5, widthRatio: 0.5 });
    const d = cells.find((cell) => cell.item.title === 'D')!;
    expect(cellRect(d, heights)).toEqual({ top: rowOffsets(heights).tops[d.startRow], height: 60, leftRatio: 0, widthRatio: 1 });
  });
});
