import { buildWeekGrid, cellRect, needsOwnTimeLabel, rowHeights, rowOffsets, type GridDay, type GridItem } from '../src/utils/timetableGrid';

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

  it('행 높이는 시간 비례에 최소·최대 제한을 둔다: 학기 시간표는 세로 520dp 이하', () => {
    const { rows } = buildWeekGrid(semester);
    expect(sum(rowHeights(rows, 1.2, 28))).toBe(756);
    const capped = rowHeights(rows, 1.2, 28, 64);
    expect(capped[0]).toBe(64);
    expect(sum(capped)).toBeLessThanOrEqual(520);
  });

  it('채택값(최소 36·최대 64dp): 학기 시간표 표 본문은 592dp로 세로 스크롤이 필요하다(헤더 제외)', () => {
    expect(sum(rowHeights(buildWeekGrid(semester).rows, 1.2, 36, 64))).toBe(592);
    expect(sum(rowHeights(buildWeekGrid(vacationWeek).rows, 1.2, 36, 64))).toBeLessThanOrEqual(400);
  });

  it('방학 특강 주(시간표2)는 6행이다', () => {
    expect(buildWeekGrid(vacationWeek).rows).toHaveLength(6);
  });

  it('모든 요일이 비는 구간은 행에서 빠지고 일정은 빈 행을 걸치지 않는다', () => {
    const { rows, cells } = buildWeekGrid([
      { day: 1, items: [item('앞', '09:00', '10:00')] },
      { day: 2, items: [item('뒤', '11:00', '12:00')] },
    ]);
    expect(rows).toEqual([{ startMin: 540, endMin: 600 }, { startMin: 660, endMin: 720 }]);
    expect(cells.map(({ startRow, rowSpan }) => [startRow, rowSpan])).toEqual([[0, 1], [1, 1]]);
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
    expect(rowOffsets(heights)).toEqual({ tops: [0, 30, 60, 90, 120].slice(0, rows.length), total: sum(heights) });
    const b = cells.find((cell) => cell.item.title === 'B')!;
    expect(cellRect(b, heights)).toMatchObject({ leftRatio: 0.5, widthRatio: 0.5 });
    const d = cells.find((cell) => cell.item.title === 'D')!;
    expect(cellRect(d, heights)).toEqual({ top: rowOffsets(heights).tops[d.startRow], height: 60, leftRatio: 0, widthRatio: 1 });
  });
});
