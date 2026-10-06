import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { useAccount } from '../store/accountStore';
import { accountSummary } from './AccountPanel';

/**
 * 아빠 계정으로 로그인한 기기의 첫 화면. 딸 화면(오늘·시간표·보석) 대신 보인다.
 * 시간표를 원격으로 고치는 실제 아빠 화면은 서버 동기화(P6.6) 뒤 P6.8에서 이 자리에 들어온다.
 */
export function ParentHome({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  return <View style={styles.container}>
    <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: theme.colors.text }]}>아빠 화면</Text>
      <Text style={[styles.body, { color: theme.colors.text }]}>{accountSummary(account)}</Text>
      <Text style={[styles.body, { color: theme.colors.textMuted }]}>딸 폰의 시간표·할 일을 여기서 바로 고치는 화면은 준비 중이에요. 지금은 관리자 설정에서 로그아웃하면 이 폰을 아이 화면으로 쓸 수 있어요.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="관리자 설정 열기" onPress={() => router.push('/manage')} style={({ pressed }) => [styles.button, { backgroundColor: theme.colors.primary, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>관리자 설정 열기</Text>
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: adminSpacing.md },
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.sm, padding: adminSpacing.md },
  heading: { fontSize: adminFontSize.title, fontWeight: '800' },
  body: { fontSize: adminFontSize.body, lineHeight: 22 },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
