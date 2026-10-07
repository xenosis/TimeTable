import type { RealtimeChannel } from '@supabase/supabase-js';

import { getSupabase } from '../server/supabaseClient';

/**
 * 앱이 켜져 있는 동안 서버의 가족 데이터 변경을 Realtime(postgres_changes)으로 듣는다(P6.7).
 * 변경 내용은 쓰지 않고 '바뀌었다'는 신호만 모아 onChange를 부른다(마지막 신호 2초 뒤, 신호가 계속 와도 늦어도 5초 안에 한 번).
 * 받아오기·올리기 규칙은 동기화(P6.13~P6.15)가 맡는다.
 * 넣기·고치기 이벤트는 보안 규칙(RLS)과 family_id 필터로 이 가족 것만 온다. 삭제 이벤트에는 RLS가 적용되지 않지만,
 * 서버 테이블의 replica identity를 full로 두어(20261007000100) family_id 필터로 이 가족 것만 받는다(Supabase 문서).
 * 채널이 오류·시간 초과·닫힘으로 끝나면 몇 초 뒤 새 채널로 다시 구독하고, 다시 이어지면 놓친 변경을 받으려고 한 번 맞춘다.
 * 앱이 백그라운드여도 채널을 유지한다(그동안 서버가 바뀌면 알림을 다시 예약할 수 있게, P6.7 리뷰 결정).
 */
export const realtimeTables = [
  'tt_periods', 'tt_timetable_sets', 'tt_timetable_settings', 'tt_timetable_items', 'tt_day_exceptions',
  'tt_tasks', 'tt_task_completions', 'tt_task_completion_history', 'tt_sticker_ledger', 'tt_rewards', 'tt_gem_rights',
] as const;

const RECONNECT_DELAYS_MS = [5000, 15000, 30000] as const;
let topicCounter = 0;

export function subscribeFamilyChanges(familyId: string, onChange: () => void, debounceMs = 2000, maxWaitMs = 5000): () => void {
  const supabase = getSupabase();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstSignalAt: number | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let subscribedOnce = false;
  let stopped = false;
  let channel: RealtimeChannel | null = null;

  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    firstSignalAt = null;
    onChange();
  };
  const schedule = () => {
    const now = Date.now();
    firstSignalAt ??= now;
    if (timer) clearTimeout(timer);
    // 신호가 2초보다 짧은 간격으로 계속 와도 첫 신호 뒤 5초 안에는 한 번 맞춘다
    timer = setTimeout(fire, Math.max(0, Math.min(debounceMs, firstSignalAt + maxWaitMs - now)));
  };

  const connect = () => {
    if (stopped) return;
    // 같은 이름의 채널이 아직 정리 중일 수 있어 구독마다 다른 이름을 쓴다(라이브러리가 같은 이름 채널을 재사용함)
    topicCounter += 1;
    let next = supabase.channel(`tt-family-${familyId}-${topicCounter}`);
    for (const table of realtimeTables) {
      next = next.on('postgres_changes', { event: '*', schema: 'public', table, filter: `family_id=eq.${familyId}` }, schedule);
    }
    channel = next;
    next.subscribe((status) => {
      if (stopped || channel !== next) return;
      if (status === 'SUBSCRIBED') {
        reconnectAttempt = 0;
        // 처음 연결은 앱 시작·로그인 동기화가 이미 돈다. 다시 이어진 연결이면 놓친 변경을 받으려고 한 번 더 맞춘다
        if (subscribedOnce) schedule();
        subscribedOnce = true;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') reconnectLater(next);
    });
  };

  const reconnectLater = (broken: RealtimeChannel) => {
    if (reconnectTimer || stopped) return;
    void supabase.removeChannel(broken);
    const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempt += 1;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay);
  };

  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (channel) void supabase.removeChannel(channel);
  };
}
