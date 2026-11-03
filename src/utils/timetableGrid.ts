/** 주간 시간표를 "첫 칼럼=시간" 표로 그리기 위한 행 경계·칸 병합 계산. */

export type GridItem = { readonly id: number; readonly title: string; readonly startTime: string; readonly endTime: string };
export type GridDay<T extends GridItem = GridItem> = { readonly day: number; readonly items: readonly T[] };
export type GridRow = { readonly startMin: number; readonly endMin: number };

export type GridCell<T extends GridItem = GridItem> = {
  readonly item: T;
  readonly day: number;
  /** 이 칸이 시작하는 행 인덱스와 걸쳐 있는 행 수 */
  readonly startRow: number;
  readonly rowSpan: number;
  /** 같은 요일에서 시간이 겹칠 때 나란히 놓기 위한 칸 번호와 총 칸 수 */
  readonly lane: number;
  readonly laneCount: number;
};

export type WeekGrid<T extends GridItem = GridItem> = {
  readonly rows: readonly GridRow[];
  readonly cells: readonly GridCell<T>[];
  /** 시간이 없거나 잘못돼 표에 놓을 수 없는 일정. 숨기지 않고 표 밖에 따로 보여준다. */
  readonly unplaced: readonly { readonly day: number; readonly item: T }[];
};

export function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

export function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function validSpan(item: GridItem): { readonly start: number; readonly end: number } | null {
  if (typeof item.startTime !== 'string' || typeof item.endTime !== 'string') return null;
  const start = toMinutes(item.startTime);
  const end = toMinutes(item.endTime);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

/** 같은 요일 안에서 겹치는 일정에 칸 번호를 매긴다(겹침이 이어지는 묶음마다 laneCount 계산). */
function assignLanes<T extends GridItem>(spans: readonly { readonly item: T; readonly start: number; readonly end: number }[]) {
  const sorted = [...spans].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: { readonly item: T; readonly start: number; readonly end: number; lane: number; laneCount: number }[] = [];
  let group: typeof result = [];
  let groupEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => { group.forEach((entry) => { entry.laneCount = laneEnds.length; }); result.push(...group); group = []; laneEnds = []; };
  for (const span of sorted) {
    if (group.length && span.start >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= span.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(span.end); } else laneEnds[lane] = span.end;
    group.push({ ...span, lane, laneCount: 1 });
    groupEnd = Math.max(groupEnd, span.end);
  }
  flush();
  return result;
}

/**
 * 한 주의 모든 시작·종료 시각을 합쳐 행 경계로 삼는다.
 * 빈 시간도 유지해 같은 표 전체가 하나의 연속적인 시간축을 쓴다. 잘못된 시각은 unplaced로 돌려준다.
 */
export function buildWeekGrid<T extends GridItem>(days: readonly GridDay<T>[]): WeekGrid<T> {
  const perDay = days.map(({ day, items }) => ({
    day,
    spans: assignLanes(items.flatMap((item) => { const span = validSpan(item); return span ? [{ item, ...span }] : []; })),
  }));
  const boundaries = [...new Set(perDay.flatMap(({ spans }) => spans.flatMap(({ start, end }) => [start, end])))].sort((a, b) => a - b);
  const rows: GridRow[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const row = { startMin: boundaries[index], endMin: boundaries[index + 1] };
    rows.push(row);
  }
  const cells = perDay.flatMap(({ day, spans }) => spans.map(({ item, start, end, lane, laneCount }) => {
    const startRow = rows.findIndex((row) => row.startMin >= start);
    const endRow = rows.reduce((last, row, index) => (row.endMin <= end ? index : last), startRow);
    return { item, day, startRow, rowSpan: endRow - startRow + 1, lane, laneCount };
  }));
  const unplaced = days.flatMap(({ day, items }) => items.filter((item) => !validSpan(item)).map((item) => ({ day, item })));
  return { rows, cells, unplaced };
}

/** 전체 축 라벨이 들어갈 높이만 확보한다. 1~5분 경계 하나 때문에 표 전체를 확대하지 않는다. */
export function rowHeights(rows: readonly GridRow[], dpPerMinute: number, labelHeight = 0): readonly number[] {
  if (!rows.length) return [];
  const durations = rows.map(({ startMin, endMin }) => endMin - startMin);
  const totalMinutes = durations.reduce((sum, minutes) => sum + minutes, 0);
  const scale = Math.max(dpPerMinute, rows.length * labelHeight / totalMinutes);
  return durations.map((minutes) => minutes * scale);
}

/** 실제 경계의 눈금은 고정하고, 가까운 시각의 글자만 위아래로 옮겨 겹침을 피한다. */
export function timeAxisLabels(rows: readonly GridRow[], heights: readonly number[], labelHeight: number) {
  if (!rows.length) return [];
  const { tops, total } = rowOffsets(heights);
  const points = [...rows.map((row, index) => ({ minutes: row.startMin, anchor: tops[index] })), { minutes: rows[rows.length - 1].endMin, anchor: total }];
  const positions: number[] = [];
  points.forEach(({ anchor }, index) => { positions.push(Math.max(anchor, index ? positions[index - 1] + labelHeight : 0)); });
  positions[positions.length - 1] = total;
  for (let index = positions.length - 2; index >= 0; index -= 1) positions[index] = Math.min(positions[index], positions[index + 1] - labelHeight);
  return points.map((point, index) => ({ ...point, top: positions[index] }));
}

/** 라벨 중심과 실제 눈금을 잇는 사선. 두 끝의 순서가 유지되므로 인접 연결선끼리 합쳐지지 않는다. */
export function timeAxisConnector(labelTop: number, anchor: number, labelHeight: number, fromX: number, toX: number) {
  const fromY = labelTop + labelHeight / 2;
  const dx = toX - fromX;
  const dy = anchor - fromY;
  const width = Math.hypot(dx, dy);
  return { left: (fromX + toX - width) / 2, top: (fromY + anchor) / 2, width, angle: Math.atan2(dy, dx) * 180 / Math.PI, fromY, toY: anchor };
}

/** 칸이 자기 시작·종료 시각을 직접 적어야 하는지(행 경계와 시각이 어긋나는지). */
export function needsOwnTimeLabel<T extends GridItem>(cell: GridCell<T>, rows: readonly GridRow[]): boolean {
  const first = rows[cell.startRow];
  const last = rows[cell.startRow + cell.rowSpan - 1];
  return !first || !last || first.startMin !== toMinutes(cell.item.startTime) || last.endMin !== toMinutes(cell.item.endTime) || cell.rowSpan > 1;
}

/** 행 높이 배열에서 각 행이 시작하는 세로 위치(dp)와 전체 높이를 구한다. */
export function rowOffsets(heights: readonly number[]): { readonly tops: readonly number[]; readonly total: number } {
  const tops: number[] = [];
  let total = 0;
  heights.forEach((height) => { tops.push(total); total += height; });
  return { tops, total };
}

/** 칸의 세로 위치·높이와 겹침 칸의 가로 위치·폭 비율. */
export function cellRect<T extends GridItem>(cell: GridCell<T>, heights: readonly number[]) {
  const { tops } = rowOffsets(heights);
  const height = heights.slice(cell.startRow, cell.startRow + cell.rowSpan).reduce((total, value) => total + value, 0);
  return { top: tops[cell.startRow] ?? 0, height, leftRatio: cell.lane / cell.laneCount, widthRatio: 1 / cell.laneCount };
}

/**
 * 사용 가능한 높이보다 클 때만 비례 축소한다. 일정이 적다고 빈 화면을 채우도록 늘리지 않는다.
 * 축 라벨 전체를 넣을 공간이 부족하면 자연 높이를 유지하고 스크롤한다.
 */
export function fitRowHeights(heights: readonly number[], availableDp: number, minRowDp: number): readonly number[] {
  const total = heights.reduce((sum, value) => sum + value, 0);
  if (heights.length === 0 || total <= 0 || !Number.isFinite(availableDp) || availableDp <= 0) return heights;
  const scale = Math.min(1, availableDp / total);
  const scaled = heights.map((value) => value * scale);
  return availableDp < heights.length * minRowDp ? heights : scaled;
}
