import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { maxTimetableSetNameLength } from '../db/timetableSetRepository';
import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';

/** 새 시간표 만들기: 이름을 쓰고 빈 시간표로 시작할지, 지금 쓰는 시간표를 복사해서 시작할지 고른다. 접힌 영역 안에서만 보인다. */
export function TimetableSetCreate({ theme, activeName, busy, onCreate }: {
  readonly theme: ThemeDefinition;
  readonly activeName: string;
  readonly busy: boolean;
  /** 성공하면 true(입력칸을 비운다) */
  readonly onCreate: (name: string, copyFromActive: boolean) => Promise<boolean>;
}) {
  const [name, setName] = useState('');
  const { colors } = theme;
  const submit = async (copyFromActive: boolean) => { if (await onCreate(name, copyFromActive)) setName(''); };

  return <View style={styles.wrap}>
    <TextInput accessibilityLabel="만들 시간표 이름" editable={!busy} value={name} onChangeText={setName} maxLength={maxTimetableSetNameLength} placeholder="예: 2학기, 여름방학" placeholderTextColor={colors.textMuted} style={[styles.input, { borderColor: colors.border, color: colors.text }]} />
    <View style={styles.buttons}>
      <Pressable accessibilityRole="button" accessibilityLabel="빈 시간표로 만들기" disabled={busy} onPress={() => void submit(false)} style={[styles.button, { borderColor: colors.primary, backgroundColor: colors.surface }]}>
        <Text style={[styles.text, { color: colors.primary }]}>빈 시간표</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${activeName} 시간표를 복사해서 만들기`} disabled={busy} onPress={() => void submit(true)} style={[styles.button, { borderColor: colors.primary, backgroundColor: colors.primary }]}>
        <Text style={[styles.text, { color: colors.onPrimary }]}>{`'${activeName}' 복사`}</Text>
      </Pressable>
    </View>
    <Text style={[styles.hint, { color: colors.textMuted }]}>만든 시간표는 자동으로 적용되지 않아요. 목록에서 눌러야 적용돼요.</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: adminSpacing.xs, width: '100%' },
  input: { borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  buttons: { flexDirection: 'row', gap: adminSpacing.xs },
  button: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flex: 1, justifyContent: 'center', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.sm },
  text: { fontSize: adminFontSize.body, fontWeight: '700' },
  hint: { fontSize: adminFontSize.label },
});
