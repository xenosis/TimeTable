import { useEffect, useState } from 'react';
import { Alert, BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

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

const toDraft = (item: EditableTimetableItem): TimetableDraft => ({
  id: item.id, weekdays: [item.weekday], title: item.title, periodNo: item.periodNo ?? null, startTime: item.startTime ?? '', endTime: item.endTime ?? '', category: item.category,
  colorKey: item.colorKey, iconKey: item.iconKey, alertMode: item.alertMode ?? 'none', alertBeforeMin: String(item.alertBeforeMin ?? 0), memo: item.memo ?? '',
});

export function TimetableEditor({ refreshKey, theme, onChanged, setId, onFormState }: { readonly refreshKey: number; readonly theme: ThemeDefinition; readonly onChanged: () => Promise<void>; readonly setId: TimetableSetId; readonly onFormState?: (state: AdminFormState) => void }) {
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
  // 편집 폼은 관리자 화면 안에서 열리므로(키보드 처리 공유) 휴대폰 뒤로 가기는 화면을 떠나지 않고 폼 닫기로 쓴다
  useEffect(() => {
    if (!formOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { requestClose(); return true; });
    return () => subscription.remove();
  });

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
  // 삭제는 되돌릴 수 없어 한 번 더 묻는다(P9.7 리뷰: 아래 버튼을 실수로 누르는 경우)
  const confirmRemove = () => {
    if (!draft.id || saving) return;
    Alert.alert('이 항목을 지울까요?', `${draft.title.trim() || '이 항목'}을(를) 시간표에서 지워요. 되돌릴 수 없어요.`, [{ text: '취소', style: 'cancel' }, { text: '지우기', style: 'destructive', onPress: () => void remove() }]);
  };
  const remove = async () => {
    if (!draft.id || saving) return;
    setSaving(true);
    try { await runAdminEdit(async () => deleteTimetableItem(await getDatabase(), draft.id!, setId)); await finish('시간표 항목을 지우고 알림 예약도 새로 만들었어요.', '항목은 지웠지만 알림 예약을 다시 만들지 못했어요.'); }
    catch (error) { setMessage(userErrorMessage(error, '항목을 지우지 못했어요.')); } finally { setSaving(false); }
  };

  const actionButtons = <>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving }} disabled={saving} onPress={requestClose} style={[styles.headerButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: saving ? 0.5 : 1 }]}><Text style={[styles.addText, { color: colors.text }]}>취소</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: saving, busy: saving }} disabled={saving} onPress={() => void save()} style={[styles.headerButton, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: saving ? 0.5 : 1 }]}><Text style={[styles.addText, { color: colors.onPrimary }]}>{saving ? '저장 중' : draft.id ? '수정 저장' : '추가'}</Text></Pressable>
  </>;

  // 편집 폼은 목록 자리에서 열린다. 별도 창(Modal)은 Android에서 키보드에 맞춰 줄지 않아 아래 입력칸이 가려졌다(P9.7 리뷰 M1).
  // 관리자 화면의 KeyboardAvoidingView 안에 있어야 할 일 폼처럼 아래 칸도 키보드 위로 스크롤된다
  if (formOpen) {
    return <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
      <View style={styles.titleRow}>
        <Text accessibilityRole="header" style={[styles.heading, styles.formTitle, { color: colors.text }]}>{draft.id ? '항목 수정' : '항목 추가'}</Text>
        {actionButtons}
      </View>
      {message !== '' && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: colors.text, fontWeight: '700' }]}>{message}</Text>}
      <TimetableItemForm draft={draft} onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))} periods={periods} theme={theme} saving={saving} onRemove={confirmRemove} />
      <View style={styles.bottomActions}>{actionButtons}</View>
    </View>;
  }

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
  formTitle: { flex: 1 },
  bottomActions: { flexDirection: 'row', gap: adminSpacing.xs, justifyContent: 'flex-end' },
  headerButton: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 1, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: 64, paddingHorizontal: adminSpacing.sm },
});
