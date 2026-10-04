import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { adminFontSize, adminTouchTarget } from '../theme/admin';
import { borderRadius, type ThemeDefinition } from '../theme';
import { ADMIN_WEEKDAYS, toggleAdminWeekday, type WeekdaySelectionMode } from '../utils/adminWeekdays';

/**
 * 관리자 화면 공통 요일 선택기: 월~일 7개를 한 줄에 보여준다. 칸 폭이 모자란 작은 화면이나 큰 글자 설정에서는
 * 칸이 줄어들지 않고 가로로 스크롤해 모든 요일에 닿을 수 있다. 선택값은 저장값(일=0 … 토=6)이다.
 */
export function AdminWeekdayPicker({ selected, onChange, mode, theme, disabled = false, label = '요일' }: {
  readonly selected: readonly number[];
  readonly onChange: (next: readonly number[]) => void;
  readonly mode: WeekdaySelectionMode;
  readonly theme: ThemeDefinition;
  readonly disabled?: boolean;
  readonly label?: string;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={label} contentContainerStyle={styles.row}>
    {ADMIN_WEEKDAYS.map(({ day, label: dayLabel }) => {
      const isSelected = selected.includes(day);
      return <Pressable
        key={day}
        accessibilityRole="button"
        accessibilityLabel={`${dayLabel}요일`}
        accessibilityState={{ selected: isSelected, disabled }}
        disabled={disabled}
        onPress={() => onChange(toggleAdminWeekday(selected, day, mode))}
        style={[styles.chip, { borderColor: theme.colors.primary, backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface }, disabled && styles.dim]}
      >
        <Text style={[styles.text, { color: isSelected ? theme.colors.onPrimary : theme.colors.primary }]}>{dayLabel}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

// 칸은 겹치지 않는 실제 48×48dp를 조작 영역으로 쓴다(겹치는 hitSlop은 이웃 요일을 잘못 누르게 해서 쓰지 않는다).
// 높이는 항상 48dp다. 가로는 7칸이 360dp 폭(바깥·카드 여백 16dp씩 → 가용 약 292dp)에도 한 줄에 들어가도록 최소 40dp(7×40+간격 6=286dp)로 두고,
// 폭이 넉넉하면(411dp 이상) flexGrow로 48dp까지 넓어진다. 그보다 더 좁은 폭에서는 가로로 스크롤한다.
const CHIP_MIN_WIDTH = 40;

const styles = StyleSheet.create({
  // flexGrow: 칸이 충분하면 한 줄을 꽉 채우고, 모자라면 minWidth를 지킨 채 스크롤한다
  row: { flexGrow: 1, gap: 1 },
  chip: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flexGrow: 1, flexBasis: 0, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: CHIP_MIN_WIDTH },
  text: { fontSize: adminFontSize.body, fontWeight: '700' },
  dim: { opacity: 0.5 },
});
