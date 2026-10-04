import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { adminFontSize, adminTouchTarget } from '../theme/admin';
import { borderRadius, type ThemeDefinition } from '../theme';
import { ADMIN_SECTIONS, type AdminSectionKey } from '../utils/adminSections';

/** 관리자 영역 한 줄 메뉴(시간표 | 할 일 | 보상 | 기타). 폭이 모자라면 가로로 스크롤한다. */
export function AdminSectionMenu({ selected, onSelect, theme }: {
  readonly selected: AdminSectionKey;
  readonly onSelect: (next: AdminSectionKey) => void;
  readonly theme: ThemeDefinition;
}) {
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel="관리자 영역" contentContainerStyle={styles.row} style={styles.scroll}>
    {ADMIN_SECTIONS.map(({ key, label }) => {
      const isSelected = key === selected;
      return <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityLabel={`${label} 영역`}
        accessibilityState={{ selected: isSelected }}
        onPress={() => onSelect(key)}
        style={[styles.tab, { borderColor: theme.colors.primary, backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface }]}
      >
        <Text style={[styles.text, { color: isSelected ? theme.colors.onPrimary : theme.colors.primary }]}>{label}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0, width: '100%' },
  row: { flexGrow: 1, gap: 4 },
  tab: { alignItems: 'center', borderRadius: borderRadius.sm, borderWidth: 2, flexGrow: 1, flexBasis: 0, justifyContent: 'center', minHeight: adminTouchTarget, minWidth: 72 },
  text: { fontSize: adminFontSize.body, fontWeight: '700' },
});
