import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { getDatabase } from '../db/database';
import { editTaskWithRewards } from '../db/rewardRepository';
import { createTask, deleteTask, endRecurringTask, getEditableTasks, getEndableTasks, updateTask, type EditableTask, type EndableTask } from '../db/taskRepository';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import type { AdminFormState } from '../utils/adminSections';
import { summarizeWeekdays } from '../utils/adminWeekdays';
import { formatTimeInput } from '../utils/timeInput';
import { AdminCollapsible } from './AdminCollapsible';
import { AdminWeekdayPicker } from './AdminWeekdayPicker';
import { DatePicker } from './DatePicker';

type Draft = { readonly id?: number; readonly title: string; readonly weekdays: readonly number[]; readonly date: string; readonly effectiveFrom: string; readonly remindTime: string; readonly alertMode: 'none' | 'notify' | 'alarm' };
const blank = (effectiveFrom: string): Draft => ({ title: '', weekdays: [], date: '', effectiveFrom, remindTime: '', alertMode: 'none' });
const alertLabels = { none: '없음', notify: '알림', alarm: '알람' } as const;
const today = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; };

/** 목록 한 줄 요약: 반복 요일(월수금) 또는 특정 날짜, 알림 방식. */
function summaryOf(task: EditableTask): string {
  const when = task.taskDate ? task.taskDate : summarizeWeekdays(task.repeatWeekdays?.split(',').map(Number) ?? []);
  return [when, task.alertMode && task.alertMode !== 'none' ? alertLabels[task.alertMode] : ''].filter(Boolean).join(' · ');
}

export function TaskEditor({ theme, onChanged, onFormState }: { readonly theme: ThemeDefinition; readonly onChanged: () => Promise<void>; readonly onFormState?: (state: AdminFormState) => void }) {
  const [tasks, setTasks] = useState<readonly EditableTask[]>([]);
  const [endableTasks, setEndableTasks] = useState<readonly EndableTask[]>([]);
  const [draft, setDraft] = useState<Draft>(() => blank(today()));
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState('할 일을 불러오는 중이에요.');
  const [saving, setSaving] = useState(false);
  const { colors } = theme;

  const load = () => void getDatabase().then(async (database) => { setTasks(await getEditableTasks(database)); setEndableTasks(await getEndableTasks(database)); setMessage('할 일을 고르거나 추가를 눌러 주세요. 완료 이력이 있는 할 일은 이력으로 남아요.'); }).catch(() => setMessage('할 일을 불러오지 못했어요.'));
  useEffect(load, []);

  const toDraft = (task: EditableTask): Draft => ({ id: task.id, title: task.title, weekdays: task.repeatWeekdays?.split(',').map(Number) ?? [], date: task.taskDate ?? '', effectiveFrom: task.effectiveFrom ?? today(), remindTime: task.remindTime ?? '', alertMode: task.alertMode ?? 'none' });
  const openNew = () => { setDraft(blank(today())); setFormOpen(true); };
  const openTask = (task: EditableTask) => { setDraft(toDraft(task)); setFormOpen(true); };
  const closeForm = () => { setDraft(blank(today())); setFormOpen(false); };

  // 저장하지 않은 입력이 있는지(고른 항목이나 빈 새 항목과 달라졌는지)를 영역 이동 확인용으로 위에 알린다. 폼이 닫혀 있으면 입력이 없다.
  const loaded = draft.id != null ? tasks.find((task) => task.id === draft.id) : undefined;
  const dirty = formOpen && JSON.stringify(draft) !== JSON.stringify(loaded ? toDraft(loaded) : blank(draft.effectiveFrom));
  useEffect(() => { onFormState?.({ dirty, saving }); }, [dirty, saving, onFormState]);

  // 저장하지 않은 입력이 있으면 버려도 되는지 묻고, 괜찮다고 할 때만 다음 동작을 한다
  const confirmThen = (next: () => void) => {
    if (!dirty) { next(); return; }
    Alert.alert('작성 중인 내용이 있어요', '계속하면 저장하지 않은 내용이 사라져요.', [{ text: '계속 편집', style: 'cancel' }, { text: '버리고 계속', style: 'destructive', onPress: next }]);
  };

  const run = async (action: (database: Awaited<ReturnType<typeof getDatabase>>) => Promise<unknown>, done: string, partial: string, failure: string) => {
    setSaving(true);
    try {
      const database = await getDatabase(); const now = new Date();
      await editTaskWithRewards(database, today(), now.getDay(), async () => { await action(database); });
      closeForm(); load();
      try { await onChanged(); setMessage(done); } catch { setMessage(partial); }
    } catch (error) { setMessage(error instanceof Error ? error.message : failure); } finally { setSaving(false); }
  };
  const save = () => run((database) => {
    const input = { title: draft.title, repeatWeekdays: draft.weekdays, taskDate: draft.date, effectiveFrom: draft.effectiveFrom, remindTime: draft.remindTime, alertMode: draft.alertMode };
    return draft.id ? updateTask(database, draft.id, input) : createTask(database, input);
  }, '할 일을 저장했고 알림 예약도 새로 만들었어요.', '할 일은 저장했지만 알림 예약에 실패했어요. 알림 준비 권한을 확인한 뒤 다시 저장해 주세요.', '할 일을 저장하지 못했어요.');
  const remove = () => { if (draft.id) void run((database) => deleteTask(database, draft.id!), '할 일을 지웠어요.', '할 일은 지웠지만 알림 예약을 다시 만들지 못했어요.', '할 일을 지우지 못했어요.'); };
  const endToday = (task: EndableTask) => run((database) => endRecurringTask(database, task.id, today()), `${task.title}을(를) 오늘까지만 하고 그만두기로 했어요. 내일부터 목록에서 빠져요.`, '그만두기는 저장했지만 알림 예약을 다시 만들지 못했어요.', '그만두기를 저장하지 못했어요.');

  const button = (label: string, onPress: () => void, background: string, textColor: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={saving} onPress={onPress} style={[styles.action, { backgroundColor: background }, saving && styles.dim]}><Text style={[styles.actionText, { color: textColor }]}>{label}</Text></Pressable>
  );

  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <View style={styles.titleRow}><Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>할 일</Text>{!formOpen && button('추가', openNew, colors.primary, colors.onPrimary)}</View>
    {tasks.map((task) => (
      <Pressable key={task.id} accessibilityRole="button" accessibilityLabel={`${task.title} 편집`} disabled={saving} onPress={() => confirmThen(() => openTask(task))} style={[styles.row, { borderColor: draft.id === task.id && formOpen ? colors.primary : colors.border }]}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{task.title}</Text>
        <Text numberOfLines={1} style={[styles.rowSummary, { color: colors.textMuted }]}>{summaryOf(task)}</Text>
      </Pressable>
    ))}
    {formOpen && <View style={[styles.form, { borderColor: colors.border }]}>
      <TextInput accessibilityLabel="할 일 이름" editable={!saving} value={draft.title} onChangeText={(title) => setDraft((current) => ({ ...current, title }))} placeholder="숙제, 준비물" style={styles.input} />
      <Text style={[styles.label, { color: colors.text }]}>반복 요일 (또는 특정 날짜 하나)</Text>
      <AdminWeekdayPicker selected={draft.weekdays} onChange={(weekdays) => setDraft((current) => ({ ...current, date: '', weekdays }))} mode="multi" theme={theme} disabled={saving} label="반복 요일" />
      <DatePicker theme={theme} disabled={saving} value={draft.date} onChange={(date) => setDraft((current) => ({ ...current, date, weekdays: [] }))} />
      <Text style={[styles.label, { color: colors.text }]}>알림</Text>
      <View style={styles.inline}>{(['none', 'notify', 'alarm'] as const).map((mode) => (
        <Pressable key={mode} accessibilityRole="button" accessibilityLabel={`알림 방식 ${alertLabels[mode]}`} accessibilityState={{ selected: draft.alertMode === mode }} disabled={saving} onPress={() => setDraft((current) => ({ ...current, alertMode: mode }))} style={[styles.choice, { borderColor: colors.primary }, draft.alertMode === mode && { backgroundColor: colors.primary }]}>
          <Text style={[styles.actionText, { color: draft.alertMode === mode ? colors.onPrimary : colors.primary }]}>{alertLabels[mode]}</Text>
        </Pressable>
      ))}</View>
      {draft.alertMode !== 'none' && <TextInput accessibilityLabel="할 일 알림 시간" editable={!saving} value={draft.remindTime} onChangeText={(remindTime) => setDraft((current) => ({ ...current, remindTime: formatTimeInput(remindTime) }))} placeholder="알림 시간 (예: 1900 → 19:00)" keyboardType="number-pad" maxLength={5} style={styles.input} />}
      <View style={styles.inline}>
        {button(draft.id ? '수정 저장' : '추가', () => void save(), colors.primary, colors.onPrimary)}
        {button('취소', () => confirmThen(closeForm), colors.surface, colors.text)}
        {draft.id != null && button('삭제', remove, colors.danger, colors.onPrimary)}
      </View>
    </View>}
    {endableTasks.length > 0 && <AdminCollapsible title="더보기: 오늘까지만 하고 그만두기" theme={theme}>
      <Text style={[styles.label, { color: colors.textMuted }]}>완료 기록이 있는 할 일은 이름·요일을 바꿀 수 없어요. 오늘까지만 하고 그만둘 수 있어요.</Text>
      {endableTasks.map((task) => (
        <View key={task.id} style={[styles.row, styles.inline, { borderColor: colors.border }]}>
          <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{task.title}</Text>
          {button('그만두기', () => void endToday(task), colors.danger, colors.onPrimary)}
        </View>
      ))}
    </AdminCollapsible>}
    <Text accessibilityLiveRegion="polite" style={[styles.label, { color: colors.textMuted }]}>{message}</Text>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.sm, padding: adminSpacing.md, width: '100%' },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  heading: { fontSize: adminFontSize.title, fontWeight: '700' },
  row: { borderRadius: borderRadius.sm, borderWidth: 1, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  rowTitle: { fontSize: adminFontSize.body, fontWeight: '700' },
  rowSummary: { fontSize: adminFontSize.label },
  // 폼 안쪽 여백·테두리를 두지 않아 카드 안 폭을 요일 7칸(342dp)에 최대한 쓴다
  form: { borderTopWidth: 1, gap: adminSpacing.sm, paddingTop: adminSpacing.sm },
  label: { fontSize: adminFontSize.label },
  input: { borderColor: '#94A3B8', borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  inline: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: adminSpacing.xs },
  choice: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flexGrow: 1, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: 64 },
  action: { alignItems: 'center', borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  actionText: { fontSize: adminFontSize.body, fontWeight: '700' },
  dim: { opacity: 0.5 },
});
