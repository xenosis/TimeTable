import { useSyncExternalStore } from 'react';

import type { AccountState } from '../server/account';

/** 화면 어디서나 같은 로그인 상태(로컬/로그인·역할)를 보도록 하는 공유 상태. 서버 호출은 server/account.ts가 맡는다. */
let account: AccountState = { kind: 'checking' };
const listeners = new Set<() => void>();

export function setAccount(next: AccountState): void {
  account = next;
  listeners.forEach((listener) => listener());
}

export function getAccount(): AccountState {
  return account;
}

export function useAccount(): AccountState {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => account,
    () => account,
  );
}

/** 아빠 계정으로 로그인해 가족에 연결된 기기면 아빠 화면을 보인다. 그 밖(로컬·딸·미연결·확인 중)은 지금의 아이 화면이다. */
export function isParentDevice(state: AccountState): boolean {
  return state.kind === 'signedIn' && state.membership?.role === 'parent';
}
