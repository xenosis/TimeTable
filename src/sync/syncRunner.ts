import { childChangeVersion } from '../db/childChangeVersion';
import { getDatabase } from '../db/database';
import { refreshAllRollingOwners } from '../notifications/rollingOwners';
import type { AccountState } from '../server/account';
import { hasLocalData, readLocalPayload } from '../server/localImport';
import { getSupabase } from '../server/supabaseClient';
import { getPushInstallation } from '../push/pushInstallation';
import { accountUserActions, getAccount } from '../store/accountStore';
import { notifyWidgetChecksApplied } from '../widgets/widgetChecksSignal';
import { applyPendingWidgetChecksNow, requestWidgetRefresh } from '../widgets/widgetRefresh';
import { fetchLocalSnapshot, NETWORK_ERROR, replaceLocalWithSnapshot, serverHasFamilyData } from './pullSnapshot';
import type { LocalSnapshot } from './snapshotMapping';
import { pushChildRecords } from './pushChildRecords';
import { requestSyncSoon } from './syncSoon';
import { withSyncLock } from './syncLock';
import { setSyncStatus } from './syncStatus';
import { hasSyncedFamily, lastSyncedAt, markSynced } from './syncMarkers';

export const NEEDS_IMPORT_MESSAGE = "서버에 아직 데이터가 없어요. 이 폰의 데이터를 아래 '서버로 올리기'로 먼저 올려 주세요.";

export type SyncTarget = { readonly familyId: string; readonly role: 'parent' | 'child' };

/** 가족에 연결된 로그인 계정이면 동기화한다. 로그인하지 않은 로컬 모드는 지금처럼 동기화하지 않는다. */
export function syncTarget(account: AccountState): SyncTarget | null {
  return account.kind === 'signedIn' && account.membership ? { familyId: account.membership.familyId, role: account.membership.role } : null;
}

export { hasSyncedFamily, lastSyncedAt };

/**
 * 푸시 등록 여부와 관계없이 설치본 증명으로 같은 행에 마지막 동기화 시각을 남긴다.
 * 기록 실패는 부분 실패로 알린다. 다른 폰의 설치본 행은 갱신하지 않는다.
 */
async function recordDeviceSync(familyId: string, at: string, isCurrent: () => boolean): Promise<void> {
  const supabase = getSupabase();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!isCurrent()) return;
  if (authError || !userId) throw new Error('내용은 받았지만 기기 기록을 위해 계정을 확인하지 못했어요. 다시 맞춰 주세요.');
  const installation = await getPushInstallation();
  if (!isCurrent()) return;
  const { error } = await supabase.rpc('tt_record_device_sync', {
    p_family: familyId, p_installation: installation.id, p_secret: installation.secret,
    p_version: appVersion(), p_synced_at: at,
  });
  if (error) throw new Error('내용은 받았지만 마지막 동기화 기록을 남기지 못했어요. 다시 맞춰 주세요.');
}

async function currentUserId(): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error('로그인 정보가 없어 기록을 올리지 못했어요. 다시 로그인해 주세요.');
  return id;
}

function appVersion(): string | null {
  // app.json과 같은 버전(버전 정책상 함께 올린다). 네이티브 모듈 없이 번들에 들어 있는 값을 쓴다
  const { version } = require('../../package.json') as { version?: string };
  return version ?? null;
}

let running: { readonly familyId: string; readonly role: string; readonly generation: number; readonly promise: Promise<boolean>; again: boolean } | null = null;

function sameAccount(target: SyncTarget, generation: number): boolean {
  const current = syncTarget(getAccount());
  return accountUserActions() === generation && current?.familyId === target.familyId && current.role === target.role;
}

/**
 * 서버에서 받아와 로컬을 바꾸고, 알림 재예약·위젯 갱신·화면 다시 읽기·마지막 동기화 기록까지 한다.
 * 같은 가족 동기화가 진행 중이면 그것을 같이 기다리고, 다른 가족이면 끝난 뒤 다시 한다.
 * 인터넷이 없거나 실패하면 로컬은 그대로이고 false를 돌려준다.
 */
export function runSync(target: SyncTarget, options: { readonly forceServer?: boolean; readonly fresh?: boolean } = {}): Promise<boolean> {
  const generation = accountUserActions();
  if (!sameAccount(target, generation)) return Promise.resolve(false);
  if (running) {
    // 알림 탭은 요청 전에 시작한 조회를 공유하지 않고, 이후 새 조회의 적용까지 기다린다.
    if (options.fresh) return running.promise.then(() => {
      if (!sameAccount(target, generation)) return false;
      // 이미 시작한 후속 조회는 알림 요청 이후의 새 조회이므로 완료를 함께 기다린다.
      if (running?.familyId === target.familyId && running.role === target.role && running.generation === generation && !options.forceServer) return running.promise;
      return runSync(target, options);
    });
    // 같은 가족 동기화가 도는 중에 온 요청(Realtime 신호 등)은 이미 받아 온 내용보다 새 변경일 수 있어, 끝난 뒤 한 번 더 맞춘다(P6.7 리뷰 H1)
    if (running.familyId === target.familyId && running.role === target.role && running.generation === generation && !options.forceServer) { running.again = true; return running.promise; }
    // 직접 고른 '서버 내용으로 다시 맞추기'와 다른 가족 요청은 진행 중인 동기화가 끝난 뒤 따로 실행한다
    return running.promise.then(() => sameAccount(target, generation) ? runSync(target, options) : false);
  }
  // 관리자 편집(서버에 먼저 저장)과 겹치지 않게 같은 줄에서 실행한다(P6.15 리뷰 H3)
  const entry = { familyId: target.familyId, role: target.role, generation, promise: Promise.resolve(false), again: false };
  entry.promise = withSyncLock(() => syncOnce(target, options, generation)).finally(() => {
    running = null;
    // 도는 사이 요청이 왔으면 한 번만 더 맞춘다(그때의 로그인 가족이 같을 때)
    const current = syncTarget(getAccount());
    if (entry.again && current?.familyId === target.familyId) void runSync(current);
  });
  running = entry;
  return entry.promise;
}

/**
 * '서버 내용으로 이 폰 다시 맞추기': 동기화 표시를 지우고 서버 기준 첫 동기화를 다시 한다.
 * 아직 서버에 올라가지 않은 폰의 체크·보석 기록은 사라진다(화면에서 확인을 받은 뒤 부른다).
 */
export function resyncFromServer(target: SyncTarget): Promise<boolean> {
  return runSync(target, { forceServer: true });
}

/** 서버 가족에 시간표 세트가 하나도 없으면 기본 세트 '평소'를 서버에 만든다(폰에만 자동으로 생겨 서버와 어긋나지 않게, P6.15 리뷰 M5). */
async function ensureServerTimetableSet(familyId: string, snapshot: LocalSnapshot): Promise<boolean> {
  if (snapshot.timetable_sets.length > 0) return false;
  // 폰이 새 행에 쓰는 id(최대값+1)와 겹치지 않도록 큰 수로 정한다
  const id = 1_000_000_000 + (Date.now() % 1_000_000_000);
  const { error } = await getSupabase().rpc('tt_apply_family_edit', { p_family: familyId, p_edit: { inserts: { tt_timetable_sets: [{ id, name: '평소' }] }, settings: { active_set_id: id } } });
  if (error) throw new Error(/network|fetch|timed? ?out/i.test(error.message) ? NETWORK_ERROR : '서버에 기본 시간표를 만들지 못했어요.');
  return true;
}

async function syncOnce(target: SyncTarget, options: { readonly forceServer?: boolean }, generation: number): Promise<boolean> {
  setSyncStatus({ familyId: target.familyId, state: 'syncing' });
  try {
    const database = await getDatabase();
    if (!sameAccount(target, generation)) return false;
    // 직접 고른 '서버 내용으로 다시 맞추기'는 첫 동기화처럼 서버 기준으로 통째로 바꾼다(올리지 않음). 표시는 성공한 뒤에만 다시 남긴다
    const first = options.forceServer === true || !hasSyncedFamily(target.familyId);
    // 위젯에서 누른 체크를 먼저 로컬에 기록한다
    await applyPendingWidgetChecksNow(database).catch(() => 0);
    // 딸 폰은 첫 동기화 뒤부터 체크·보석 기록을 서버에 먼저 올린다(P6.14). 올리기 시작 시점의 기록 변경 횟수를 기억해 둔다
    const versionAtPush = childChangeVersion();
    if (!sameAccount(target, generation)) return false;
    if (!first && target.role === 'child') {
      const userId = await currentUserId();
      if (!sameAccount(target, generation)) return false;
      await pushChildRecords(database, target.familyId, userId, () => sameAccount(target, generation));
    }
    let snapshot = await fetchLocalSnapshot(target.familyId);
    if (!sameAccount(target, generation)) { requestSyncSoon(); return false; }
    // 서버가 비어 있는데 이 폰에 데이터가 있으면 덮지 않는다. P6.5 '서버로 올리기'를 먼저 하게 안내한다(직접 고른 다시 맞추기는 건너뜀)
    if (first && !options.forceServer && !serverHasFamilyData(snapshot) && hasLocalData(await readLocalPayload(database))) {
      setSyncStatus({ familyId: target.familyId, state: 'error', lastSyncedAt: lastSyncedAt(), message: NEEDS_IMPORT_MESSAGE });
      return false;
    }
    if (await ensureServerTimetableSet(target.familyId, snapshot)) snapshot = await fetchLocalSnapshot(target.familyId);
    // 받아오는 사이 로그아웃하거나 다른 가족으로 바꿨으면 로컬을 바꾸지 않는다
    if (!sameAccount(target, generation)) { requestSyncSoon(); return false; }
    // 올린 뒤에는 서버 내용이 기준이다(아빠가 '줬어요'로 바꾼 보석 등도 내려온다). 다만 그 사이 폰에서 새 체크가 생겼으면 폰 기록을 지키고 다음에 올린다
    await replaceLocalWithSnapshot(database, snapshot, () => {
      if (!sameAccount(target, generation)) throw new Error('로그인 계정이 바뀌어 이전 동기화를 취소했어요.');
      return !first && target.role === 'child' && childChangeVersion() !== versionAtPush;
    });
    const at = new Date().toISOString();
    markSynced(target.familyId, at);
    notifyWidgetChecksApplied(); // 열려 있는 화면이 바뀐 데이터를 다시 읽는다
    const refreshed = await Promise.allSettled([refreshAllRollingOwners(), requestWidgetRefresh()]);
    if (refreshed.some((result) => result.status === 'rejected')) {
      throw new Error('내용은 받았지만 알림·위젯을 갱신하지 못했어요. 다시 맞춰 주세요.');
    }
    // 로컬 조회 마커는 유지하되, 알림·위젯 적용이 끝난 뒤에만 서버 기기 시각을 남긴다.
    if (!sameAccount(target, generation)) return false;
    await recordDeviceSync(target.familyId, at, () => sameAccount(target, generation));
    if (!sameAccount(target, generation)) return false;
    setSyncStatus({ familyId: target.familyId, state: 'idle', lastSyncedAt: at });
    // 올린 뒤 생긴 체크·보석 변경은 폰에 지켜졌으니 곧 다시 올린다(다음 앱 복귀까지 기다리지 않게)
    if (target.role === 'child' && childChangeVersion() !== versionAtPush) requestSyncSoon();
    return true;
  } catch (error) {
    if (!sameAccount(target, generation)) return false;
    setSyncStatus({ familyId: target.familyId, state: 'error', lastSyncedAt: lastSyncedAt(), message: syncErrorMessage(error) });
    return false;
  }
}

export function syncErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message === NETWORK_ERROR || /network|fetch|timed? ?out/i.test(message)) return '인터넷이 연결되지 않아 이 폰에 저장된 내용으로 보여 주고 있어요.';
  if (/[가-힣]/.test(message)) return message;
  return '서버와 맞추지 못했어요. 이 폰에 저장된 내용으로 보여 주고 있어요.';
}
