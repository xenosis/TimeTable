import type { ColorKey, IconKey } from '../theme';

export const timetableCategories = ['school', 'academy', 'life'] as const;
export type TimetableCategory = (typeof timetableCategories)[number];

export const alertModes = ['none', 'notify', 'alarm'] as const;
export type AlertMode = (typeof alertModes)[number];

export const timetableModes = ['regular', 'vacation'] as const;
export type TimetableMode = (typeof timetableModes)[number];

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
  readonly timetableMode?: TimetableMode;
};

export type TimetableDatabase = {
  execAsync(source: string): Promise<void>;
  getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: unknown[]): Promise<T[]>;
  runAsync(source: string, ...params: unknown[]): Promise<unknown>;
};
