import type { TimetableCategory } from '../db/types';

/** 일정 칸의 첫 줄에 쓰는 구분 이름 */
export const categoryText: Readonly<Record<TimetableCategory, string>> = { school: '학교', academy: '학원', care: '돌봄', life: '생활' };

export type CellLines = {
  /** 칸에 쓸 줄 수(1~3) */
  readonly lineCount: 1 | 2 | 3;
  /** 첫 줄: 구분. 줄이 1줄뿐이면 비어 있다(구분은 화면 읽기 라벨에만 남는다) */
  readonly first: string;
  /** 이름. 줄바꿈 없이 한 줄로 그린다(길면 글자를 줄여 맞추고, 그래도 길면 …로 자른다) */
  readonly title: string;
  /** 마지막 줄: 메모·알림 표시(과목 아이콘 글자는 뜻을 알기 어려워 넣지 않는다). 줄이 모자라면 비어 있고 첫 줄에 붙는다 */
  readonly extras: string;
};

/** 칸 높이(dp)와 글자 크기에 들어가는 줄 수. 위아래 여백 4dp를 빼고 줄 높이는 글자 크기의 1.3배로 본다. */
export function linesThatFit(heightDp: number, fontSize: number): 1 | 2 | 3 {
  const count = Math.floor((heightDp - 4) / (fontSize * 1.3));
  return count >= 3 ? 3 : count === 2 ? 2 : 1;
}

/**
 * 한 칸에 보일 글자를 줄별로 나눈다.
 * 3줄이면 구분 / 이름 / 기타, 2줄이면 구분(+기타 표시) / 이름, 1줄이면 이름만이다.
 * 이름은 어느 경우에도 한 줄이라 길어도 줄바꿈으로 칸을 넘치지 않는다.
 */
export function buildCellLines(input: {
  readonly category: TimetableCategory; readonly title: string;
  readonly hasMemo: boolean; readonly hasAlert: boolean; readonly heightDp: number; readonly fontSize: number;
}): CellLines {
  const lineCount = linesThatFit(input.heightDp, input.fontSize);
  const marks = [input.hasMemo ? '📝' : '', input.hasAlert ? '🔔' : ''].filter(Boolean);
  const label = categoryText[input.category];
  if (lineCount === 3) return { lineCount, first: label, title: input.title, extras: marks.join(' ') };
  if (lineCount === 2) return { lineCount, first: [label, ...marks].join(' '), title: input.title, extras: '' };
  return { lineCount, first: '', title: input.title, extras: '' };
}
