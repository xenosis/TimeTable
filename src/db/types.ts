import type { ColorKey, IconKey } from '../theme';

/** 일정 종류: 학교(정규 수업), 학원, 돌봄(방과후 돌봄·방학 돌봄), 생활. 위젯은 학교만 빼고 보여준다. */
export const timetableCategories = ['school', 'academy', 'care', 'life'] as const;
export type TimetableCategory = (typeof timetableCategories)[number];

export const alertModes = ['none', 'notify', 'alarm'] as const;
export type AlertMode = (typeof alertModes)[number];

/** 시간표 세트(예: 1학기·방학)의 ID. 항목은 정확히 하나의 세트에 속한다. */
export type TimetableSetId = number;

export type TimetableSet = { readonly id: TimetableSetId; readonly name: string };

export type TimetableItemInput = {
  readonly familyId?: string;
  readonly weekday: number;
  readonly periodNo?: number | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly title: string;
  readonly category: TimetableCategory;
  readonly colorKey: ColorKey;
  readonly iconKey: IconKey;
  readonly alertMode?: AlertMode;
  readonly alertBeforeMin?: number;
  readonly setId: TimetableSetId;
};

export type TimetableDatabase = {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  runAsync(source: string, ...params: unknown[]): Promise<unknown>;
};
