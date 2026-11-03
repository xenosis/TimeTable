import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { TimetableItem } from '../db/timetableRepository';
import type { ThemeDefinition } from '../theme';
import type { GridDay } from '../utils/timetableGrid';

export function SchoolScheduleSummary({ days, expanded, onToggle, theme }: {
  readonly days: readonly GridDay<TimetableItem>[];
  readonly expanded: boolean;
  readonly onToggle: () => void;
  readonly theme: ThemeDefinition;
}) {
  if (!days.some(({ items }) => items.some((item) => item.category === 'school'))) return null;
  return <View style={styles.wrap}>
    <Pressable accessibilityRole="button" accessibilityLabel={`정규수업 ${expanded ? '접기' : '펼치기'}`} accessibilityState={{ expanded }} onPress={onToggle} style={[styles.button, { borderColor: theme.colors.border }]}>
      <Text style={[styles.label, { color: theme.colors.primary }]}>정규수업 {expanded ? '접기 ▴' : '펼치기 ▾'}</Text>
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 6 },
  button: { minHeight: 36, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, justifyContent: 'center' },
  label: { fontSize: 14, fontWeight: '700' },
});
