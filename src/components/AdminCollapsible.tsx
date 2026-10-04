import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { borderRadius, type ThemeDefinition } from '../theme';

/** 필요할 때만 펼치는 보조 영역. 처음에는 제목 한 줄만 보이고, 펼쳐도 저절로 무언가를 실행하지 않는다. */
export function AdminCollapsible({ title, theme, children, initiallyOpen = false }: {
  readonly title: string;
  readonly theme: ThemeDefinition;
  readonly children: ReactNode;
  readonly initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  return <View style={[styles.box, { borderColor: theme.colors.border }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={styles.header}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      <Text style={[styles.chevron, { color: theme.colors.textMuted }]}>{open ? '접기 ▲' : '열기 ▼'}</Text>
    </Pressable>
    {open && <View style={styles.body}>{children}</View>}
  </View>;
}

const styles = StyleSheet.create({
  box: { borderRadius: borderRadius.md, borderWidth: 1, width: '100%' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.md },
  title: { fontSize: adminFontSize.body, fontWeight: '700' },
  chevron: { fontSize: adminFontSize.label },
  body: { gap: adminSpacing.sm, padding: adminSpacing.sm, paddingTop: 0 },
});
