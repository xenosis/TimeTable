import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, spacing, type ThemeDefinition } from '../theme';
import { SCHOOL_WEEKDAYS } from '../utils/weekdays';

export function WeekdayTabs({ selected, today, theme, onSelect }: {
  readonly selected: number;
  readonly today: number;
  readonly theme: ThemeDefinition;
  readonly onSelect: (weekday: number) => void;
}) {
  return <View style={styles.row}>
    {SCHOOL_WEEKDAYS.map(({ day, label }) => {
      const isSelected = day === selected;
      const isToday = day === today;
      return <Pressable
        key={day}
        accessibilityRole="tab"
        accessibilityState={{ selected: isSelected }}
        accessibilityLabel={`${label}요일${isToday ? ' (오늘)' : ''}`}
        onPress={() => onSelect(day)}
        style={[styles.chip, { borderColor: isSelected ? theme.colors.primary : theme.colors.border, backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface }]}
      >
        <Text style={[styles.label, { color: isSelected ? theme.colors.onPrimary : theme.colors.text }]}>{label}</Text>
        {isToday && <View style={[styles.dot, { backgroundColor: isSelected ? theme.colors.onPrimary : theme.colors.primary }]} />}
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs, width: '100%' },
  chip: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flex: 1, justifyContent: 'center', minHeight: 44 },
  label: { fontSize: 16, fontWeight: '700' },
  dot: { borderRadius: 3, height: 5, marginTop: 2, width: 5 },
});
