import { useSyncExternalStore } from 'react';

import type { AccountState } from '../server/account';

/** 화면 어디서나 같은 로그인 상태(로컬/로그인·역할)를 보도록 하는 공유 상태. 서버 호출은 server/account.ts가 맡는다. */
let account: AccountState = { kind: 'checking' };
let userActions = 0;
const listeners = new Set<() => void>();

export function setAccount(next: AccountState): void {
  account = next;
  listeners.forEach((listener) => listener());
}

/** 사용자가 직접 로그인·로그아웃한 결과. 그보다 늦게 끝난 자동 확인(앱 시작 복원 등)이 이 결과를 덮어쓰지 않게 횟수를 센다. */
export function setAccountByUser(next: AccountState): void {
  userActions += 1;
  setAccount(next);
}

/** 자동 확인을 시작할 때의 사용자 조작 횟수. 끝났을 때 값이 달라졌으면 그 사이 사용자가 직접 바꾼 것이므로 결과를 버린다. */
export function accountUserActions(): number {
  return userActions;
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
