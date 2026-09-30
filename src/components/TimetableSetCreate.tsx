import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { maxTimetableSetNameLength } from '../db/timetableSetRepository';
import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';

/** 새 시간표 만들기: 이름을 쓰고 빈 시간표로 시작할지, 지금 쓰는 시간표를 복사해서 시작할지 고른다. */
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
    <Text style={[styles.label, { color: colors.text }]}>새 시간표 만들기</Text>
    <TextInput
      accessibilityLabel="만들 시간표 이름"
      editable={!busy}
      value={name}
      onChangeText={setName}
      maxLength={maxTimetableSetNameLength}
      placeholder="예: 2학기, 여름방학"
      placeholderTextColor={colors.textMuted}
      style={[styles.input, { borderColor: colors.border, color: colors.text }]}
    />
    <View style={styles.buttons}>
      <Pressable accessibilityRole="button" accessibilityLabel="빈 시간표로 만들기" disabled={busy} onPress={() => void submit(false)} style={({ pressed }) => [styles.button, { borderColor: colors.primary, backgroundColor: colors.surface }, (pressed || busy) && styles.pressed]}>
        <Text style={{ color: colors.primary, fontWeight: '700' }}>빈 시간표로 만들기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`${activeName} 시간표를 복사해서 만들기`} disabled={busy} onPress={() => void submit(true)} style={({ pressed }) => [styles.button, { borderColor: colors.primary, backgroundColor: colors.primary }, (pressed || busy) && styles.pressed]}>
        <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{`'${activeName}' 복사해서 만들기`}</Text>
      </Pressable>
    </View>
    <Text style={{ color: colors.textMuted }}>만든 시간표는 자동으로 적용되지 않아요. 아래 목록에서 눌러야 적용돼요.</Text>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, width: '100%' },
  label: { fontSize: fontSize.md, fontWeight: '700' },
  input: { borderRadius: borderRadius.md, borderWidth: 1, fontSize: fontSize.md, minHeight: touchTarget.minimum, paddingHorizontal: spacing.md },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  button: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, flexGrow: 1, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.md },
  pressed: { opacity: 0.6 },
});
