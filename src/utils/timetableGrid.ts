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
 * 어떤 요일에도 일정이 없는 빈 구간은 행에서 뺀다(압축). 시간이 잘못된 일정은 unplaced로 돌려준다.
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
    if (perDay.some(({ spans }) => spans.some(({ start, end }) => start < row.endMin && end > row.startMin))) rows.push(row);
  }
  const cells = perDay.flatMap(({ day, spans }) => spans.map(({ item, start, end, lane, laneCount }) => {
    const startRow = rows.findIndex((row) => row.startMin >= start);
    const endRow = rows.reduce((last, row, index) => (row.endMin <= end ? index : last), startRow);
    return { item, day, startRow, rowSpan: endRow - startRow + 1, lane, laneCount };
  }));
  const unplaced = days.flatMap(({ day, items }) => items.filter((item) => !validSpan(item)).map((item) => ({ day, item })));
  return { rows, cells, unplaced };
}

/** 행 높이(dp): 시간에 비례하되 짧은 행은 최소, 긴 행(예: 5교시 수업)은 최대 높이로 제한한다. */
export function rowHeights(rows: readonly GridRow[], dpPerMinute: number, minHeight: number, maxHeight = Number.POSITIVE_INFINITY): readonly number[] {
  return rows.map(({ startMin, endMin }) => Math.min(maxHeight, Math.max(minHeight, Math.round((endMin - startMin) * dpPerMinute))));
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
 * 행 높이들을 합계가 availableDp가 되도록 비율을 유지한 채 늘리거나 줄인다(요일 확대 보기를 스크롤 없이 한 화면에 맞추려고 쓴다).
 * 가장 낮은 행이 minRowDp 밑으로 내려가야 하면 글자가 겹치므로 맞추지 않고 원래 높이를 돌려준다(그때는 화면이 스크롤된다).
 */
export function fitRowHeights(heights: readonly number[], availableDp: number, minRowDp: number): readonly number[] {
  const total = heights.reduce((sum, value) => sum + value, 0);
  if (heights.length === 0 || total <= 0 || !Number.isFinite(availableDp) || availableDp <= 0) return heights;
  const scale = availableDp / total;
  const scaled = heights.map((value) => value * scale);
  return Math.min(...scaled) < minRowDp ? heights : scaled;
}
