import Storage from 'expo-sqlite/kv-store';

import { toLocalDateStr } from '../utils/date';
import { fetchMeals, type NeisMeal } from './neisClient';
import { loadSchoolProfile } from './schoolProfile';

/**
 * 급식 식단 보기(P8.2). 저장해 둔 학교(가족 설정)로 이번 주(월~일) 급식을 하루 한 번 받아 이 폰에 보관하고,
 * 화면은 보관본에서 오늘 급식을 읽는다. 인터넷이 안 되면 같은 주 보관본을 그대로 쓴다.
 */
export type TodayMeal =
  | { readonly status: 'no-school' }
  | { readonly status: 'none' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly kind: string; readonly dishes: readonly string[]; readonly calories: string };

type MealCache = { readonly schoolCode: string; readonly fetchedOn: string; readonly week: string; readonly meals: readonly NeisMeal[] };
const CACHE_KEY = 'timetable.meals';

/** 메뉴 이름에서 알레르기 번호 '(1.2.5)'와 학교가 붙이는 표시('(a)', '(동)', 끝의 'ㅅ'·'ㄱ' 같은 자음)를 뗀다. */
export function cleanDish(raw: string): string {
  return raw
    .replace(/\(\s*[\d.\s]+\)/g, '')
    .replace(/\([A-Za-z가-힣]\)/g, '')
    .replace(/[ㄱ-ㅎ]+(?=\s|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 날짜가 속한 주의 월요일과 일요일(YYYYMMDD) */
export function weekRange(now: Date): readonly [string, string] {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return [toLocalDateStr(monday).replaceAll('-', ''), toLocalDateStr(sunday).replaceAll('-', '')];
}

async function readCache(): Promise<MealCache | null> {
  try {
    const value = JSON.parse(await Storage.getItemAsync(CACHE_KEY) ?? 'null') as MealCache | null;
    return value && Array.isArray(value.meals) ? value : null;
  } catch {
    return null;
  }
}

/** 오늘 급식. 점심(중식)을 먼저 보이고, 없으면 그날 첫 끼를 보인다. */
export async function loadTodayMeal(now = new Date()): Promise<TodayMeal> {
  const profile = await loadSchoolProfile().catch(() => null);
  if (!profile) return { status: 'no-school' };
  const today = toLocalDateStr(now);
  const [monday, sunday] = weekRange(now);
  let cache = await readCache();
  const sameWeek = cache?.schoolCode === profile.schoolCode && cache.week === monday;
  if (!sameWeek || cache?.fetchedOn !== today) {
    try {
      cache = { schoolCode: profile.schoolCode, fetchedOn: today, week: monday, meals: await fetchMeals(profile, monday, sunday) };
      await Storage.setItemAsync(CACHE_KEY, JSON.stringify(cache)).catch(() => undefined);
    } catch (error) {
      // 같은 주 보관본이 있으면 그것을 보인다(인터넷이 잠시 안 될 때)
      if (!sameWeek) return { status: 'error', message: error instanceof Error ? error.message : '급식을 불러오지 못했어요.' };
    }
  }
  const key = today.replaceAll('-', '');
  const meals = (cache?.meals ?? []).filter((meal) => meal.date === key);
  const meal = meals.find((item) => item.kind === '중식') ?? meals[0];
  if (!meal) return { status: 'none' };
  return { status: 'ready', kind: meal.kind, dishes: meal.dishes.map(cleanDish).filter(Boolean), calories: meal.calories };
}
