import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDatabase } from '../db/database';
import { editTaskWithRewards } from '../db/rewardRepository';
import { createTask, deleteTask, endRecurringTask, getEditableTasks, getEndableTasks, updateTask, type EditableTask, type EndableTask } from '../db/taskRepository';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';
import { adminSpacing } from '../theme/admin';
import { AdminWeekdayPicker } from './AdminWeekdayPicker';
import { DatePicker } from './DatePicker';
import { formatTimeInput } from '../utils/timeInput';

type Draft = { readonly id?: number; readonly title: string; readonly weekdays: readonly number[]; readonly date: string; readonly effectiveFrom: string; readonly remindTime: string; readonly alertMode: 'none' | 'notify' | 'alarm' };
const blank = (effectiveFrom: string): Draft => ({ title: '', weekdays: [], date: '', effectiveFrom, remindTime: '', alertMode: 'none' });

export function TaskEditor({ theme, onChanged }: { readonly theme: ThemeDefinition; readonly onChanged: () => Promise<void> }) {
  const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };
  const [tasks, setTasks] = useState<readonly EditableTask[]>([]);
  const [endableTasks, setEndableTasks] = useState<readonly EndableTask[]>([]);
  const [draft, setDraft] = useState<Draft>(() => blank(today()));
  const [message, setMessage] = useState('할 일을 불러오는 중이에요.');
  const [saving, setSaving] = useState(false);
  const load = () => void getDatabase().then(async (database) => { setTasks(await getEditableTasks(database)); setEndableTasks(await getEndableTasks(database)); setMessage('수정할 항목을 고르거나 새 할 일을 입력해 주세요. 완료 이력이 있는 할 일은 이력으로 남아요.'); }).catch(() => setMessage('할 일을 불러오지 못했어요.'));
  const endToday = async (task: EndableTask) => {
    setSaving(true);
    try {
      const database = await getDatabase();
      const now = new Date();
      await editTaskWithRewards(database, today(), now.getDay(), () => endRecurringTask(database, task.id, today()));
      load();
      try { await onChanged(); setMessage(`${task.title}을(를) 오늘까지만 하고 그만두기로 했어요. 내일부터 목록에서 빠져요.`); } catch { setMessage('그만두기는 저장했지만 알림 예약을 다시 만들지 못했어요.'); }
    } catch (error) { setMessage(error instanceof Error ? error.message : '그만두기를 저장하지 못했어요.'); } finally { setSaving(false); }
  };
  useEffect(load, []);
  const select = (task: EditableTask) => setDraft({ id: task.id, title: task.title, weekdays: task.repeatWeekdays?.split(',').map(Number) ?? [], date: task.taskDate ?? '', effectiveFrom: task.effectiveFrom ?? today(), remindTime: task.remindTime ?? '', alertMode: task.alertMode ?? 'none' });
  const save = async () => { setSaving(true); try { const database = await getDatabase(); const now = new Date(); const date = today(); const input = { title: draft.title, repeatWeekdays: draft.weekdays, taskDate: draft.date, effectiveFrom: draft.effectiveFrom, remindTime: draft.remindTime, alertMode: draft.alertMode }; await editTaskWithRewards(database, date, now.getDay(), () => draft.id ? updateTask(database, draft.id, input) : createTask(database, input)); setDraft(blank(date)); load(); try { await onChanged(); setMessage('할 일을 저장했고 알림 예약도 새로 만들었어요.'); } catch { setMessage('할 일은 저장했지만 알림 예약에 실패했어요. 알림 준비 권한을 확인한 뒤 다시 저장해 주세요.'); } } catch (error) { setMessage(error instanceof Error ? error.message : '할 일을 저장하지 못했어요.'); } finally { setSaving(false); } };
  const remove = async () => { if (!draft.id) return; setSaving(true); try { const database = await getDatabase(); const now = new Date(); const date = today(); await editTaskWithRewards(database, date, now.getDay(), () => deleteTask(database, draft.id!)); setDraft(blank(date)); load(); try { await onChanged(); setMessage('할 일을 지웠어요.'); } catch { setMessage('할 일은 지웠지만 알림 예약을 다시 만들지 못했어요.'); } } catch (error) { setMessage(error instanceof Error ? error.message : '할 일을 지우지 못했어요.'); } finally { setSaving(false); } };
  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <Text style={[styles.heading, { color: theme.colors.text }]}>할 일 편집</Text>
    {tasks.map((task) => <Pressable key={task.id} onPress={() => select(task)} style={[styles.item, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>{task.title}</Text></Pressable>)}
    {endableTasks.length > 0 && <>
      <Text style={{ color: theme.colors.textMuted }}>완료 기록이 있어 이름·요일은 못 바꾸지만, 오늘까지만 하고 그만둘 수 있어요.</Text>
      {endableTasks.map((task) => <View key={task.id} style={[styles.item, styles.row, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>{task.title}</Text><Pressable disabled={saving} onPress={() => void endToday(task)} style={[styles.action, { backgroundColor: theme.colors.danger }]}><Text style={{ color: theme.colors.onPrimary }}>오늘까지만 하고 그만두기</Text></Pressable></View>)}
    </>}
    <TextInput accessibilityLabel="할 일 이름" editable={!saving} value={draft.title} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} placeholder="숙제, 준비물" style={styles.input} />
    <Text style={{ color: theme.colors.text }}>반복 요일 또는 날짜 하나를 고르세요.</Text><AdminWeekdayPicker selected={draft.weekdays} onChange={(weekdays) => setDraft((current) => ({ ...current, date: '', weekdays }))} mode="multi" theme={theme} disabled={saving} label="반복 요일" />
    <DatePicker theme={theme} disabled={saving} value={draft.date} onChange={(date) => setDraft((current) => ({ ...current, date, weekdays: [] }))} />
    <Text style={{ color: theme.colors.text }}>할 일 알림</Text><View style={styles.row}>{(['none', 'notify', 'alarm'] as const).map((mode) => <Pressable key={mode} disabled={saving} onPress={() => setDraft((current) => ({ ...current, alertMode: mode }))} style={[styles.day, { borderColor: theme.colors.primary }, draft.alertMode === mode && { backgroundColor: theme.colors.primary }]}><Text style={{ color: draft.alertMode === mode ? theme.colors.onPrimary : theme.colors.primary }}>{mode === 'none' ? '없음' : mode === 'notify' ? '알림' : '알람'}</Text></Pressable>)}</View>
    {draft.alertMode !== 'none' && <><Text style={{ color: theme.colors.textMuted }}>숫자 네 자리만 입력해요. 1900 → 19:00</Text><TextInput accessibilityLabel="할 일 알림 시간" editable={!saving} value={draft.remindTime} onChangeText={(remindTime) => setDraft((current) => ({ ...current, remindTime: formatTimeInput(remindTime) }))} placeholder="1900" keyboardType="number-pad" maxLength={5} style={styles.input} /></>}
    <View style={styles.row}><Pressable disabled={saving} onPress={() => void save()} style={[styles.action, { backgroundColor: theme.colors.primary }]}><Text style={{ color: theme.colors.onPrimary }}>{draft.id ? '수정 저장' : '추가'}</Text></Pressable>{draft.id && <Pressable disabled={saving} onPress={() => void remove()} style={[styles.action, { backgroundColor: theme.colors.danger }]}><Text style={{ color: theme.colors.onPrimary }}>삭제</Text></Pressable>}<Pressable disabled={saving} onPress={() => setDraft(blank(today()))} style={[styles.action, { backgroundColor: theme.colors.surface }]}><Text style={{ color: theme.colors.text }}>새 항목</Text></Pressable></View>
    <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.textMuted }}>{message}</Text>
  </View>;
}
const styles = StyleSheet.create({ card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: spacing.sm, padding: adminSpacing.md, width: '100%' }, heading: { fontSize: fontSize.lg, fontWeight: '700' }, item: { borderWidth: 1, borderRadius: borderRadius.sm, minHeight: touchTarget.minimum, justifyContent: 'center', paddingHorizontal: spacing.sm }, input: { borderColor: '#94A3B8', borderWidth: 1, borderRadius: borderRadius.sm, minHeight: touchTarget.minimum, paddingHorizontal: spacing.sm }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }, day: { alignItems: 'center', borderWidth: 1, borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: touchTarget.minimum, minWidth: touchTarget.minimum }, action: { alignItems: 'center', borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.md } });
