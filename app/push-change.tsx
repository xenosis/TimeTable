import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { syncTappedFamilyPush } from '../src/push/pushTap';

/** 알림 탭을 받은 뒤 홈으로 간다. 앱이 이미 켜져 있어도 최신 가족 내용을 다시 읽는다. */
export default function PushChangeRoute() {
  const { familyId } = useLocalSearchParams<{ familyId?: string }>();
  const router = useRouter();
  useEffect(() => {
    void syncTappedFamilyPush(typeof familyId === 'string' ? familyId : undefined);
    router.replace('/');
  }, [familyId, router]);
  return null;
}
