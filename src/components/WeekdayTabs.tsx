import { Pressable, StyleSheet, Text, View } from 'react-native';

import { borderRadius, fontSize, spacing, touchTarget, type ThemeDefinition } from '../theme';
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
  chip: { alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 2, flex: 1, justifyContent: 'center', minHeight: touchTarget.minimum },
  label: { fontSize: fontSize.md, fontWeight: '700' },
  dot: { borderRadius: 4, height: 6, marginTop: 4, width: 6 },
});
