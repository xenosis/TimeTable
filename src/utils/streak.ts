function previous(date: string): string { const [year, month, day] = date.split('-').map(Number); const value = new Date(year, month - 1, day - 1); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
/** Today not being done yet must not show "0일 연속" when yesterday still extends a real streak. */
export function completedDayStreak(dates: readonly string[], today: string): number {
  const completed = new Set(dates);
  const start = completed.has(today) ? today : previous(today);
  let count = 0;
  for (let date = start; completed.has(date); date = previous(date)) count += 1;
  return count;
}
