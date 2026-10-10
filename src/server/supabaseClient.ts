import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabaseConfig';
import { createReadTimedFetch } from './requestTimeout';

let client: SupabaseClient | null = null;

/**
 * 서버 클라이언트를 처음 쓸 때 만든다(앱 시작 때 로그인 복원에서 처음 쓰인다).
 * 로그인 정보는 expo-sqlite의 localStorage(앱 전용 SQLite)에 저장되어 앱을 다시 켜도 유지된다.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    // 재시도는 앱의 새 동기화 요청이 맡는다. SDK 내부 재시도가 같은 잠금을 오래 점유하지 않게 한다.
    db: { retry: false },
    global: { fetch: createReadTimedFetch(globalThis.fetch) },
    auth: { storage: globalThis.localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  // 앱이 화면에 있을 때만 토큰을 자동 갱신한다(Supabase React Native 안내). 백그라운드에서 갱신 타이머가 돌지 않게 한다.
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client?.auth.startAutoRefresh();
    else client?.auth.stopAutoRefresh();
  });
  return client;
}
