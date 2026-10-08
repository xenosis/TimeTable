import Storage from 'expo-sqlite/kv-store';

import { getDatabase } from '../db/database';
import { getPeriods } from '../db/periodRepository';
import { getEditableTimetableItems } from '../db/timetableRepository';
import { getActiveTimetableSet } from '../db/timetableSetRepository';
import { refreshAllRollingOwners } from '../notifications/rollingOwners';
import { getAccount } from '../store/accountStore';
import { runAdminEdit } from '../sync/adminEditGate';
import { hasSyncedFamily } from '../sync/syncMarkers';
import { userErrorMessage } from '../utils/userErrorMessage';
import { notifyWidgetChecksApplied } from '../widgets/widgetChecksSignal';
import { fetchClassTimetable } from './neisClient';
import { buildWeekPlan, missingPeriods, replaceSchoolItems, schoolWeekDates, type WeekdayPlan } from './neisImport';
import { loadSchoolProfile } from './schoolProfile';

/**
 * 학교 시간표 자동 갱신(P8.7). 저장해 둔 학교·학년·반으로 이번 주(주말에는 다음 주) 나이스 시간표를 확인해,
 * 지금 저장된 학교 일정과 다르면 '학교' 일정만 바꾼다(학원·돌봄 일정은 그대로). 매주 사람이 가져오기를 누르지 않아도 된다.
 * 딸 폰(딸 계정·로컬 모드)에서만 돌고, 같은 주는 정해진 간격(6시간)보다 자주 묻지 않는다.
 */
export type AutoRefreshResult = 'updated' | 'same' | 'empty' | 'missing-periods' | 'error';
export type AutoRefreshState = { readonly checkedAt: string; readonly week: string; readonly result: AutoRefreshResult; readonly message: string };

export const AUTO_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STATE_KEY = 'timetable.school-auto-refresh';
const WEEKDAYS = [1, 2, 3, 4, 5];

export async function loadAutoRefreshState(): Promise<AutoRefreshState | null> {
  try {
    const value = JSON.parse(await Storage.getItemAsync(STATE_KEY) ?? 'null') as AutoRefreshState | null;
    return value && typeof value.checkedAt === 'string' && typeof value.week === 'string' ? value : null;
  } catch {
    return null;
  }
}

/** 이 기기가 자동 갱신을 해도 되는가: 아빠 폰은 하지 않고, 딸 계정은 서버와 한 번 맞춘 뒤에만 한다(서버에 먼저 저장해야 하므로). */
export function canAutoRefresh(): boolean {
  const account = getAccount();
  if (account.kind === 'checking') return false;
  if (account.kind === 'local') return true;
  const membership = account.membership;
  return membership?.role === 'child' && hasSyncedFamily(membership.familyId);
}

/** 요일별 교시·과목으로 비교용 문자열을 만든다(같은 내용이면 다시 쓰지 않는다). */
export function scheduleSignature(days: readonly { readonly weekday: number; readonly entries: readonly { readonly period: number; readonly subject: string }[] }[]): string {
  return WEEKDAYS.map((weekday) => {
    const entries = days.find((day) => day.weekday === weekday)?.entries ?? [];
    return `${weekday}:${[...entries].sort((a, b) => a.period - b.period).map((entry) => `${entry.period}=${entry.subject}`).join(',')}`;
  }).join('|');
}

/** 자동 갱신으로 쓸 계획: 그 주에 수업이 있는데 빈 요일(공휴일)은 학교 일정이 없는 날로 본다. */
export function effectivePlan(plan: readonly WeekdayPlan[]): readonly WeekdayPlan[] {
  return plan.some((day) => day.entries.length > 0) ? plan : [];
}

let inFlight: Promise<AutoRefreshState | null> | null = null;

/** 간격이 지났으면(또는 force) 확인하고 필요할 때만 바꾼다. 실패해도 예외를 던지지 않고 상태로 남긴다. */
export function refreshSchoolTimetableIfDue(now = new Date(), force = false): Promise<AutoRefreshState | null> {
  if (inFlight) return inFlight;
  inFlight = run(now, force).finally(() => { inFlight = null; });
  return inFlight;
}

async function run(now: Date, force: boolean): Promise<AutoRefreshState | null> {
  if (!canAutoRefresh()) return null;
  const profile = await loadSchoolProfile().catch(() => null);
  if (!profile) return null;
  const dates = schoolWeekDates(now, false);
  const week = dates[0];
  const previous = await loadAutoRefreshState();
  if (!force && previous && previous.week === week && now.getTime() - Date.parse(previous.checkedAt) < AUTO_REFRESH_INTERVAL_MS) return previous;

  const save = async (result: AutoRefreshResult, message: string) => {
    const state = { checkedAt: now.toISOString(), week, result, message };
    await Storage.setItemAsync(STATE_KEY, JSON.stringify(state)).catch(() => undefined);
    return state;
  };
  try {
    const plan = effectivePlan(buildWeekPlan(await fetchClassTimetable(profile, profile.grade, profile.classNo, dates[0], dates[4]), dates));
    if (plan.length === 0) return await save('empty', '이번 주 나이스 시간표가 아직 없어요(방학이거나 학교가 입력하기 전). 지금 시간표를 그대로 둬요.');
    const database = await getDatabase();
    const missing = missingPeriods(plan, (await getPeriods(database)).map((period) => period.periodNo));
    if (missing.length > 0) return await save('missing-periods', `교시 시간에 ${missing.join('·')}교시가 없어 자동으로 바꾸지 못했어요.`);
    const setId = (await getActiveTimetableSet(database)).id;
    const current = (await getEditableTimetableItems(database, setId)).filter((item) => item.category === 'school' && item.periodNo != null);
    const currentDays = WEEKDAYS.map((weekday) => ({ weekday, entries: current.filter((item) => item.weekday === weekday).map((item) => ({ period: item.periodNo!, subject: item.title })) }));
    if (scheduleSignature(currentDays) === scheduleSignature(plan)) return await save('same', '나이스 시간표와 지금 시간표가 같아요.');
    await runAdminEdit(async () => replaceSchoolItems(await getDatabase(), setId, plan, { clearEmptyDays: true }));
    // 로컬 모드는 동기화가 알림을 다시 예약하지 않으므로 여기서 다시 예약한다(로그인한 폰은 편집 뒤 동기화도 다시 예약한다)
    await refreshAllRollingOwners().catch(() => undefined);
    notifyWidgetChecksApplied(); // 열려 있는 화면이 바뀐 시간표를 다시 읽는다
    return await save('updated', `${Number(week.slice(4, 6))}/${Number(week.slice(6, 8))} 주 나이스 시간표로 학교 일정을 바꿨어요.`);
  } catch (error) {
    return save('error', userErrorMessage(error, '학교 시간표를 확인하지 못했어요. 다음에 다시 확인해요.'));
  }
}
