import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Period } from '../db/periodRepository';
import { MAX_MEMO_LENGTH } from '../db/timetableRepository';
import { timetableCategories, type TimetableCategory } from '../db/types';
import { borderRadius, colorKeys, iconKeys, resolveThemeColor, resolveThemeIcon, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { formatTimeInput } from '../utils/timeInput';
import { AdminCollapsible } from './AdminCollapsible';
import { AdminWeekdayPicker } from './AdminWeekdayPicker';

export type TimetableDraft = {
  readonly id?: number; readonly weekdays: readonly number[]; readonly title: string; readonly periodNo: number | null; readonly startTime: string; readonly endTime: string;
  readonly category: TimetableCategory; readonly colorKey: (typeof colorKeys)[number]; readonly iconKey: (typeof iconKeys)[number];
  readonly alertMode: 'none' | 'notify' | 'alarm'; readonly alertBeforeMin: string; readonly memo: string;
};
export const emptyTimetableDraft = (weekday: number): TimetableDraft => ({ weekdays: [weekday], title: '', periodNo: null, startTime: '', endTime: '', category: 'academy', colorKey: 'other', iconKey: 'other', alertMode: 'none', alertBeforeMin: '0', memo: '' });

const categoryLabels: Record<TimetableCategory, string> = { school: '학교', academy: '학원', care: '돌봄', life: '생활' };
const alertLabels = { none: '없음', notify: '알림', alarm: '알람' } as const;

/** 시간표 항목 하나를 입력하는 폼(모달 안에서 쓴다). 색·아이콘은 현재 값만 보이고, 눌렀을 때 한 줄 가로 목록에서 고른다. */
export function TimetableItemForm({ draft, onChange, periods, theme, saving, onSave, onCancel, onRemove }: {
  readonly draft: TimetableDraft; readonly onChange: (patch: Partial<TimetableDraft>) => void; readonly periods: readonly Period[]; readonly theme: ThemeDefinition;
  readonly saving: boolean; readonly onSave: () => void; readonly onCancel: () => void; readonly onRemove: () => void;
}) {
  const { colors } = theme;
  const [picker, setPicker] = useState<'color' | 'icon' | null>(null);
  const memoLength = Array.from(draft.memo.trim()).length; // 저장할 때 앞뒤 공백은 지우므로 같은 기준으로 센다
  const currentColor = resolveThemeColor(theme, draft.colorKey);
  const currentIcon = resolveThemeIcon(theme, draft.iconKey);

  const choice = (label: string, selected: boolean, onPress: () => void, a11y = label) => (
    <Pressable key={a11y} accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ selected }} disabled={saving} onPress={onPress} style={[styles.choice, { borderColor: colors.primary }, selected && { backgroundColor: colors.primary }]}>
      <Text style={[styles.text, { color: selected ? colors.onPrimary : colors.primary }]}>{label}</Text>
    </Pressable>
  );
  const action = (label: string, onPress: () => void, background: string, textColor: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={saving} onPress={onPress} style={[styles.action, { backgroundColor: background }, saving && styles.dim]}><Text style={[styles.text, { color: textColor }]}>{label}</Text></Pressable>
  );

  return <View style={styles.form}>
    <TextInput accessibilityLabel="과목 이름" editable={!saving} value={draft.title} onChangeText={(title) => onChange({ title })} placeholder="과목 또는 일정" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
    <TextInput accessibilityLabel="메모" editable={!saving} value={draft.memo} onChangeText={(memo) => onChange({ memo })} placeholder="메모 (예: 16:45 차 타고 이동)" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
    <Text style={[styles.hint, { color: memoLength > MAX_MEMO_LENGTH ? colors.danger : colors.textMuted }]}>{`메모 ${memoLength}/${MAX_MEMO_LENGTH}글자`}</Text>

    <Text style={[styles.label, { color: colors.text }]}>{draft.id ? '요일 (한 요일씩 수정)' : '반복 요일'}</Text>
    <AdminWeekdayPicker selected={draft.weekdays} onChange={(weekdays) => onChange({ weekdays: [...weekdays] })} mode={draft.id ? 'single' : 'multi'} theme={theme} disabled={saving} label="반복할 요일" />

    <Text style={[styles.label, { color: colors.text }]}>시간</Text>
    <View style={styles.inline}>
      {choice('교시', draft.periodNo != null, () => onChange({ periodNo: periods[0]?.periodNo ?? null }))}
      {choice('직접 입력', draft.periodNo == null, () => onChange({ periodNo: null }))}
    </View>
    {draft.periodNo != null && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inline}>{periods.map((period) => choice(`${period.periodNo}교시`, draft.periodNo === period.periodNo, () => onChange({ periodNo: period.periodNo })))}</ScrollView>}
    {draft.periodNo == null && <View style={styles.inline}>
      <TextInput accessibilityLabel="시작 시간" editable={!saving} value={draft.startTime} onChangeText={(value) => onChange({ startTime: formatTimeInput(value) })} placeholder="시작 0930" maxLength={5} keyboardType="number-pad" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
      <TextInput accessibilityLabel="종료 시간" editable={!saving} value={draft.endTime} onChangeText={(value) => onChange({ endTime: formatTimeInput(value) })} placeholder="종료 0940" maxLength={5} keyboardType="number-pad" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
    </View>}

    <Text style={[styles.label, { color: colors.text }]}>색 · 아이콘</Text>
    <View style={styles.inline}>
      <Pressable accessibilityRole="button" accessibilityLabel={`색 ${currentColor.label} 바꾸기`} disabled={saving} onPress={() => setPicker(picker === 'color' ? null : 'color')} style={[styles.summary, { backgroundColor: currentColor.backgroundColor, borderColor: colors.border }]}><Text style={[styles.text, { color: currentColor.textColor }]}>색: {currentColor.label} ▾</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`아이콘 ${currentIcon.glyph} 바꾸기`} disabled={saving} onPress={() => setPicker(picker === 'icon' ? null : 'icon')} style={[styles.summary, { borderColor: colors.border }]}><Text style={[styles.text, { color: colors.text }]}>아이콘: {currentIcon.glyph} ▾</Text></Pressable>
    </View>
    {picker === 'color' && <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="색 목록" contentContainerStyle={styles.inline}>{colorKeys.map((key) => {
      const color = resolveThemeColor(theme, key);
      return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`색 ${color.label}`} accessibilityState={{ selected: draft.colorKey === key }} disabled={saving} onPress={() => { onChange({ colorKey: key }); setPicker(null); }} style={[styles.swatch, { backgroundColor: color.backgroundColor }, draft.colorKey === key && styles.outline]}><Text style={[styles.text, { color: color.textColor }]}>{color.label}</Text></Pressable>;
    })}</ScrollView>}
    {picker === 'icon' && <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="아이콘 목록" contentContainerStyle={styles.inline}>{iconKeys.map((key) => {
      const icon = resolveThemeIcon(theme, key);
      return choice(icon.glyph, draft.iconKey === key, () => { onChange({ iconKey: key }); setPicker(null); }, `아이콘 ${icon.glyph}`);
    })}</ScrollView>}

    <Text style={[styles.label, { color: colors.text }]}>종류</Text>
    <View style={styles.inline}>{timetableCategories.map((category) => choice(categoryLabels[category], draft.category === category, () => onChange({ category })))}</View>
    <Text style={[styles.label, { color: colors.text }]}>알림</Text>
    <View style={styles.inline}>
      {(['none', 'notify', 'alarm'] as const).map((mode) => choice(alertLabels[mode], draft.alertMode === mode, () => onChange({ alertMode: mode }), `알림 방식 ${alertLabels[mode]}`))}
      <TextInput accessibilityLabel="미리 알림 분" editable={!saving} value={draft.alertBeforeMin} onChangeText={(alertBeforeMin) => onChange({ alertBeforeMin })} keyboardType="number-pad" placeholder="미리 알림 분" placeholderTextColor={colors.textMuted} style={[styles.input, { color: colors.text }]} />
    </View>
    <AdminCollapsible title="도움말" theme={theme}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>알림: 상단에 알려 줘요. 알람: 소리가 나고 잠금 화면에도 보여요. 바탕화면 위젯에는 학교 일정이 나오지 않아요. 학원·방과후는 학원, 돌봄교실은 돌봄으로 골라 주세요.</Text>
    </AdminCollapsible>

    <View style={styles.inline}>
      {action(draft.id ? '수정 저장' : '추가', onSave, colors.primary, colors.onPrimary)}
      {action('취소', onCancel, colors.surface, colors.text)}
      {draft.id != null && action('삭제', onRemove, colors.danger, colors.onPrimary)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  form: { gap: adminSpacing.sm, width: '100%' },
  label: { fontSize: adminFontSize.label, fontWeight: '700' },
  hint: { fontSize: adminFontSize.label },
  text: { fontSize: adminFontSize.body, fontWeight: '700' },
  inline: { alignItems: 'center', flexDirection: 'row', gap: adminSpacing.xs },
  input: { borderColor: '#94A3B8', borderRadius: borderRadius.sm, borderWidth: 1, flex: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, minWidth: 96, paddingHorizontal: adminSpacing.sm },
  choice: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  summary: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.xs },
  swatch: { alignItems: 'center', borderRadius: borderRadius.sm, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: 64, paddingHorizontal: adminSpacing.sm },
  outline: { borderColor: '#0F172A', borderWidth: 3 },
  action: { alignItems: 'center', borderRadius: borderRadius.sm, flexGrow: 1, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  dim: { opacity: 0.5 },
});
