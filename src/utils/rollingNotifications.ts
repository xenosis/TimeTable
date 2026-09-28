export type RollingAlertMode = 'notify' | 'alarm';
export type RollingScheduleItem = {
  readonly id: number;
  readonly weekday: number;
  readonly startTime: string;
  readonly title: string;
  readonly category: 'school' | 'academy' | 'life';
  readonly alertMode: 'none' | RollingAlertMode;
  readonly alertBeforeMin: number;
};
export type DayException = { readonly startDate: string; readonly endDate: string };
export type RollingNotification = { readonly id: string; readonly itemId: number; readonly mode: RollingAlertMode; readonly title: string; readonly triggerAt: Date };

function dateKey(date: Date): string { return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'); }
function atTime(date: Date, time: string, leadMinutes: number): Date { const [hours, minutes] = time.split(':').map(Number); return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes - leadMinutes); }
function isException(date: Date, exceptions: readonly DayException[]): boolean { const key = dateKey(date); return exceptions.some((exception) => exception.startDate <= key && key <= exception.endDate); }

export function buildRollingNotifications(items: readonly RollingScheduleItem[], exceptions: readonly DayException[], now: Date, days = 7): readonly RollingNotification[] {
  if (!Number.isInteger(days) || days < 1) throw new Error('days must be a positive integer');
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000); const maximumLead = Math.max(0, ...items.map((item) => item.alertBeforeMin)); const result: RollingNotification[] = [];
  for (let offset = 0; offset <= days + Math.ceil(maximumLead / (24 * 60)); offset += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    for (const item of items) {
      if (item.weekday !== date.getDay() || item.alertMode === 'none' || (item.category === 'school' && isException(date, exceptions))) continue;
      const triggerAt = atTime(date, item.startTime, item.alertBeforeMin);
      if (triggerAt >= now && triggerAt < windowEnd) result.push({ id: `${item.id}:${dateKey(date)}`, itemId: item.id, mode: item.alertMode, title: item.title, triggerAt });
    }
  }
  return result.sort((left, right) => left.triggerAt.getTime() - right.triggerAt.getTime() || left.itemId - right.itemId);
}
