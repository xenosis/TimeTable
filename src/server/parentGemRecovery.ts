import { getDatabase } from '../db/database';
import { getAccount } from '../store/accountStore';
import { withSyncLock } from '../sync/syncLock';
import { runSync } from '../sync/syncRunner';
import { pendingParentGemCount } from './parentGemGiven';

type RecoveryRow = { id: number; state: 'requested' | 'given'; given_at: string | null };
export type ParentGemRecovery = {
  familyId: string; fingerprint: string; pendingRaw: string; requested: number; given: number; latestGiven: readonly (string | null)[];
};

function parentFamily(): string {
  const account = getAccount();
  if (account.kind !== 'signedIn' || account.membership?.role !== 'parent') throw new Error('아빠 계정으로 로그인해 주세요.');
  return account.membership.familyId;
}

async function recoveryRows(): Promise<RecoveryRow[]> {
  return (await getDatabase()).getAllAsync<RecoveryRow>("SELECT id, state, given_at FROM gem_rights WHERE family_id = 'local-family' AND state IN ('requested', 'given') ORDER BY id");
}

/** 서버 내역을 먼저 받아 확인용으로 보여 준다. 손상된 대기 기록은 아직 변경하지 않는다. */
export async function loadParentGemRecovery(): Promise<ParentGemRecovery> {
  const familyId = parentFamily();
  if (pendingParentGemCount(familyId) >= 0) throw new Error('지급 대기 기록은 정상이에요. 목록을 다시 확인해 주세요.');
  if (!await runSync({ familyId, role: 'parent' })) throw new Error('서버 지급 내역을 확인하지 못했어요. 인터넷 연결 뒤 다시 해 주세요.');
  return withSyncLock(async () => {
    if (parentFamily() !== familyId) throw new Error('로그인 상태가 바뀌었어요. 다시 확인해 주세요.');
    const pendingRaw = globalThis.localStorage?.getItem(`tt.gems.pendingGiven.${familyId}`);
    if (!pendingRaw) throw new Error('지급 대기 기록을 확인하지 못했어요.');
    const rows = await recoveryRows();
    const paid = rows.filter((row) => row.state === 'given');
    return {
      familyId, pendingRaw, fingerprint: JSON.stringify(rows), requested: rows.length - paid.length, given: paid.length,
      latestGiven: paid.map((row) => row.given_at && !row.given_at.includes('T') ? `${row.given_at.replace(' ', 'T')}Z` : row.given_at).sort((a, b) => (b ?? '').localeCompare(a ?? '')).slice(0, 5),
    };
  });
}

/** 사용자가 실제 지급과 서버 내역을 대조한 뒤에만 호출한다. 내역이 바뀌었으면 다시 확인한다. */
export async function confirmParentGemRecovery(reviewed: ParentGemRecovery): Promise<void> {
  const current = await loadParentGemRecovery();
  if (current.familyId !== reviewed.familyId || current.fingerprint !== reviewed.fingerprint || current.pendingRaw !== reviewed.pendingRaw) throw new Error('지급 내역이 바뀌었어요. 최신 내역을 다시 확인해 주세요.');
  await withSyncLock(async () => {
    if (parentFamily() !== current.familyId || JSON.stringify(await recoveryRows()) !== current.fingerprint) throw new Error('지급 내역이 바뀌었어요. 다시 확인해 주세요.');
    const storage = globalThis.localStorage;
    if (!storage || storage.getItem(`tt.gems.pendingGiven.${current.familyId}`) !== current.pendingRaw) throw new Error('대기 기록이 바뀌었어요. 다시 확인해 주세요.');
    storage.removeItem(`tt.gems.pendingGiven.${current.familyId}`);
  });
}
