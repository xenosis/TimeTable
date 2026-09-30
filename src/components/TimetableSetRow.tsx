import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { maxTimetableSetNameLength, type TimetableSetSummary } from '../db/timetableSetRepository';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

type RowMode = 'idle' | 'rename' | 'confirmDelete';

/** 시간표 한 줄: 눌러서 적용하고, 이름 바꾸기와 지우기(한 번 더 확인)를 할 수 있다. */
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

  return <View style={[styles.row, { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.surface }]}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? `${set.name} 시간표, 지금 쓰는 중` : `${set.name} 시간표로 바꾸기`}
      disabled={busy || active || mode !== 'idle'}
      onPress={onApply}
      style={({ pressed }) => [styles.main, active && { backgroundColor: colors.primary }, pressed && styles.pressed]}
    >
      <Text style={[styles.name, { color: active ? colors.onPrimary : colors.text }]}>{set.name}</Text>
      <Text style={{ color: active ? colors.onPrimary : colors.textMuted }}>{active ? `지금 쓰는 중 · 항목 ${set.itemCount}개` : `항목 ${set.itemCount}개 · 누르면 적용`}</Text>
    </Pressable>
    {mode === 'idle' && <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 이름 바꾸기`} disabled={busy} onPress={() => { setName(set.name); setMode('rename'); }} style={[styles.small, { borderColor: colors.primary }]}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>이름 바꾸기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 지우기`} accessibilityState={{ disabled: active || busy }} disabled={busy || active} onPress={() => setMode('confirmDelete')} style={[styles.small, { borderColor: active ? colors.border : colors.danger }, active && styles.pressed]}>
        <Text style={{ color: active ? colors.textMuted : colors.danger, fontWeight: '700' }}>지우기</Text>
      </Pressable>
    </View>}
    {mode === 'rename' && <View style={styles.form}>
      <TextInput accessibilityLabel={`${set.name} 시간표의 새 이름`} editable={!busy} value={name} onChangeText={setName} maxLength={maxTimetableSetNameLength} placeholder="시간표 이름" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 새 이름 저장`} disabled={busy} onPress={() => void submitRename()} style={[styles.small, { backgroundColor: colors.primary, borderColor: colors.primary }]}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>저장</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 변경 취소`} disabled={busy} onPress={() => setMode('idle')} style={[styles.small, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>취소</Text></Pressable>
      </View>
    </View>}
    {mode === 'confirmDelete' && <View style={styles.form}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>{`'${set.name}' 시간표와 항목 ${set.itemCount}개를 지워요. 되돌릴 수 없어요.`}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 지우기 확인`} disabled={busy} onPress={() => void submitDelete()} style={[styles.small, { backgroundColor: colors.danger, borderColor: colors.danger }]}><Text style={{ color: colors.onPrimary, fontWeight: '700' }}>지우기</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`${set.name} 변경 취소`} disabled={busy} onPress={() => setMode('idle')} style={[styles.small, { borderColor: colors.border }]}><Text style={{ color: colors.text }}>취소</Text></Pressable>
      </View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  row: { borderRadius: borderRadius.md, borderWidth: 2, gap: spacing.xs, overflow: 'hidden', width: '100%' },
  main: { gap: 2, minHeight: touchTarget.minimum, padding: spacing.md },
  name: { fontSize: fontSize.lg, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.md },
  form: { gap: spacing.sm, paddingBottom: spacing.sm, paddingHorizontal: spacing.md },
  small: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.md },
  input: { borderRadius: borderRadius.md, borderWidth: 1, fontSize: fontSize.md, minHeight: touchTarget.minimum, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.6 },
});
