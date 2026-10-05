import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { themes, type ThemeDefinition } from '../theme';
import { ThemeMascot } from './ThemeMascot';

type ThemePickerProps = {
  readonly theme: ThemeDefinition;
  readonly selectedThemeId: string;
  readonly onSelect: (themeId: string) => Promise<void>;
};
const orderedThemes = themes;

export function ThemePicker({ theme: activeTheme, selectedThemeId, onSelect }: ThemePickerProps) {
  const { width, fontScale } = useWindowDimensions();
  const singleColumn = width < 350 || fontScale > 1.3;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const chooseTheme = async (themeId: string) => {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try { await onSelect(themeId); }
    catch { setError('테마를 저장하지 못했어요. 다시 눌러 주세요.'); }
    finally { saving.current = false; setBusy(false); }
  };
  return <View style={styles.container}>
    <Text accessibilityRole="header" style={[styles.heading, { color: activeTheme.colors.text }]}>함께할 친구 고르기</Text>
    <Text style={[styles.description, { color: activeTheme.colors.textMuted }]}>마음에 드는 테마를 누르면 바로 바뀌어요.</Text>
    <View style={styles.grid}>
      {orderedThemes.map((theme) => {
        const selected = theme.id === selectedThemeId;
        return <Pressable key={theme.id} accessibilityRole="radio" accessibilityState={{ selected, disabled: busy }} accessibilityLabel={`${theme.name} 테마 선택`} disabled={busy} onPress={() => void chooseTheme(theme.id)} style={({ pressed }) => [styles.option, singleColumn && styles.fullWidth, { backgroundColor: theme.colors.background, borderColor: selected ? theme.colors.primary : theme.colors.border, opacity: pressed ? 0.75 : 1 }]}>
          <View style={[styles.preview, { backgroundColor: theme.character?.softColor ?? theme.colors.surface }]}>
            {theme.character ? <ThemeMascot theme={theme} size={132} /> : <Text accessible={false} style={[styles.classicIcon, { color: theme.colors.primary }]}>{theme.id === 'daylight' ? '☀' : '☁'}</Text>}
            <View style={styles.chips}>{theme.categories.slice(0, 3).map((category) => <View key={category.key} style={[styles.chip, { backgroundColor: category.backgroundColor }]}><Text style={[styles.chipText, { color: category.textColor }]}>{category.label}</Text></View>)}</View>
          </View>
          <Text style={[styles.optionName, { color: theme.colors.text }]}>{theme.name}</Text>
          <Text style={[styles.optionDescription, { color: theme.colors.textMuted }]}>{theme.description}</Text>
          <View style={[styles.selection, { backgroundColor: selected ? theme.colors.primary : theme.colors.surface }]}><Text style={[styles.selectionText, { color: selected ? theme.colors.onPrimary : theme.colors.textMuted }]}>{selected ? '✓ 함께하는 중' : '이 테마 고르기'}</Text></View>
        </Pressable>;
      })}
    </View>
    {busy ? <Text accessibilityLiveRegion="polite" style={[styles.description, { color: activeTheme.colors.text }]}>테마를 저장하고 있어요…</Text> : null}
    {error ? <Text accessibilityLiveRegion="polite" style={[styles.description, { color: activeTheme.colors.text }]}>⚠️ {error}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 14, width: '100%' }, heading: { fontSize: 21, fontWeight: '800' }, description: { fontSize: 15, lineHeight: 23 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, option: { flexBasis: '45%', flexGrow: 1, borderWidth: 3, borderRadius: 24, padding: 12, gap: 10 }, fullWidth: { flexBasis: '100%' },
  preview: { borderRadius: 18, alignItems: 'center', paddingVertical: 8, gap: 4 }, classicIcon: { height: 132, fontSize: 80, textAlignVertical: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }, chip: { paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9 }, chipText: { fontSize: 12, fontWeight: '700' },
  optionName: { fontSize: 17, fontWeight: '800' }, optionDescription: { fontSize: 13, lineHeight: 20 },
  selection: { alignSelf: 'stretch', minHeight: 40, padding: 8, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, selectionText: { fontSize: 13, fontWeight: '700' },
});
