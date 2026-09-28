import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { copyTimetableWeekday } from '../db/timetableRepository';
import type { TimetableMode } from '../db/types';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

export function WeekdayCopy({ theme, onCopied, timetableMode }: { readonly theme: ThemeDefinition; readonly onCopied: () => Promise<void>; readonly timetableMode: TimetableMode }) {
  const [source, setSource] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('원본과 대상 요일을 차례로 고르세요. 대상 요일의 기존 항목은 교체돼요.');
  const copy = async () => {
    if (source == null || target == null) { setMessage('원본과 대상 요일을 모두 골라 주세요.'); return; }
    setSaving(true);
    try {
      await copyTimetableWeekday(await getDatabase(), source, target, 'local-family', timetableMode);
      try { await onCopied(); setMessage(`${weekdays[source]}요일 시간표를 ${weekdays[target]}요일에 복사했고 알림 예약도 새로 만들었어요.`); }
      catch { setMessage(`${weekdays[source]}요일 시간표는 복사했지만 알림 예약을 다시 만들지 못했어요. 알림 준비 권한을 확인해 주세요.`); }
    }
    catch (error) { setMessage(error instanceof Error ? `복사하지 못했어요: ${error.message}` : '복사하지 못했어요.'); } finally { setSaving(false); }
  };
  const select = (day: number) => { if (source == null || target != null) { setSource(day); setTarget(null); } else if (day === source) setMessage('서로 다른 요일을 골라 주세요.'); else setTarget(day); };
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>요일 시간표 복사</Text>
    <View style={styles.days}>{weekdays.map((label, day) => <Pressable key={label} accessibilityRole="button" disabled={saving} onPress={() => select(day)} style={[styles.day, { borderColor: theme.colors.primary }, (source === day || target === day) && { backgroundColor: theme.colors.primary }]}><Text style={{ color: source === day || target === day ? theme.colors.onPrimary : theme.colors.primary }}>{source === day ? `원본 ${label}` : target === day ? `대상 ${label}` : label}</Text></Pressable>)}</View>
    <Pressable accessibilityRole="button" disabled={saving || source == null || target == null} onPress={() => void copy()} style={[styles.copy, { backgroundColor: theme.colors.primary }, (saving || source == null || target == null) && styles.dim]}><Text style={{ color: theme.colors.onPrimary }}>{saving ? '복사 중...' : '시간표 복사'}</Text></Pressable>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, padding: spacing.lg, width: '100%' }, heading: { fontSize: fontSize.lg, fontWeight: '700' }, days: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, day: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 1, justifyContent: 'center', minHeight: touchTarget.minimum, minWidth: touchTarget.minimum, paddingHorizontal: spacing.sm }, copy: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: touchTarget.minimum }, dim: { opacity: 0.6 },
});
