import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { borderRadius, type ThemeDefinition } from '../theme';
import { adminFontSize, adminSpacing, adminTouchTarget } from '../theme/admin';
import { signIn, signOut, type AccountState } from '../server/account';
import { setAccount, useAccount } from '../store/accountStore';
import { userErrorMessage } from '../utils/userErrorMessage';

/** 관리자 '기타' 영역의 서버 연결. 로그인하지 않아도 앱은 지금처럼 이 폰에만 저장하며 쓴다. */
export function AccountPanel({ theme }: { readonly theme: ThemeDefinition }) {
  const account = useAccount();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const run = async (action: () => Promise<AccountState>, done: string) => {
    setBusy(true);
    setMessage('');
    try {
      setAccount(await action());
      setPassword('');
      setMessage(done);
    } catch (error) {
      setMessage(userErrorMessage(error, '처리하지 못했어요. 잠시 뒤 다시 해 주세요.'));
    } finally {
      setBusy(false);
    }
  };

  const buttonStyle = [styles.button, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }];
  return <View style={styles.container}>
    <Text accessibilityLiveRegion="polite" style={[styles.status, { color: theme.colors.text }]}>{accountSummary(account)}</Text>
    {account.kind === 'signedIn' ? (
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(signOut, '이 폰에서 로그아웃했어요. 앱은 계속 이 폰에 저장하며 쓸 수 있어요.')} style={buttonStyle}>
        <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{busy ? '처리 중' : '로그아웃'}</Text>
      </Pressable>
    ) : <>
      <TextInput accessibilityLabel="이메일" editable={!busy} value={email} onChangeText={setEmail} placeholder="이메일" autoCapitalize="none" autoComplete="email" keyboardType="email-address" style={styles.input} />
      <TextInput accessibilityLabel="비밀번호" editable={!busy} value={password} onChangeText={setPassword} placeholder="비밀번호" secureTextEntry autoCapitalize="none" style={styles.input} />
      <Pressable accessibilityRole="button" disabled={busy || !email.trim() || !password} onPress={() => void run(() => signIn(email, password), '로그인했어요.')} style={buttonStyle}>
        <Text style={[styles.buttonText, { color: theme.colors.onPrimary }]}>{busy ? '로그인 중' : '로그인'}</Text>
      </Pressable>
    </>}
    {!!message && <Text accessibilityLiveRegion="polite" style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>}
  </View>;
}

/** 지금 상태를 한 줄로 설명한다. 테스트에서 문구를 확인할 수 있게 내보낸다. */
export function accountSummary(account: AccountState): string {
  if (account.kind === 'checking') return '로그인 상태를 확인하는 중이에요.';
  if (account.kind === 'local') return '로그인하지 않았어요. 이 폰에만 저장하며 쓰는 중이에요.';
  const who = account.membership ? (account.membership.role === 'parent' ? '아빠' : '딸') : null;
  const offline = account.offline ? ' (인터넷이 없어 마지막으로 확인한 정보예요)' : '';
  if (!who) return `${account.email}로 로그인했지만 아직 가족에 연결되지 않았어요.${offline}`;
  return `${account.email} · ${who} 계정으로 로그인했어요.${offline}`;
}

const styles = StyleSheet.create({
  container: { gap: adminSpacing.xs, width: '100%' },
  status: { fontSize: adminFontSize.body, fontWeight: '600' },
  input: { borderColor: '#94A3B8', borderRadius: borderRadius.sm, borderWidth: 1, fontSize: adminFontSize.body, minHeight: adminTouchTarget, paddingHorizontal: adminSpacing.xs },
  button: { alignItems: 'center', borderRadius: borderRadius.md, justifyContent: 'center', minHeight: adminTouchTarget },
  buttonText: { fontSize: adminFontSize.body, fontWeight: '700' },
  message: { fontSize: adminFontSize.label },
});
