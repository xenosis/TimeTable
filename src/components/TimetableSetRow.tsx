import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { maxTimetableSetNameLength, type TimetableSetSummary } from '../db/timetableSetRepository';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';

type RowMode = 'idle' | 'more' | 'rename' | 'confirmDelete';

/** 시간표 한 줄(이름 · 항목 수 · 적용중). 누르면 적용하고, 이름 바꾸기와 지우기(한 번 더 확인)는 더보기(⋯)에서 연다. */
export function TimetableSetRow({ theme, set, active, busy, onApply, onRename, onDelete }: {
  readonly theme: ThemeDefinition;
  readonly set: TimetableSetSummary;
  readonly active: boolean;
  readonly busy: boolean;
  readonly onApply: () => void;
  /** 성공하면 true */
  readonly onRename: (name: string) => Promise<boolean>;
  readonly onDelete: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<RowMode>('idle');
  const [name, setName] = useState(set.name);
  const { colors } = theme;

  const submitRename = async () => { if (await onRename(name)) setMode('idle'); };
  const submitDelete = async () => { if (await onDelete()) setMode('idle'); };
  const small = (label: string, a11y: string, onPress: () => void, color: string, disabled = false, fill?: string) => (
    <Pressable accessibilityRole="button" accessibilityLabel={a11y} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.small, { borderColor: fill ?? color }, fill ? { backgroundColor: fill } : null]}>
      <Text style={[styles.smallText, { color: fill ? colors.onPrimary : color }]}>{label}</Text>
    </Pressable>
  );

  return <View style={[styles.row, { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
    <View style={styles.line}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={active ? `${set.name} 시간표, 지금 쓰는 중` : `${set.name} 시간표로 바꾸기`}
        disabled={busy || active || mode === 'rename' || mode === 'confirmDelete'}
        onPress={onApply}
        style={[styles.main, active && { backgroundColor: colors.primary }]}
      >
        <Text numberOfLines={1} style={[styles.name, { color: active ? colors.onPrimary : colors.text }]}>{set.name}</Text>
        <Text style={[styles.meta, { color: active ? colors.onPrimary : colors.textMuted }]}>{active ? `적용중 · ${set.itemCount}개` : `${set.itemCount}개`}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 더보기`} accessibilityState={{ expanded: mode !== 'idle' }} disabled={busy} onPress={() => setMode(mode === 'idle' ? 'more' : 'idle')} style={styles.more}>
        <Text style={[styles.name, { color: colors.textMuted }]}>⋯</Text>
      </Pressable>
    </View>
    {mode === 'more' && <View style={styles.actions}>
      {small('이름 바꾸기', `${set.name} 이름 바꾸기`, () => { setName(set.name); setMode('rename'); }, colors.primary, busy)}
      {small('지우기', `${set.name} 지우기`, () => setMode('confirmDelete'), active ? colors.textMuted : colors.danger, busy || active)}
    </View>}
    {mode === 'rename' && <View style={styles.form}>
      <TextInput accessibilityLabel={`${set.name} 시간표의 새 이름`} editable={!busy} value={name} onChangeText={setName} maxLength={maxTimetableSetNameLength} placeholder="시간표 이름" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
      <View style={styles.actions}>
        {small('저장', `${set.name} 새 이름 저장`, () => void submitRename(), colors.primary, busy, colors.primary)}
        {small('취소', `${set.name} 변경 취소`, () => setMode('idle'), colors.text, busy)}
      </View>
    </View>}
    {mode === 'confirmDelete' && <View style={styles.form}>
      <Text style={[styles.meta, { color: colors.text, fontWeight: '700' }]}>{`'${set.name}' 시간표와 항목 ${set.itemCount}개를 지워요. 되돌릴 수 없어요.`}</Text>
      <View style={styles.actions}>
        {small('지우기', `${set.name} 지우기 확인`, () => void submitDelete(), colors.danger, busy, colors.danger)}
        {small('취소', `${set.name} 변경 취소`, () => setMode('idle'), colors.text, busy)}
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  row: { borderRadius: borderRadius.md, borderWidth: 2, overflow: 'hidden', width: '100%' },
  line: { alignItems: 'center', flexDirection: 'row' },
  main: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: adminSpacing.xs, justifyContent: 'space-between', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  name: { flexShrink: 1, fontSize: adminFontSize.body, fontWeight: '700' },
  meta: { fontSize: adminFontSize.label },
  more: { alignItems: 'center', justifyContent: 'center', minHeight: adminTouchTarget, minWidth: adminTouchTarget },
  actions: { flexDirection: 'row', gap: adminSpacing.xs, paddingBottom: adminSpacing.xs, paddingHorizontal: adminSpacing.sm },
  form: { gap: adminSpacing.xs, paddingBottom: adminSpacing.xs, paddingHorizontal: adminSpacing.sm },
  small: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flexGrow: 1, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  smallText: { fontSize: adminFontSize.body, fontWeight: '700' },
  input: { borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
});
