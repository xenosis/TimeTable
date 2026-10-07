import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase } from '../server/supabaseClient';

/**
 * 앱이 켜져 있는 동안 서버의 가족 데이터 변경을 Realtime(postgres_changes)으로 듣는다(P6.7).
 * 변경 내용은 쓰지 않고 '바뀌었다'는 신호만 모아(기본 2초) onChange를 한 번 부른다. 받아오기·올리기 규칙은 동기화(P6.13~P6.15)가 맡는다.
 * 보안 규칙(RLS)과 family_id 필터로 이 가족의 변경만 온다(삭제도 거르려고 서버 테이블은 replica identity full, 20261007000100).
 * 연결이 끊겼다 다시 이어지면 그사이 놓친 변경이 있을 수 있어 onChange를 한 번 부른다.
 */
export const realtimeTables = [
  'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings', 'tt_timetable_items', 'tt_day_exceptions',
  'tt_tasks', 'tt_task_completions', 'tt_task_completion_history', 'tt_sticker_ledger', 'tt_rewards', 'tt_gem_rights',
] as const;

export function subscribeFamilyChanges(familyId: string, onChange: () => void, debounceMs = 2000): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let subscribedOnce = false;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; onChange(); }, debounceMs);
  };
  const supabase = getSupabase();
  let channel: RealtimeChannel = supabase.channel(`tt-family-${familyId}`);
  for (const table of realtimeTables) {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}` }, schedule);
  }
  channel.subscribe((status) => {
    if (status !== 'SUBSCRIBED') return;
    // 처음 연결은 앱 시작·로그인 동기화가 이미 돈다. 다시 이어진 연결이면 놓친 변경을 받으려고 한 번 더 맞춘다
    if (subscribedOnce) schedule();
    subscribedOnce = true;
  });
  return () => {
    if (timer) clearTimeout(timer);
    void supabase.removeChannel(channel);
  };
}
