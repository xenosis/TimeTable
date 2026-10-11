import { restoreAccount } from '../server/account';
import { accountUserActions, getAccount, setAccount } from '../store/accountStore';
import { runSync, syncTarget } from './syncRunner';

/** 화면 없는 주기 실행도 저장된 로그인을 복원한다. 사용자 계정 변경 뒤 늦은 복원은 버린다. */
export async function syncFamilyInBackground(): Promise<boolean> {
  const generation = accountUserActions();
  let account = getAccount();
  // 세대 0의 checking만 화면 없는 초기 복원이다. 사용자 조작 뒤 checking은 로그아웃 등 진행 중이다.
  if (account.kind === 'checking' && generation !== 0) return false;
  if (account.kind === 'checking' || (account.kind === 'signedIn' && account.offline)) {
    account = await restoreAccount();
    if (accountUserActions() !== generation) return false;
    setAccount(account);
  }
  if (account.kind === 'signedIn' && (account.restoring || account.offline)) return false;
  const target = syncTarget(account);
  if (!target) return true;
  return runSync(target, { fresh: true });
}
