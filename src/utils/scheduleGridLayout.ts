import type { GridCell, GridItem, GridRow } from './timetableGrid';

/**
 * 화면 높이 / 전체 시간으로 기본 분당 높이를 구한다.
 * 실제 일정 칸만 제목의 최소 높이를 보장한다(칸마다 다를 수 있어 함수로도 받는다). 다른 요일의 짧은 경계는 표를 늘리지 않는다.
 * 각 경계까지의 최장 경로로 최소 높이를 계산하므로 겹치는 일정도 같은 시간축을 공유한다.
 */
export function fitScheduleRows<T extends GridItem>(
  rows: readonly GridRow[], cells: readonly GridCell<T>[], availableDp: number | undefined,
  options: { readonly minCellHeight: number | ((cell: GridCell<T>) => number); readonly labelHeight: number; readonly dpPerMinute: number },
): readonly number[] {
  if (!rows.length) return [];
  const durations = rows.map((row) => row.endMin - row.startMin);
  const minutes = durations.reduce((sum, duration) => sum + duration, 0);
  const minFor = (cell: GridCell<T>) => typeof options.minCellHeight === 'function' ? options.minCellHeight(cell) : options.minCellHeight;
  const ending = rows.map((_, index) => cells.filter((cell) => cell.startRow + cell.rowSpan === index + 1));
  const positionsFor = (scale: number) => {
    const positions = [0];
    rows.forEach((_, index) => {
      positions.push(Math.max(positions[index] + durations[index] * scale,
        ...ending[index].map((cell) => positions[cell.startRow] + minFor(cell))));
    });
    return positions;
  };
  const minimum = positionsFor(0).at(-1)!;
  const available = availableDp != null && Number.isFinite(availableDp)
    ? Math.max(0, availableDp) : minutes * options.dpPerMinute;
  // 작은 화면·글자 확대에서도 글자를 지우지 않고 표 자체를 스크롤할 수 있게 한다.
  const target = Math.max(available, minimum, rows.length * options.labelHeight);
  let low = 0;
  let high = target / minutes;
  for (let step = 0; step < 45; step += 1) {
    const middle = (low + high) / 2;
    if (positionsFor(middle).at(-1)! <= target) low = middle;
    else high = middle;
  }
  const positions = positionsFor(low);
  return rows.map((_, index) => positions[index + 1] - positions[index]);
}

/** 이동 출발지와 목적지를 두 줄로 나눈다. 칸이 넓은 요일별 보기는 splitMove=false로 이동 이름을 한 줄로 둔다. */
export function gridItemTitle(title: string, splitMove = true): string {
  const moved = splitMove ? title.replace(/\s*(→|->)\s*/, '\n$1 ') : title;
  return moved.replace(/^(\d+교시) · /, '$1\n');
}

/** 이동 일정 글자는 이만큼 줄이고, 나머지는 줄마다 칸에 들어가는 만큼만 키운다(큰 것부터 시도, pt). */
export const MOVE_TITLE_SHRINK = 1.5;
export const TITLE_BOOSTS = [2, 1] as const;
/** 글자 폭 어림값이 실제보다 작을 수 있어 칸 폭의 95%까지만 쓴다 */
const WIDTH_SAFETY = 0.95;

/** 굵은 글꼴 기준 글자 폭 어림값(글자 크기 대비). 한글·화살표는 정사각에 가깝고 숫자·영문·공백은 좁다. */
function charWidth(char: string): number {
  if (/\s/.test(char)) return 0.3;
  if (/[0-9]/.test(char)) return 0.6;
  if (/[A-Za-z]/.test(char)) return 0.62;
  if (/[·.,:()~-]/.test(char)) return 0.4;
  return 1;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce((sum, char) => sum + charWidth(char), 0) * fontSize;
}

/**
 * 칸 제목 글자 크기를 정한다. 이동 일정은 조금 줄이고, 나머지는 키운 크기에서도
 * 줄마다 칸 폭에 들어가고(줄이 늘지 않고) 칸 높이도 넉넉할 때만 키운다.
 */
export function cellTitleFontSize(input: {
  readonly lines: readonly string[]; readonly move: boolean; readonly base: number;
  /** 띠·여백·테두리를 뺀 칸 안쪽 폭과 높이(dp) */
  readonly widthDp: number | undefined; readonly heightDp: number; readonly fontScale: number;
}): number {
  if (input.move) return input.base - MOVE_TITLE_SHRINK;
  const { widthDp } = input;
  if (widthDp == null) return input.base;
  const fits = (size: number) => {
    const scaled = size * input.fontScale;
    return input.lines.every((line) => estimateTextWidth(line, scaled) <= widthDp * WIDTH_SAFETY)
      && input.lines.length * Math.ceil(scaled * 1.2) <= input.heightDp;
  };
  const boost = TITLE_BOOSTS.find((step) => fits(input.base + step));
  return boost == null ? input.base : input.base + boost;
}
