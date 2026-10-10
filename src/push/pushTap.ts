import { getAccount } from '../store/accountStore';
import { runSync, syncTarget } from '../sync/syncRunner';

/** 외부 링크로 다른 가족을 조회하지 않는다. 현재 딸 계정의 가족과 일치할 때만 다시 맞춘다. */
export async function syncTappedFamilyPush(familyId: string | undefined): Promise<boolean> {
  const target = syncTarget(getAccount());
  if (!familyId || target?.familyId !== familyId || target.role !== 'child') return false;
  return runSync(target, { fresh: true });
}
