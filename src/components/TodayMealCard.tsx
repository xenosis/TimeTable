import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { loadTodayMeal, type TodayMeal } from '../neis/meals';
import { borderRadius, type ThemeDefinition } from '../theme';

/**
 * 아이 '오늘' 화면의 오늘 급식 카드(P8.2). 학교를 정하지 않았으면 카드를 그리지 않는다.
 * 급식이 없는 날(주말·방학·공휴일)은 그렇다고 알리고, 못 불러오면 짧게 알린다(화면의 다른 내용은 그대로).
 */
export function TodayMealCard({ theme, refreshKey }: { readonly theme: ThemeDefinition; readonly refreshKey: number }) {
  const [meal, setMeal] = useState<TodayMeal | null>(null);

  useEffect(() => {
    let active = true;
    void loadTodayMeal().then((loaded) => { if (active) setMeal(loaded); }).catch(() => { if (active) setMeal({ status: 'error', message: '급식을 불러오지 못했어요.' }); });
    return () => { active = false; };
  }, [refreshKey]);

  if (!meal || meal.status === 'no-school') return null;
  const { colors } = theme;
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>오늘의 급식 🍚</Text>
    {meal.status === 'ready' && <>
      {meal.dishes.map((dish, index) => <Text key={`${index}-${dish}`} style={[styles.dish, { color: colors.text }]}>{dish}</Text>)}
      {!!meal.calories && <Text style={[styles.note, { color: colors.textMuted }]}>{meal.kind === '중식' ? '' : `${meal.kind} · `}{meal.calories}</Text>}
    </>}
    {meal.status === 'none' && <Text style={[styles.note, { color: colors.textMuted }]}>오늘은 급식이 없어요.</Text>}
    {meal.status === 'error' && <Text style={[styles.note, { color: colors.textMuted }]}>급식을 불러오지 못했어요. 인터넷이 되면 다시 보여 줄게요.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 1, gap: 6, padding: 14, width: '100%' },
  heading: { fontSize: 16, fontWeight: '800', marginBottom: 2 },
  dish: { fontSize: 16, lineHeight: 22 },
  note: { fontSize: 13 },
});
