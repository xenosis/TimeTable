import { getDatabase } from '../db/database';
import { getAccount } from '../store/accountStore';
import { hasSyncedFamily } from '../sync/syncMarkers';
import { withSyncLock } from '../sync/syncLock';
import { runSync } from '../sync/syncRunner';
import { getSupabase } from './supabaseClient';

export function pendingParentGemCount(familyId: string): number {
  try { return readPendingIds(familyId)?.length ?? 0; } catch { return -1; }
}

function readPendingIds(familyId: string): number[] | null {
  if (!globalThis.localStorage) throw new Error('지급 기록 저장소를 확인하지 못했어요.');
  const saved = globalThis.localStorage.getItem(`tt.gems.pendingGiven.${familyId}`);
  if (!saved) return null;
  const ids: unknown = JSON.parse(saved);
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 999 || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) throw new Error('이전 지급 기록을 확인하지 못했어요.');
  return ids as number[];
}

/** 아빠 폰은 동기화된 요청 ID만 서버에서 지급 처리한다. 응답 유실 후 재시도에도 같은 ID를 보내 중복을 막는다. */
export async function markParentGemsGiven(count: number): Promise<number> {
  if (!Number.isInteger(count) || count < 1 || count > 999) throw new Error('지급한 개수는 1~999의 숫자로 적어 주세요.');
  const account = getAccount();
  const membership = account.kind === 'signedIn' ? account.membership : null;
  if (membership?.role !== 'parent' || !hasSyncedFamily(membership.familyId)) throw new Error('아빠 계정으로 로그인하고 서버와 먼저 맞춰 주세요.');
  const familyId = membership.familyId;
  let rejected = false;
  let result: number;
  try { result = await withSyncLock(async () => {
    const current = getAccount();
    if (current.kind !== 'signedIn' || current.membership?.role !== 'parent' || current.membership.familyId !== familyId) throw new Error('로그인 상태가 바뀌었어요. 다시 확인해 주세요.');
    const pendingKey = `tt.gems.pendingGiven.${familyId}`;
    const storage = globalThis.localStorage;
    if (!storage) throw new Error('지급 기록 저장소를 확인하지 못했어요. 앱을 다시 열어 주세요.');
    const pending = readPendingIds(familyId);
    let ids: number[];
    if (pending) {
      ids = pending;
      if (ids.length !== count) throw new Error(`이전 지급 ${ids.length}개의 결과를 먼저 확인해 주세요. 준 개수를 ${ids.length}로 적고 다시 눌러 주세요.`);
    } else {
      const database = await getDatabase();
      const rows = await database.getAllAsync<{ id: number }>("SELECT id FROM gem_rights WHERE family_id = 'local-family' AND state = 'requested' ORDER BY earned_date, id LIMIT ?", count);
      if (rows.length !== count) throw new Error(`요청된 보석은 ${rows.length}개예요.`);
      ids = rows.map((row) => row.id);
      // 서버 응답 유실·앱 재시작 뒤에도 같은 요청만 재시도한다.
      storage.setItem(pendingKey, JSON.stringify(ids));
    }
    const { data, error } = await getSupabase().rpc('tt_mark_gems_given', { p_family: familyId, p_ids: ids });
    if (error) {
      if (error.message.startsWith('TT_GIVEN:')) {
        storage.removeItem(pendingKey);
        rejected = true;
        throw new Error(error.message.slice(9).trim());
      }
      throw new Error('지급 기록을 확인하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요. 같은 요청은 중복 지급되지 않아요.');
    }
    storage.removeItem(pendingKey);
    return Number(data);
  }); } catch (error) {
    if (rejected) await runSync({ familyId, role: 'parent' });
    throw error;
  }
  // 지급은 서버에서 이미 성공했다. 최신 상태를 다시 받되 실패해도 지급 성공을 뒤집지 않는다.
  await runSync({ familyId, role: 'parent' });
  return result;
}
