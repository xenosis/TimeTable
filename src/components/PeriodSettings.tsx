import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getPeriods, savePeriods, type Period } from '../db/periodRepository';
import { borderRadius } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { formatTimeInput } from '../utils/timeInput';
import { runAdminEdit } from '../sync/adminEditGate';
import { userErrorMessage } from '../utils/userErrorMessage';

const initialPeriods: readonly Period[] = [];

export function PeriodSettings({ onSaved }: { readonly onSaved?: () => Promise<void> }) {
  const [periods, setPeriods] = useState<readonly Period[]>(initialPeriods);
  const [savedPeriodCount, setSavedPeriodCount] = useState(0);
  const [message, setMessage] = useState('교시 시간을 불러오는 중이에요.');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void getDatabase().then(getPeriods).then((saved) => {
      if (saved.length) setPeriods(saved);
      setSavedPeriodCount(saved.length);
      setMessage(saved.length ? '저장된 교시 시간이에요.' : '교시 추가를 눌러 시작과 끝 시간을 입력해 주세요.');
    }).catch(() => {
      setLoadFailed(true);
      setMessage('교시 시간을 불러오지 못했어요. 다시 불러와 주세요.');
    }).finally(() => setLoading(false));
  }, [loadAttempt]);

  const update = (index: number, field: 'startTime' | 'endTime', value: string) => setPeriods((current) => current.map((period, currentIndex) => currentIndex === index ? { ...period, [field]: value } : period));
  const add = () => setPeriods((current) => [...current, { periodNo: Math.max(0, ...current.map(({ periodNo }) => periodNo)) + 1, startTime: '', endTime: '' }]);
  const removeLast = () => setPeriods((current) => current.length > savedPeriodCount ? current.slice(0, -1) : current);
  const retryLoad = () => { setLoading(true); setLoadFailed(false); setLoadAttempt((attempt) => attempt + 1); };
  const save = async () => {
    if (!periods.length) { setMessage('교시를 하나 이상 추가해 주세요.'); return; }
    setSaving(true);
    setMessage('저장하는 중이에요.');
    try {
      await runAdminEdit(async () => savePeriods(await getDatabase(), periods));
      setSavedPeriodCount(periods.length);
      try {
        await onSaved?.();
        setMessage('교시 시간을 저장했고 알림 예약도 새로 만들었어요.');
      } catch {
        setMessage('교시 시간은 저장했지만 알림 예약을 다시 만들지 못했어요. 알림 준비 권한을 확인해 주세요.');
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'period times must be valid and ordered') {
        setMessage('시작과 끝 시간을 HH:MM으로 입력해 주세요. 끝 시간은 시작 시간보다 늦어야 해요.');
      } else {
        setMessage(userErrorMessage(error, '교시 시간을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'));
      }
    } finally {
      setSaving(false);
    }
  };

  return <View style={styles.container}>
    <Text accessibilityRole="header" style={styles.heading}>교시 시간</Text>
    <Text style={styles.description}>숫자 네 자리만 입력해요. 0900 → 09:00</Text>
    {periods.map((period, index) => <View key={period.periodNo} style={styles.row}>
      <Text style={styles.label}>{period.periodNo}교시</Text>
      <TextInput accessibilityLabel={`${period.periodNo}교시 시작 시간`} editable={!saving} value={period.startTime} onChangeText={(value) => update(index, 'startTime', formatTimeInput(value))} placeholder="0900" keyboardType="number-pad" maxLength={5} style={styles.input} />
      <Text style={styles.wave}>~</Text>
      <TextInput accessibilityLabel={`${period.periodNo}교시 종료 시간`} editable={!saving} value={period.endTime} onChangeText={(value) => update(index, 'endTime', formatTimeInput(value))} placeholder="0940" keyboardType="number-pad" maxLength={5} style={styles.input} />
    </View>)}
    <Pressable accessibilityRole="button" disabled={loading || saving || loadFailed} onPress={add} style={[styles.secondary, (loading || saving || loadFailed) && styles.disabled]}><Text style={styles.secondaryText}>교시 추가</Text></Pressable>
    {periods.length > savedPeriodCount && <Pressable accessibilityRole="button" disabled={saving} onPress={removeLast} style={[styles.secondary, saving && styles.disabled]}><Text style={styles.secondaryText}>마지막 추가 교시 지우기</Text></Pressable>}
    {loadFailed && <Pressable accessibilityRole="button" onPress={retryLoad} style={styles.secondary}><Text style={styles.secondaryText}>교시 시간 다시 불러오기</Text></Pressable>}
    <Pressable accessibilityRole="button" disabled={saving || loading || loadFailed} onPress={() => void save()} style={[styles.save, (saving || loading || loadFailed) && styles.disabled]}><Text style={styles.saveText}>{saving ? '저장 중...' : '교시 시간 저장'}</Text></Pressable>
    <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: adminSpacing.xs, width: '100%' }, heading: { fontSize: adminFontSize.title, fontWeight: '700' }, description: { fontSize: adminFontSize.label, color: '#475569' },
  row: { alignItems: 'center', flexDirection: 'row', gap: adminSpacing.xs }, label: { fontSize: adminFontSize.label, fontWeight: '700', minWidth: 52 },
  input: { borderColor: '#94A3B8', borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.label, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.xs, flex: 1 }, wave: { fontSize: adminFontSize.body },
  secondary: { alignItems: 'center', borderColor: '#4F46E5', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: adminTouchTarget }, secondaryText: { color: '#4F46E5', fontSize: adminFontSize.label, fontWeight: '700' },
  save: { alignItems: 'center', backgroundColor: '#4F46E5', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget }, disabled: { opacity: 0.6 }, saveText: { color: '#FFFFFF', fontSize: adminFontSize.body, fontWeight: '700' }, message: { fontSize: adminFontSize.label, textAlign: 'center' },
});
