import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getDatabase } from '../db/database';
import { getPeriods, type Period } from '../db/periodRepository';
import { createTimetableItems, deleteTimetableItem, getEditableTimetableItems, MAX_MEMO_LENGTH, updateTimetableItem, type EditableTimetableItem } from '../db/timetableRepository';
import type { TimetableSetId } from '../db/types';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import type { AdminFormState } from '../utils/adminSections';
import { itemTimes, itemsForDay } from '../utils/timetableDayList';
import { userErrorMessage } from '../utils/userErrorMessage';
import { AdminWeekdayPicker } from './AdminWeekdayPicker';
import { emptyTimetableDraft, TimetableItemForm, type TimetableDraft } from './TimetableItemForm';
import { runAdminEdit } from '../sync/adminEditGate';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const toDraft = (item: EditableTimetableItem): TimetableDraft => ({
  id: item.id, weekdays: [item.weekday], title: item.title, periodNo: item.periodNo ?? null, startTime: item.startTime ?? '', endTime: item.endTime ?? '', category: item.category,
  colorKey: item.colorKey, iconKey: item.iconKey, alertMode: item.alertMode ?? 'none', alertBeforeMin: String(item.alertBeforeMin ?? 0), memo: item.memo ?? '',
});

export function TimetableEditor({ refreshKey, theme, onChanged, setId, onFormState }: { readonly refreshKey: number; readonly theme: ThemeDefinition; readonly onChanged: () => Promise<void>; readonly setId: TimetableSetId; readonly onFormState?: (state: AdminFormState) => void }) {
  const insets = useSafeAreaInsets();
  const [periods, setPeriods] = useState<readonly Period[]>([]);
  const [items, setItems] = useState<readonly EditableTimetableItem[]>([]);
  // 목록 필터(보는 요일)와 폼의 반복 요일은 서로 다른 상태다. 필터를 바꿔도 폼 값은 변하지 않는다.
  const [filterDay, setFilterDay] = useState(() => new Date().getDay());
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<TimetableDraft>(() => emptyTimetableDraft(new Date().getDay()));
  const [message, setMessage] = useState('시간표 항목을 불러오는 중이에요.');
  const [saving, setSaving] = useState(false);
  const { colors } = theme;

  const reload = () => void getDatabase().then(async (database) => ({ periods: await getPeriods(database), items: await getEditableTimetableItems(database, setId) })).then((saved) => {
    setPeriods(saved.periods); setItems(saved.items); setMessage('요일을 고르고 항목을 누르거나 추가를 눌러 주세요.');
  }).catch(() => setMessage('시간표 항목을 불러오지 못했어요.'));
  useEffect(reload, [refreshKey, setId]);

  const dayItems = itemsForDay(items, filterDay, periods);
  const loaded = draft.id != null ? items.find((item) => item.id === draft.id) : undefined;
  const dirty = formOpen && JSON.stringify(draft) !== JSON.stringify(loaded ? toDraft(loaded) : emptyTimetableDraft(filterDay));
  useEffect(() => { onFormState?.({ dirty, saving }); }, [dirty, saving, onFormState]);

  // 모달을 열 때 목록용 안내·이전 저장 결과 문구를 비워, 모달 안에는 이번 저장의 오류만 보이게 한다
  const openNew = () => { setMessage(''); setDraft(emptyTimetableDraft(filterDay)); setFormOpen(true); };
  const openItem = (item: EditableTimetableItem) => { setMessage(''); setDraft(toDraft(item)); setFormOpen(true); };
  const closeNow = () => { setFormOpen(false); setDraft(emptyTimetableDraft(filterDay)); };
  const requestClose = () => {
    if (saving) return;
    if (!dirty) { closeNow(); return; }
    Alert.alert('작성 중인 내용이 있어요', '닫으면 저장하지 않은 내용이 사라져요.', [{ text: '계속 편집', style: 'cancel' }, { text: '버리고 닫기', style: 'destructive', onPress: closeNow }]);
  };

  const memoLength = Array.from(draft.memo.trim()).length;
  const input = () => ({ title: draft.title, periodNo: draft.periodNo, startTime: draft.periodNo == null ? draft.startTime : null, endTime: draft.periodNo == null ? draft.endTime : null, category: draft.category, colorKey: draft.colorKey, iconKey: draft.iconKey, alertMode: draft.alertMode, alertBeforeMin: Number(draft.alertBeforeMin), memo: draft.memo, setId });

  const finish = async (done: string, partial: string) => {
    const savedDay = draft.weekdays[0];
    closeNow(); reload();
    if (savedDay != null && draft.id == null && !draft.weekdays.includes(filterDay)) setFilterDay(savedDay); // 새로 추가한 요일이 목록에 보이도록
    try { await onChanged(); setMessage(done); } catch { setMessage(partial); }
  };
  const save = async () => {
    if (memoLength > MAX_MEMO_LENGTH) { setMessage(`메모는 ${MAX_MEMO_LENGTH}글자까지 쓸 수 있어요. 조금 줄여 주세요.`); return; }
    if (saving) return;
    setSaving(true);
    try {
      const database = await getDatabase();
      if (draft.id) await runAdminEdit(() => updateTimetableItem(database, draft.id!, { ...input(), weekday: draft.weekdays[0] ?? -1 }));
      else await runAdminEdit(() => createTimetableItems(database, draft.weekdays, input()));
      await finish('시간표 항목을 저장했고 알림 예약도 새로 만들었어요.', '시간표 항목은 저장했지만 알림 예약에 실패했어요. 알림 준비 권한을 확인한 뒤 다시 저장해 주세요.');
    } catch (error) { setMessage(`저장하지 못했어요: ${userErrorMessage(error, '잠시 뒤 다시 시도해 주세요.')}`); }
    finally { setSaving(false); }
  };
  const remove = async () => {
    if (!draft.id || saving) return;
    setSaving(true);
    try { await runAdminEdit(async () => deleteTimetableItem(await getDatabase(), draft.id!, setId)); await finish('시간표 항목을 지우고 알림 예약도 새로 만들었어요.', '항목은 지웠지만 알림 예약을 다시 만들지 못했어요.'); }
    catch (error) { setMessage(userErrorMessage(error, '항목을 지우지 못했어요.')); } finally { setSaving(false); }
  };

  return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
    <View style={styles.titleRow}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>시간표 항목</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="항목 추가" onPress={openNew} style={[styles.add, { backgroundColor: colors.primary }]}><Text style={[styles.addText, { color: colors.onPrimary }]}>추가</Text></Pressable>
    </View>
    <AdminWeekdayPicker selected={[filterDay]} onChange={(days) => setFilterDay(days[0] ?? filterDay)} mode="single" theme={theme} label="보는 요일" />
    {dayItems.length === 0 && <Text style={[styles.hint, { color: colors.textMuted }]}>이 요일에는 등록된 항목이 없어요. 추가를 눌러 만들어 보세요.</Text>}
    {dayItems.map((item) => {
      const times = itemTimes(item, periods);
      return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${times.start ?? '시각 없음'} ${item.title} 편집`} onPress={() => openItem(item)} style={[styles.row, { borderColor: colors.border }]}>
        <Text style={[styles.time, { color: colors.textMuted }]}>{times.start ?? '--:--'}</Text>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text>
        <Text style={{ color: colors.textMuted }}>편집 ›</Text>
      </Pressable>;
    })}
    <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.textMuted }]}>{message}</Text>
    <Modal visible={formOpen} animationType="slide" onRequestClose={requestClose}>
      <View style={[styles.modal, { backgroundColor: colors.background, paddingLeft: adminSpacing.md + insets.left, paddingRight: adminSpacing.md + insets.right }]}>
        {/* Android 모달은 별도 창이라 키보드가 열려도 창이 줄지 않고 키보드 이벤트도 오지 않는다. 저장·취소를 맨 위에 두어 항상 보이게 한다(P9.7) */}
        <View style={styles.titleRow}>
          <Text accessibilityRole="header" style={[styles.heading, styles.modalTitle, { color: colors.text }]}>{draft.id ? '항목 수정' : '항목 추가'}</Text>
          <Pressable accessibilityRole="button" disabled={saving} onPress={requestClose} style={[styles.headerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}><Text style={[styles.addText, { color: colors.text }]}>취소</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={saving} onPress={() => void save()} style={[styles.headerButton, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: saving ? 0.5 : 1 }]}><Text style={[styles.addText, { color: colors.onPrimary }]}>{saving ? '저장 중' : draft.id ? '수정 저장' : '추가'}</Text></Pressable>
        </View>
        {message !== '' && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.text, fontWeight: '700' }]}>{message}</Text>}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.modalBody, { paddingBottom: styles.modalBody.paddingBottom + insets.bottom }]}>
          <TimetableItemForm draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} periods={periods} theme={theme} saving={saving} onRemove={() => void remove()} />
        </ScrollView>
      </View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.sm, padding: adminSpacing.md, width: '100%' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: adminSpacing.xs, justifyContent: 'space-between' },
  heading: { fontSize: adminFontSize.title, fontWeight: '700' },
  add: { alignItems: 'center', borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  addText: { fontSize: adminFontSize.body, fontWeight: '700' },
  row: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 1, flexDirection: 'row', gap: adminSpacing.sm, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  time: { fontSize: adminFontSize.label, fontWeight: '700', minWidth: 44 },
  rowTitle: { flex: 1, fontSize: adminFontSize.body, fontWeight: '700' },
  hint: { fontSize: adminFontSize.label },
  modal: { flex: 1, gap: adminSpacing.sm, padding: adminSpacing.md, paddingTop: adminSpacing.md * 2 },
  modalBody: { paddingBottom: adminSpacing.md * 2 },
  modalTitle: { flex: 1 },
  headerButton: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 1, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: 64, paddingHorizontal: adminSpacing.sm },
});
