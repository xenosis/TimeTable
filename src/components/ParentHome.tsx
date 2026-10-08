import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { useAccount } from '../store/accountStore';
import { accountSummary } from './AccountPanel';
import { ParentStatusCard } from './ParentStatusCard';
import { ParentWeeklyReportCard } from './ParentWeeklyReportCard';

/**
 * 아빠 계정으로 로그인한 기기의 첫 화면(P6.8). 딸 화면(오늘·시간표·보석) 대신 보인다.
 * 딸 오늘 현황·보석·딸 폰 마지막 동기화 시각을 보여 주고, 시간표·할 일 편집은 관리자 설정(서버에 먼저 저장, P6.15)으로 연다.
 * 이 폰에서는 딸 알림·알람을 울리지 않는다(notifications/parentDeviceAlarms.ts).
 */
export function ParentHome({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  const familyId = account.kind === 'signedIn' ? account.membership?.familyId ?? null : null;
  const { colors } = theme;
  return <ScrollView contentContainerStyle={styles.container}>
    <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>아빠 화면</Text>
    <Text style={[styles.caption, { color: colors.textMuted }]}>{accountSummary(account)}</Text>
    {familyId ? <ParentStatusCard theme={theme} familyId={familyId} /> : null}
    {familyId ? <ParentWeeklyReportCard theme={theme} familyId={familyId} /> : null}
    <View style={[styles.card, { backgroundColor: theme.decorations.cardBackground, borderColor: theme.decorations.cardBorder }]}>
      <Text accessibilityRole="header" style={[styles.heading, { color: colors.text }]}>시간표·할 일 고치기</Text>
      <Text style={[styles.body, { color: colors.textMuted }]}>여기서 고친 내용은 서버에 바로 저장돼요. 딸 폰에서 앱이 실행 중이고 인터넷에 연결돼 있으면 자동으로 반영돼요. 이 폰에서는 딸 알림·알람이 울리지 않아요.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="관리자 설정 열기" onPress={() => router.push('/manage')} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary, opacity: pressed ? 0.7 : 1 }]}>
        <Text style={[styles.buttonText, { color: colors.onPrimary }]}>시간표·할 일 편집 열기</Text>
      </Pressable>
    </View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { gap: adminSpacing.md, padding: adminSpacing.md },
  title: { fontSize: adminFontSize.title + 3, fontWeight: '800' },
  caption: { fontSize: adminFontSize.label },
  card: { borderRadius: borderRadius.lg, borderWidth: 2, gap: adminSpacing.sm, padding: adminSpacing.md },
  heading: { fontSize: adminFontSize.title, fontWeight: '800' },
  body: { fontSize: adminFontSize.body, lineHeight: 22 },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
});
