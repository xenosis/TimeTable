import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { syncTappedFamilyPush } from '../src/push/pushTap';
import { useAccount } from '../src/store/accountStore';

/** 알림 탭을 받은 뒤 홈으로 간다. 앱이 이미 켜져 있어도 최신 가족 내용을 다시 읽는다. */
export default function PushChangeRoute() {
  const { familyId } = useLocalSearchParams<{ familyId?: string }>();
  const router = useRouter();
  const account = useAccount();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (account.kind === 'checking' || (account.kind === 'signedIn' && account.restoring)) return;
    let cancelled = false;
    // 다른 가족 링크나 로그아웃 상태는 조회 없이 홈으로 돌아간다.
    if (account.kind !== 'signedIn' || account.membership?.role !== 'child' || account.membership.familyId !== familyId) {
      router.replace('/');
      return;
    }
    void syncTappedFamilyPush(typeof familyId === 'string' ? familyId : undefined)
      .catch(() => false)
      .then((success) => {
        if (cancelled) return;
        if (success) router.replace('/');
        else setFailed(true);
      });
    return () => { cancelled = true; };
  }, [account, familyId, router, attempt]);
  return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
    {failed ? <>
      <Text style={{ fontSize: 20, textAlign: 'center', padding: 20 }}>새 내용을 맞추는 작업을 끝내지 못했어요. 이 폰에 저장된 내용은 볼 수 있어요.</Text>
      <Pressable accessibilityRole="button" onPress={() => { setFailed(false); setAttempt((value) => value + 1); }} style={{ minHeight: 56, justifyContent: 'center', padding: 16 }}>
        <Text style={{ fontSize: 20 }}>다시 받아오기</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={{ minHeight: 56, justifyContent: 'center', padding: 16 }}>
        <Text style={{ fontSize: 20 }}>저장된 내용 보기</Text>
      </Pressable>
    </> : <><ActivityIndicator /><Text>시간표를 새로 받아오고 있어요.</Text></>}
    {!failed && <Pressable accessibilityRole="button" onPress={() => router.replace('/')} style={{ minHeight: 56, justifyContent: 'center', padding: 16 }}>
      <Text style={{ fontSize: 20 }}>저장된 내용 보기</Text>
    </Pressable>}
  </View>;
}
