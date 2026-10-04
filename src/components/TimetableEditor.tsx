import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getPeriods, type Period } from '../db/periodRepository';
import { createTimetableItems, deleteTimetableItem, getEditableTimetableItems, MAX_MEMO_LENGTH, updateTimetableItem, type EditableTimetableItem } from '../db/timetableRepository';
import { timetableCategories, type TimetableCategory, type TimetableSetId } from '../db/types';
import { borderRadius, colorKeys, fontSize, iconKeys, resolveThemeColor, resolveThemeIcon, spacing, touchTarget, type ThemeDefinition } from '../theme';
import { formatTimeInput } from '../utils/timeInput';
import { AdminWeekdayPicker } from './AdminWeekdayPicker';

type Draft = { readonly id?: number; readonly weekdays: readonly number[]; readonly title: string; readonly periodNo: number | null; readonly startTime: string; readonly endTime: string; readonly category: TimetableCategory; readonly colorKey: (typeof colorKeys)[number]; readonly iconKey: (typeof iconKeys)[number]; readonly alertMode: 'none' | 'notify' | 'alarm'; readonly alertBeforeMin: string; readonly memo: string };
const categoryLabels: Record<TimetableCategory, string> = { school: '학교', academy: '학원', care: '돌봄', life: '생활' };
const emptyDraft = (): Draft => ({ weekdays: [new Date().getDay()], title: '', periodNo: null, startTime: '', endTime: '', category: 'academy', colorKey: 'other', iconKey: 'other', alertMode: 'none', alertBeforeMin: '0', memo: '' });
const weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

function Button({ label, onPress, selected = false, disabled = false }: { readonly label: string; readonly onPress: () => void; readonly selected?: boolean; readonly disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, selected && styles.selected, (pressed || disabled) && styles.dim]}><Text style={[styles.buttonText, selected && styles.selectedText]}>{label}</Text></Pressable>;
}

export function TimetableEditor({ refreshKey, theme, onChanged, setId }: { readonly refreshKey: number; readonly theme: ThemeDefinition; readonly onChanged: () => Promise<void>; readonly setId: TimetableSetId }) {
  const [periods, setPeriods] = useState<readonly Period[]>([]);
  const [items, setItems] = useState<readonly EditableTimetableItem[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [message, setMessage] = useState('시간표 항목을 불러오는 중이에요.');
  const [saving, setSaving] = useState(false);

  const reload = () => void getDatabase().then(async (database) => ({ periods: await getPeriods(database), items: await getEditableTimetableItems(database, setId) })).then((saved) => {
    setPeriods(saved.periods); setItems(saved.items); setMessage(saved.items.length ? '수정할 항목을 고르거나 새 항목을 입력해 주세요.' : '새 시간표 항목을 입력해 주세요.');
  }).catch(() => setMessage('시간표 항목을 불러오지 못했어요.'));
  useEffect(reload, [refreshKey, setId]);

  const select = (item: EditableTimetableItem) => setDraft({ id: item.id, weekdays: [item.weekday], title: item.title, periodNo: item.periodNo ?? null, startTime: item.startTime ?? '', endTime: item.endTime ?? '', category: item.category, colorKey: item.colorKey, iconKey: item.iconKey, alertMode: item.alertMode ?? 'none', alertBeforeMin: String(item.alertBeforeMin ?? 0), memo: item.memo ?? '' });
  const memoLength = Array.from(draft.memo.trim()).length; // 저장할 때 앞뒤 공백은 지우므로 같은 기준으로 센다
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const input = () => ({ title: draft.title, periodNo: draft.periodNo, startTime: draft.periodNo == null ? draft.startTime : null, endTime: draft.periodNo == null ? draft.endTime : null, category: draft.category, colorKey: draft.colorKey, iconKey: draft.iconKey, alertMode: draft.alertMode, alertBeforeMin: Number(draft.alertBeforeMin), memo: draft.memo, setId });

  const save = async () => {
    if (memoLength > MAX_MEMO_LENGTH) { setMessage(`메모는 ${MAX_MEMO_LENGTH}글자까지 쓸 수 있어요. 조금 줄여 주세요.`); return; }
    setSaving(true);
    try {
      const database = await getDatabase();
      if (draft.id) await updateTimetableItem(database, draft.id, { ...input(), weekday: draft.weekdays[0] ?? -1 });
      else await createTimetableItems(database, draft.weekdays, input());
      setDraft(emptyDraft()); reload();
      try { await onChanged(); setMessage('시간표 항목을 저장했고 알림 예약도 새로 만들었어요.'); }
      catch { setMessage('시간표 항목은 저장했지만 알림 예약에 실패했어요. 알림 준비 권한을 확인한 뒤 다시 저장해 주세요.'); }
    } catch (error) { setMessage(error instanceof Error ? `저장하지 못했어요: ${error.message}` : '저장하지 못했어요.'); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!draft.id) return;
    setSaving(true);
    try { await deleteTimetableItem(await getDatabase(), draft.id, setId); setDraft(emptyDraft()); reload(); await onChanged(); setMessage('시간표 항목을 지우고 알림 예약도 새로 만들었어요.'); }
    catch { setMessage('항목을 지우지 못했어요.'); } finally { setSaving(false); }
  };

  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>시간표 항목 편집</Text>
    {draft.id != null && <Button label="새 항목 입력" onPress={() => setDraft(emptyDraft())} disabled={saving} />}
    <View style={styles.list}>{items.map((item) => <Button key={item.id} label={`${weekdayLabels[item.weekday]} · ${item.title}`} onPress={() => select(item)} selected={draft.id === item.id} />)}</View>
    <TextInput accessibilityLabel="과목 이름" editable={!saving} value={draft.title} onChangeText={(value) => set('title', value)} placeholder="과목 또는 일정" style={styles.input} />
    <TextInput accessibilityLabel="메모" editable={!saving} value={draft.memo} onChangeText={(value) => set('memo', value)} placeholder="메모 (예: 16:45 차 타고 이동)" style={styles.input} />
    <Text style={{ color: memoLength > MAX_MEMO_LENGTH ? theme.colors.danger : theme.colors.textMuted }}>{`메모 ${memoLength}/${MAX_MEMO_LENGTH}글자`}</Text>
    <Text style={[styles.label, { color: theme.colors.text }]}>반복할 요일</Text><Text style={{ color: theme.colors.textMuted }}>오늘 요일이 미리 선택돼 있어요. 필요한 요일만 골라요.</Text><AdminWeekdayPicker selected={draft.weekdays} onChange={(weekdays) => set('weekdays', weekdays)} mode={draft.id ? 'single' : 'multi'} theme={theme} disabled={saving} label="반복할 요일" />
    {draft.id && <Text style={{ color: theme.colors.textMuted }}>기존 항목은 한 요일씩 수정해요.</Text>}
    <Text style={[styles.label, { color: theme.colors.text }]}>시간</Text><View style={styles.wrap}><Button label="교시" onPress={() => set('periodNo', periods[0]?.periodNo ?? null)} selected={draft.periodNo != null} disabled={saving} /><Button label="직접 입력" onPress={() => set('periodNo', null)} selected={draft.periodNo == null} disabled={saving} />{draft.periodNo != null && periods.map((period) => <Button key={period.periodNo} label={`${period.periodNo}교시`} onPress={() => set('periodNo', period.periodNo)} selected={draft.periodNo === period.periodNo} disabled={saving} />)}</View>
    {draft.periodNo == null && <><Text style={{ color: theme.colors.textMuted }}>숫자 네 자리만 입력해요. 0930 → 09:30</Text><View style={styles.timeInputs}><TextInput accessibilityLabel="시작 시간" editable={!saving} value={draft.startTime} onChangeText={(value) => set('startTime', formatTimeInput(value))} placeholder="0930" maxLength={5} keyboardType="number-pad" style={styles.input} /><TextInput accessibilityLabel="종료 시간" editable={!saving} value={draft.endTime} onChangeText={(value) => set('endTime', formatTimeInput(value))} placeholder="0940" maxLength={5} keyboardType="number-pad" style={styles.input} /></View></>}
    <Text style={[styles.label, { color: theme.colors.text }]}>색과 아이콘</Text><View style={styles.wrap}>{colorKeys.map((key) => { const color = resolveThemeColor(theme, key); return <Pressable key={key} accessibilityRole="button" onPress={() => set('colorKey', key)} style={[styles.swatch, { backgroundColor: color.backgroundColor }, draft.colorKey === key && styles.outline]}><Text style={{ color: color.textColor }}>{color.label}</Text></Pressable>; })}</View><View style={styles.wrap}>{iconKeys.map((key) => { const icon = resolveThemeIcon(theme, key); return <Button key={key} label={icon.glyph} onPress={() => set('iconKey', key)} selected={draft.iconKey === key} disabled={saving} />; })}</View>
    <Text style={[styles.label, { color: theme.colors.text }]}>일정 종류</Text><View style={styles.wrap}>{timetableCategories.map((category) => <Button key={category} label={categoryLabels[category]} onPress={() => set('category', category)} selected={draft.category === category} disabled={saving} />)}</View>
    <Text style={{ color: theme.colors.textMuted }}>바탕화면 위젯에는 학교 일정이 나오지 않아요. 학원·방과후는 학원, 돌봄교실은 돌봄으로 골라 주세요.</Text>
    <Text style={[styles.label, { color: theme.colors.text }]}>알림 방식</Text><View style={styles.wrap}>{(['none', 'notify', 'alarm'] as const).map((mode) => <Button key={mode} label={mode === 'none' ? '없음' : mode === 'notify' ? '화면 알림' : '소리·화면 알람'} onPress={() => set('alertMode', mode)} selected={draft.alertMode === mode} disabled={saving} />)}</View><Text style={{ color: theme.colors.textMuted }}>{draft.alertMode === 'notify' ? '화면 알림: 상단에 알려 줘요.' : draft.alertMode === 'alarm' ? '소리·화면 알람: 소리가 나고 잠금 화면에도 보여요.' : '알림을 보내지 않아요.'}</Text><TextInput accessibilityLabel="미리 알림 분" editable={!saving} value={draft.alertBeforeMin} onChangeText={(value) => set('alertBeforeMin', value)} keyboardType="number-pad" placeholder="미리 알림 분" style={styles.input} />
    <View style={styles.actions}><Button label={draft.id ? '수정 저장' : '선택한 요일에 추가'} onPress={() => void save()} disabled={saving} />{draft.id && <Button label="삭제" onPress={() => void remove()} disabled={saving} />}</View><Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, padding: spacing.lg, width: '100%' }, heading: { fontSize: fontSize.lg, fontWeight: '700' }, label: { fontSize: fontSize.sm, fontWeight: '700' }, list: { gap: spacing.xs }, wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, actions: { flexDirection: 'row', gap: spacing.sm }, timeInputs: { flexDirection: 'row', gap: spacing.sm },
  button: { alignItems: 'center', borderColor: '#4F46E5', borderRadius: borderRadius.sm, borderWidth: 1, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm }, buttonText: { color: '#3730A3', fontSize: fontSize.sm, fontWeight: '700' }, selected: { backgroundColor: '#4F46E5' }, selectedText: { color: '#FFFFFF' }, dim: { opacity: 0.6 }, input: { borderColor: '#94A3B8', borderRadius: borderRadius.sm, borderWidth: 1, flex: 1, fontSize: fontSize.sm, minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm }, swatch: { alignItems: 'center', borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm }, outline: { borderColor: '#0F172A', borderWidth: 3 },
});

