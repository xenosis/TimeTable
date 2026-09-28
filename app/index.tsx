import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { StickerBoard } from '../src/components/StickerBoard';
import { PermissionGuide } from '../src/components/PermissionGuide';
import { ThemePicker } from '../src/components/ThemePicker';
import { TodayScheduleCard } from '../src/components/TodayScheduleCard';
import { TodayTasksCard } from '../src/components/TodayTasksCard';
import { WeeklyTimetable } from '../src/components/WeeklyTimetable';
import { getDatabase } from '../src/db/database';
import { getActiveTimetableMode } from '../src/db/timetableModeRepository';
import type { TimetableMode } from '../src/db/types';
import { borderRadius, fontSize, spacing, touchTarget } from '../src/theme';
import { useActiveTheme } from '../src/theme/provider';
import { msUntilNextLocalMidnight } from '../src/utils/date';

export default function TodayScreen() {
  const router = useRouter();
  const { theme, selectTheme } = useActiveTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [timetableMode, setTimetableMode] = useState<TimetableMode>('regular');
  const { colors } = theme;
  const bump = useCallback(() => setRefreshKey((value) => value + 1), []);

  useFocusEffect(useCallback(() => {
    let active = true;
    void getDatabase()
      .then(getActiveTimetableMode)
      .then((mode) => { if (active) setTimetableMode(mode); })
      .catch(() => undefined)
      .finally(() => { if (active) bump(); });
    return () => { active = false; };
  }, [bump]));

  // 앱을 켜 둔 채로 자정을 넘기거나 백그라운드에서 돌아오면 "오늘" 기준 화면을 다시 그린다.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') bump(); });
    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnightBump = () => {
      timer = setTimeout(() => { bump(); scheduleMidnightBump(); }, msUntilNextLocalMidnight(new Date()));
    };
    scheduleMidnightBump();
    return () => { subscription.remove(); clearTimeout(timer); };
  }, [bump]);

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>오늘도 해보자! ✨</Text>
    <PermissionGuide theme={theme} hideWhenReady />
    <TodayScheduleCard refreshKey={refreshKey} theme={theme} timetableMode={timetableMode} />
    <TodayTasksCard theme={theme} refreshKey={refreshKey} onChanged={bump} />
    <StickerBoard theme={theme} refreshKey={refreshKey} />
    <WeeklyTimetable refreshKey={refreshKey} theme={theme} timetableMode={timetableMode} />
    <ThemePicker selectedThemeId={theme.id} onSelect={selectTheme} />
    <Pressable accessibilityRole="button" accessibilityLabel="관리자 설정 열기" onPress={() => router.push('/manage')} style={({ pressed }) => [styles.manageButton, { borderColor: colors.primary }, pressed && styles.pressed]}>
      <Text style={[styles.manageText, { color: colors.primary }]}>관리자 설정</Text>
    </Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  heading: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  manageButton: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg },
  manageText: { fontSize: fontSize.md, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
