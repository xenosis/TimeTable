import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, fontSize, spacing, themes } from '../theme';
import type { ThemeDefinition } from '../theme';

type ThemePickerProps = {
  selectedThemeId: string;
  onSelect: (themeId: string) => Promise<void>;
};

function ThemePreview({ theme }: { theme: ThemeDefinition }) {
  const examples = theme.categories.slice(0, 3);
  return (
    <View style={[styles.preview, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
      <Text style={[styles.previewTitle, { color: theme.colors.text }]}>오늘의 시간표</Text>
      <Text style={[styles.previewText, { color: theme.colors.textMuted }]}>재미있게 하루를 시작해요</Text>
      <View style={styles.chips}>
        {examples.map((category) => (
          <View key={category.key} style={[styles.chip, { backgroundColor: category.backgroundColor }]}>
            <Text style={[styles.chipText, { color: category.textColor }]}>{category.label}</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.shape, { color: theme.decorations.stickerAccent }]} accessibilityLabel="스티커 미리보기">
        {theme.decorations.stickerShape === 'heart' ? '♥' : theme.decorations.stickerShape === 'star' ? '★' : '●'}
      </Text>
    </View>
  );
}

export function ThemePicker({ selectedThemeId, onSelect }: ThemePickerProps) {
  const [error, setError] = useState<string | null>(null);
  const chooseTheme = async (themeId: string) => {
    setError(null);
    try { await onSelect(themeId); } catch { setError('색을 바꾸지 못했어요. 다시 눌러 주세요.'); }
  };
  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.heading}>내가 고르는 화면 색</Text>
      <Text style={styles.description}>마음에 드는 카드를 누르면 바로 바뀌어요.</Text>
      {themes.map((theme) => {
        const selected = theme.id === selectedThemeId;
        return (
          <Pressable
            key={theme.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={`${theme.name} 테마 선택`}
            onPress={() => void chooseTheme(theme.id)}
            style={({ pressed }) => [styles.option, { borderColor: selected ? theme.colors.primary : theme.colors.border }, pressed && styles.pressed]}
          >
            <View style={styles.optionHeader}>
              <View style={[styles.selectionDot, { borderColor: theme.colors.primary, backgroundColor: selected ? theme.colors.primary : theme.colors.surface }]} />
              <View style={styles.optionCopy}>
                <Text style={[styles.optionName, { color: theme.colors.text }]}>{theme.name}</Text>
                <Text style={[styles.optionDescription, { color: theme.colors.textMuted }]}>{theme.description}</Text>
              </View>
              <Text style={[styles.selectedLabel, { color: selected ? theme.colors.primary : theme.colors.textMuted }]}>{selected ? '선택됨' : '선택하기'}</Text>
            </View>
            <ThemePreview theme={theme} />
          </Pressable>
        );
      })}
      {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, width: '100%' },
  heading: { fontSize: fontSize.lg, fontWeight: '700' },
  description: { fontSize: fontSize.sm, color: '#475569' },
  option: { borderWidth: 3, borderRadius: borderRadius.lg, padding: spacing.md, gap: spacing.md },
  pressed: { opacity: 0.78 },
  optionHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  selectionDot: { borderRadius: 14, borderWidth: 3, height: 28, width: 28 },
  optionCopy: { flex: 1 },
  optionName: { fontSize: fontSize.md, fontWeight: '700' },
  optionDescription: { fontSize: fontSize.sm },
  selectedLabel: { fontSize: fontSize.sm, fontWeight: '700' },
  preview: { borderRadius: borderRadius.md, borderWidth: 1, padding: spacing.md },
  previewTitle: { fontSize: fontSize.md, fontWeight: '700' },
  previewText: { fontSize: fontSize.sm, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  chip: { borderRadius: borderRadius.full, minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md },
  chipText: { fontSize: fontSize.sm, fontWeight: '700' },
  shape: { alignSelf: 'flex-end', fontSize: fontSize.xxl, lineHeight: fontSize.xxl, marginTop: spacing.sm },
  error: { color: '#B91C1C', fontSize: fontSize.sm, fontWeight: '700' },
});
