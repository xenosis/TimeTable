import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { StickerBoard } from '../../src/components/StickerBoard';
import { ThemePicker } from '../../src/components/ThemePicker';
import { borderRadius, fontSize, spacing, touchTarget } from '../../src/theme';
import { useActiveTheme } from '../../src/theme/provider';

export default function StickersScreen() {
  const { theme, selectTheme } = useActiveTheme();
  const [refreshKey, setRefreshKey] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { colors } = theme;

  useFocusEffect(useCallback(() => { setRefreshKey((value) => value + 1); }, []));

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: colors.background }]}>
    <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>내 보석판 💎</Text>
    <StickerBoard theme={theme} refreshKey={refreshKey} />
    <Pressable accessibilityRole="button" accessibilityLabel="꾸미기, 화면 색 바꾸기" onPress={() => setPickerOpen(true)} style={[styles.decorateButton, { borderColor: colors.primary }]}>
      <Text style={[styles.decorateText, { color: colors.primary }]}>🎨 꾸미기</Text>
    </Pressable>
    <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
      <ScrollView contentContainerStyle={[styles.modalContainer, { backgroundColor: colors.background }]}>
        <ThemePicker theme={theme} selectedThemeId={theme.id} onSelect={selectTheme} />
        <Pressable accessibilityRole="button" accessibilityLabel="꾸미기 닫기" onPress={() => setPickerOpen(false)} style={[styles.closeButton, { backgroundColor: colors.primary }]}>
          <Text style={{ color: colors.onPrimary, fontSize: fontSize.md, fontWeight: '700' }}>닫기</Text>
        </Pressable>
      </ScrollView>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  heading: { fontSize: fontSize.xl, fontWeight: '700', textAlign: 'center' },
  decorateButton: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, justifyContent: 'center', minHeight: touchTarget.minimum, paddingHorizontal: spacing.lg, width: '100%' },
  decorateText: { fontSize: fontSize.md, fontWeight: '700' },
  modalContainer: { flexGrow: 1, gap: spacing.md, padding: spacing.lg },
  closeButton: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: touchTarget.minimum },
});
