import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import { StickerBoard } from '../../src/components/StickerBoard';
import { ThemePicker } from '../../src/components/ThemePicker';
import { borderRadius, fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';
import { msUntilNextLocalMidnight } from '../../src/utils/date';
import { subscribeWidgetChecksApplied } from '../../src/widgets/widgetChecksSignal';

export default function StickersScreen() {
  const { theme, selectTheme } = useActiveTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { colors } = theme;

  const refresh = useCallback(() => setRefreshKey((value) => value + 1), []);
  useFocusEffect(refresh);
  useEffect(() => subscribeWidgetChecksApplied(refresh), [refresh]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { timer = setTimeout(() => { refresh(); schedule(); }, msUntilNextLocalMidnight(new Date())); };
    schedule();
    return () => { subscription.remove(); clearTimeout(timer); };
  }, [refresh]);

  return <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
    <View style={styles.header}>
      <View style={styles.headerCopy}><Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>내 보석</Text><Text style={[styles.subtitle, { color: colors.textMuted }]}>내가 해낸 하루의 반짝임</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="꾸미기, 화면 색 바꾸기" onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.decorateButton, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.decorateText, { color: colors.primary }]}>🎨 꾸미기</Text>
      </Pressable>
    </View>
    <StickerBoard theme={theme} refreshKey={refreshKey} />
    <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.modalContainer}>
        <ThemePicker theme={theme} selectedThemeId={theme.id} onSelect={selectTheme} />
        <Pressable accessibilityRole="button" accessibilityLabel="꾸미기 닫기" onPress={() => setPickerOpen(false)} style={[styles.closeButton, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.onPrimary, fontSize: fontSize.md, fontWeight: '700' }}>닫기</Text>
        </Pressable>
      </ScrollView>
      </SafeAreaView>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, gap: 20, padding: 20, paddingBottom: 28, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, headerCopy: { flex: 1, gap: 6 },
  heading: { fontSize: 24, fontWeight: '800' }, subtitle: { fontSize: 15 },
  decorateButton: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 1, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: 12 },
  decorateText: { fontSize: 15, fontWeight: '700' }, safeArea: { flex: 1 },
  modalContainer: { flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  closeButton: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: touchTarget.minimum },
});
