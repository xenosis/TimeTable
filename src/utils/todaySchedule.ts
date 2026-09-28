import type { TimetableItem } from '../db/timetableRepository';

export type TodaySchedule = {
  readonly current: TimetableItem | null;
  readonly next: TimetableItem | null;
  readonly minutesUntilNext: number | null;
};

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function getTodaySchedule(items: readonly TimetableItem[], now: Date): TodaySchedule {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const ordered = [...items].sort((left, right) => left.startTime.localeCompare(right.startTime));
  const current = ordered.find((item) => toMinutes(item.startTime) <= nowMinutes && nowMinutes < toMinutes(item.endTime)) ?? null;
  const next = ordered.find((item) => toMinutes(item.startTime) > nowMinutes) ?? null;
  return { current, next, minutesUntilNext: next ? toMinutes(next.startTime) - nowMinutes : null };
}
