import type { TimetableCategory } from '../db/types';

export type RollingAlertMode = 'notify' | 'alarm';
export type RollingScheduleItem = {
  readonly id: number;
  readonly weekday: number;
  readonly startTime: string;
  readonly title: string;
  readonly category: TimetableCategory;
  readonly alertMode: 'none' | RollingAlertMode;
  readonly alertBeforeMin: number;
  readonly memo?: string;
};
/** type이 'holiday'(쉬는 날)이면 그날 모든 일정 알림을 건너뛰고, 그 밖의 예외(방학·재량)는 학교 일정 알림만 건너뛴다. */
export type DayException = { readonly startDate: string; readonly endDate: string; readonly type?: string };
export type RollingNotification = { readonly id: string; readonly itemId: number; readonly mode: RollingAlertMode; readonly title: string; readonly memo: string; readonly triggerAt: Date };

function dateKey(date: Date): string { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
function atTime(date: Date, time: string, leadMinutes: number): Date { const [hours, minutes] = time.split(':').map(Number); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes - leadMinutes); }
function isException(date: Date, exceptions: readonly DayException[], holidayOnly = false): boolean { const key = dateKey(date); return exceptions.some((exception) => exception.startDate <= key && key <= exception.endDate && (!holidayOnly || exception.type === 'holiday')); }

export function buildRollingNotifications(items: readonly RollingScheduleItem[], exceptions: readonly DayException[], now: Date, days = 7): readonly RollingNotification[] {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000); const maximumLead = Math.max(0, ...items.map((item) => item.alertBeforeMin)); const result: RollingNotification[] = [];
  for (let offset = 0; offset <= days + Math.ceil(maximumLead / (24 * 60)); offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    for (const item of items) {
      if (item.weekday !== date.getDay() || item.alertMode === 'none' || (item.category === 'school' && isException(date, exceptions)) || isException(date, exceptions, true)) continue;
      const triggerAt = atTime(date, item.startTime, item.alertBeforeMin);
      if (triggerAt >= now && triggerAt < windowEnd) result.push({ id: `${item.id}:${dateKey(date)}`, itemId: item.id, mode: item.alertMode, title: item.title, memo: item.memo ?? '', triggerAt });
    }
  }
  return result.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime() || left.itemId - right.itemId);
}
