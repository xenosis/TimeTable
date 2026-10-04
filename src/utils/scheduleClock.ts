/** 시간표 화면이 "지금 진행 중"을 판단하는 공통 규칙. 요일별 목록과 주간표가 같은 경계 규칙을 쓴다. */
export type ScheduleStatus = 'past' | 'current' | 'upcoming' | 'unknown';

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:MM"을 하루 중 분으로 바꾼다. 형식이 틀리면 null. */
export function clockToMinutes(clock: string | null | undefined): number | null {
  const match = clock ? CLOCK.exec(clock) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/**
 * 시작 <= 현재 < 종료이면 진행 중이다. 종료 시각 정각에는 이미 지난 일정이고 시작 시각 정각에는 진행 중이다.
 * 시각이 없거나 틀렸거나 종료가 시작보다 빠르거나 같으면 강조 대상에서 제외하는 'unknown'이다.
 */
export function scheduleStatus(start: string | null | undefined, end: string | null | undefined, nowMinutes: number): ScheduleStatus {
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  if (from == null || to == null || to <= from) return 'unknown';
  if (nowMinutes < from) return 'upcoming';
  return nowMinutes < to ? 'current' : 'past';
}

/** 지금 시각을 "HH:MM"으로 */
export function formatNow(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 다음 분이 시작될 때까지 남은 시간(ms). 시작·종료 경계는 모두 정각 분이라 이 시점마다 다시 판단하면 된다. */
export function msUntilNextMinute(date: Date): number {
  return 60_000 - (date.getSeconds() * 1000 + date.getMilliseconds()) + 50;
}

/** 6자리 16진 색을 흰색과 섞어 연하게 만든다(amount 0=원래 색, 1=흰색). 형식이 틀리면 원래 값을 돌려준다. */
export function lightenColor(hex: string, amount: number): string {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const [red, green, blue] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(mix);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 지금 진행 중이 아닌 칸을 흐리게 보이게 하는 정도(0=그대로, 1=흰색). 배경은 과목색을 80%, 글자는 진한 글자색을 20% 연하게 한다.
 * 글자는 연하게 하되 읽을 수 있는 대비(4.5:1 이상)는 지킨다(__tests__/schedule-clock.test.ts에서 모든 테마·과목 색으로 확인).
 */
export const DIMMED_BACKGROUND_LIGHTEN = 0.8;
export const DIMMED_TEXT_LIGHTEN = 0.2;
