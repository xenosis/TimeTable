import { getSupabase } from './supabaseClient';

export type ChildDeviceStatus = { readonly lastSyncedAt: string | null; readonly appVersion: string | null };

/**
 * 아빠 화면에 보일 딸 폰의 마지막 동기화 시각(P6.8). 딸 폰은 동기화가 끝날 때마다 tt_devices에 시각·앱 버전을 남긴다(syncRunner).
 * 설치본에 연결된 딸 기기 중 서버가 가장 최근에 동기화 완료를 확인한 것을 반환한다.
 * 설치본 증명이 없는 구버전 행은 시계 오류·중복 기록으로 새 기기를 가리지 않도록 제외한다.
 * 기기 기록은 보안 규칙상 아빠 계정만 가족 것을 읽을 수 있다(딸 계정은 자기 것만).
 */
export async function fetchChildDeviceStatus(familyId: string): Promise<ChildDeviceStatus | null> {
  const supabase = getSupabase();
  const { data: members, error: memberError } = await supabase.from('tt_family_members').select('user_id').eq('family_id', familyId).eq('role', 'child');
  if (memberError) throw new Error('딸 폰 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  const childIds = (members ?? []).map((member: { user_id: string }) => member.user_id);
  if (childIds.length === 0) return null;
  const { data: devices, error } = await supabase.from('tt_devices').select('last_synced_at, app_version').eq('family_id', familyId).in('user_id', childIds)
    .not('installation_id', 'is', null).not('last_synced_at', 'is', null).order('last_synced_at', { ascending: false }).limit(1);
  if (error) throw new Error('딸 폰 기록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.');
  const latest = (devices ?? [])[0] as { last_synced_at: string | null; app_version: string | null } | undefined;
  return latest ? { lastSyncedAt: latest.last_synced_at, appVersion: latest.app_version } : null;
}
