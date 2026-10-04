import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { copyTimetableWeekday } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import type { ThemeDefinition } from '../theme';
import { borderRadius } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { AdminWeekdayPicker } from './AdminWeekdayPicker';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

/** 한 요일의 시간표를 다른 요일로 복사한다. 원본과 대상 요일을 각각 공통 월~일 선택기에서 고른다. */
export function WeekdayCopy({ theme, onCopied, setId }: { readonly theme: ThemeDefinition; readonly onCopied: () => Promise<void>; readonly setId: TimetableSetId }) {
  const [source, setSource] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('원본과 대상 요일을 고르세요. 대상 요일의 기존 항목은 교체돼요.');
  const ready = source != null && target != null && !saving;

  const copy = async () => {
    if (source == null || target == null) { setMessage('원본과 대상 요일을 모두 골라 주세요.'); return; }
    if (source === target) { setMessage('서로 다른 요일을 골라 주세요.'); return; }
    setSaving(true);
    try {
      await copyTimetableWeekday(await getDatabase(), source, target, setId);
      try { await onCopied(); setMessage(`${weekdays[source]}요일 시간표를 ${weekdays[target]}요일에 복사했고 알림 예약도 새로 만들었어요.`); }
      catch { setMessage(`${weekdays[source]}요일 시간표는 복사했지만 알림 예약을 다시 만들지 못했어요. 알림 준비 권한을 확인해 주세요.`); }
    } catch (error) { setMessage(error instanceof Error ? `복사하지 못했어요: ${error.message}` : '복사하지 못했어요.'); } finally { setSaving(false); }
  };

  return <View style={styles.wrap}>
    <Text style={[styles.label, { color: theme.colors.text }]}>원본 요일</Text>
    <AdminWeekdayPicker selected={source == null ? [] : [source]} onChange={(days) => setSource(days[0] ?? null)} mode="single" theme={theme} disabled={saving} label="원본 요일" />
    <Text style={[styles.label, { color: theme.colors.text }]}>대상 요일</Text>
    <AdminWeekdayPicker selected={target == null ? [] : [target]} onChange={(days) => setTarget(days[0] ?? null)} mode="single" theme={theme} disabled={saving} label="대상 요일" />
    <Pressable accessibilityRole="button" accessibilityLabel="시간표 복사" accessibilityState={{ disabled: !ready }} disabled={!ready} onPress={() => void copy()} style={[styles.copy, { backgroundColor: theme.colors.primary }, !ready && styles.dim]}>
      <Text style={[styles.copyText, { color: theme.colors.onPrimary }]}>{saving ? '복사 중...' : '시간표 복사'}</Text>
    </Pressable>
    <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: theme.colors.textMuted }]}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: adminSpacing.xs, width: '100%' },
  label: { fontSize: adminFontSize.label, fontWeight: '700' },
  copy: { alignItems: 'center', borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: adminTouchTarget },
  copyText: { fontSize: adminFontSize.body, fontWeight: '700' },
  hint: { fontSize: adminFontSize.label },
  dim: { opacity: 0.5 },
});
