import { getDatabase } from '../db/database';
import { refreshAllRollingOwners } from '../notifications/rollingOwners';
import type { AccountState } from '../server/account';
import { getSupabase } from '../server/supabaseClient';
import { notifyWidgetChecksApplied } from '../widgets/widgetChecksSignal';
import { applyPendingWidgetChecksNow, requestWidgetRefresh } from '../widgets/widgetRefresh';
import { pullFamilySnapshot } from './pullSnapshot';
import { setSyncStatus } from './syncStatus';

const SYNCED_FAMILY_KEY = 'tt.sync.family';
const LAST_SYNC_KEY = 'tt.sync.last';

export type SyncTarget = { readonly familyId: string; readonly role: 'parent' | 'child' };

/** 가족에 연결된 로그인 계정이면 동기화한다. 로그인하지 않은 로컬 모드는 지금처럼 동기화하지 않는다. */
export function syncTarget(account: AccountState): SyncTarget | null {
  return account.kind === 'signedIn' && account.membership ? { familyId: account.membership.familyId, role: account.membership.role } : null;
}

function readStorage(key: string): string | null {
  try { return globalThis.localStorage?.getItem(key) ?? null; } catch { return null; }
}

/** 이 폰이 이 가족으로 한 번이라도 받아왔는지. 첫 동기화는 서버 기준으로 로컬을 통째로 바꾼다(P6.5 리뷰 H2 결정). */
export function hasSyncedFamily(familyId: string): boolean {
  return readStorage(SYNCED_FAMILY_KEY) === familyId;
}

export function lastSyncedAt(): string | null {
  return readStorage(LAST_SYNC_KEY);
}

/** 서버의 내 기기 행에 마지막 동기화 시각을 남긴다(아빠가 딸 폰 반영 여부를 볼 때 쓴다). 실패해도 동기화는 성공으로 둔다. */
async function recordDeviceSync(familyId: string, at: string): Promise<void> {
  const supabase = getSupabase();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return;
  const { data: existing } = await supabase.from('tt_devices').select('id').eq('user_id', userId).is('push_token', null).limit(1);
  const row = { last_synced_at: at, app_version: appVersion(), family_id: familyId };
  if (existing && existing.length > 0) await supabase.from('tt_devices').update(row).eq('id', existing[0].id);
  else await supabase.from('tt_devices').insert({ ...row, user_id: userId });
}

function appVersion(): string | null {
  // app.json의 버전. 네이티브 모듈 없이 번들에 들어 있는 값을 쓴다
  const { version } = require('../../package.json') as { version?: string };
  return version ?? null;
}

let running: Promise<boolean> | null = null;

/**
 * 서버에서 받아와 로컬을 바꾸고, 알림 재예약·위젯 갱신·화면 다시 읽기·마지막 동기화 기록까지 한다.
 * 동시에 여러 번 불리면 진행 중인 동기화 하나를 같이 기다린다. 인터넷이 없거나 실패하면 로컬은 그대로이고 false를 돌려준다.
 */
export function runSync(target: SyncTarget): Promise<boolean> {
  if (running) return running;
  running = (async () => {
    setSyncStatus({ state: 'syncing' });
    try {
      const database = await getDatabase();
      // 위젯에서 누른 체크를 먼저 로컬에 기록한다(첫 동기화가 아니면 P6.14에서 서버로 올린 뒤 받아온다)
      await applyPendingWidgetChecksNow(database).catch(() => 0);
      await pullFamilySnapshot(database, target.familyId);
      const at = new Date().toISOString();
      globalThis.localStorage?.setItem(SYNCED_FAMILY_KEY, target.familyId);
      globalThis.localStorage?.setItem(LAST_SYNC_KEY, at);
      notifyWidgetChecksApplied(); // 열려 있는 화면이 바뀐 데이터를 다시 읽는다
      await Promise.allSettled([refreshAllRollingOwners(), requestWidgetRefresh(), recordDeviceSync(target.familyId, at)]);
      setSyncStatus({ state: 'idle', lastSyncedAt: at });
      return true;
    } catch (error) {
      setSyncStatus({ state: 'error', lastSyncedAt: lastSyncedAt(), message: syncErrorMessage(error) });
      return false;
    } finally {
      running = null;
    }
  })();
  return running;
}

export function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/[가-힣]/.test(message)) return message;
  if (/network|fetch|timed? ?out/i.test(message)) return '인터넷이 연결되지 않아 이 폰에 저장된 내용으로 보여 주고 있어요.';
  return '서버와 맞추지 못했어요. 이 폰에 저장된 내용으로 보여 주고 있어요.';
}
