import { getAccount } from '../store/accountStore';
import { runSync, syncTarget } from '../sync/syncRunner';

/** 외부 링크의 가족과 알림 대상 역할이 현재 로그인과 일치할 때만 다시 맞춘다. */
export async function syncTappedFamilyPush(familyId: string | undefined, role: 'child' | 'parent' = 'child'): Promise<boolean> {
  const target = syncTarget(getAccount());
  if (!familyId || target?.familyId !== familyId || target.role !== role) return false;
  return runSync(target, { fresh: true });
}
