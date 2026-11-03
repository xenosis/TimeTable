import { useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { borderRadius, spacing, type ThemeDefinition } from '../theme';

/** 탭·버튼·안전 영역을 제외하고 부모가 배정한 실제 남은 높이를 잰다. */
export function ScheduleGridViewport({ theme, children, card = false }: {
  readonly theme: ThemeDefinition;
  readonly children: (height: number | undefined) => ReactNode;
  readonly card?: boolean;
}) {
  const [height, setHeight] = useState<number | undefined>(undefined);
  const inset = card ? (spacing.sm + 2) * 2 : 0;
  return <View testID="schedule-viewport" style={styles.viewport} onLayout={(event) => setHeight(event.nativeEvent.layout.height)}>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={card ? [styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }] : undefined}>
        {children(height != null ? Math.max(0, height - inset) : undefined)}
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  viewport: { flex: 1, minHeight: 0, width: '100%' },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
  card: { borderRadius: borderRadius.md, borderWidth: 2, padding: spacing.sm, width: '100%' },
});
