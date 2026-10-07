import { getSupabase } from './supabaseClient';
import { SUPABASE_URL } from './supabaseConfig';
import { ACCOUNT_CACHE_KEY } from './accountCacheKey';
import { clearSyncedFamily } from '../sync/syncMarkers';

export type FamilyRole = 'parent' | 'child';
export type Membership = { readonly role: FamilyRole; readonly familyId: string };

/**
 * 이 기기의 서버 계정 상태.
 * - local: 로그인하지 않음. 지금처럼 이 폰에만 저장하며 쓴다(사용자 결정 2026-10-06).
 * - signedIn: 로그인함. membership이 null이면 아직 가족에 연결되지 않은 계정이다.
 *   offline이면 서버에서 역할을 아직 확인하지 못해(앱을 막 켰거나 인터넷이 없음) 이 기기에 마지막으로 확인해 둔 역할을 쓰는 중이다.
 */
export type AccountState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'local' }
  | { readonly kind: 'signedIn'; readonly email: string; readonly membership: Membership | null; readonly offline: boolean };

const CACHE_KEY = ACCOUNT_CACHE_KEY;

/** 서버의 tt_family_members 한 줄을 앱이 쓰는 소속 정보로 바꾼다. 모양이 다르면 소속 없음으로 본다. */
export function parseMembership(row: unknown): Membership | null {
  if (!row || typeof row !== 'object') return null;
  const { role, family_id: familyId } = row as { role?: unknown; family_id?: unknown };
  if ((role !== 'parent' && role !== 'child') || typeof familyId !== 'string' || !familyId) return null;
  return { role, familyId };
}

/** Supabase 인증 오류를 화면용 한글 문구로 바꾼다. 영어 원문은 보여 주지 않는다. */
export function signInErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  if (/invalid login credentials/i.test(message)) return '이메일이나 비밀번호가 맞지 않아요.';
  if (/email not confirmed/i.test(message)) return '이메일 인증이 아직 끝나지 않은 계정이에요.';
  if (/network|fetch|timed? ?out/i.test(message)) return '인터넷 연결을 확인한 뒤 다시 해 주세요.';
  return '로그인하지 못했어요. 잠시 뒤 다시 해 주세요.';
}

/** supabase-js가 로그인 정보를 저장하는 기본 키(sb-<프로젝트>-auth-token). 오프라인 로그아웃이 실패할 때 직접 지우는 데 쓴다. */
export const AUTH_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

/** 이 기기에서 마지막으로 서버와 확인한 계정. 인터넷이 없거나 토큰 갱신이 실패해도 화면(아빠/아이)을 유지하는 데 쓴다. */
type CachedAccount = { readonly userId: string; readonly email: string; readonly membership: Membership | null };

function readCachedAccount(): CachedAccount | null {
  try {
    const cached = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) ?? 'null') as Partial<CachedAccount> | null;
    if (!cached || typeof cached.userId !== 'string' || !cached.userId) return null;
    const membership = cached.membership ? parseMembership({ role: cached.membership.role, family_id: cached.membership.familyId }) : null;
    return { userId: cached.userId, email: typeof cached.email === 'string' ? cached.email : '', membership };
  } catch {
    return null;
  }
}

function readCache(userId: string): Membership | null {
  const cached = readCachedAccount();
  return cached?.userId === userId ? cached.membership : null;
}

function writeCache(account: CachedAccount): void {
  globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(account));
}

/** 로그인한 계정의 가족·역할을 서버에서 읽는다. 인터넷이 없으면 마지막으로 확인한 역할을 쓴다. */
async function loadSignedIn(userId: string, email: string): Promise<AccountState> {
  const { data, error } = await getSupabase().from('tt_family_members').select('role, family_id').eq('user_id', userId).maybeSingle();
  if (error) return { kind: 'signedIn', email, membership: readCache(userId), offline: true };
  const membership = parseMembership(data);
  writeCache({ userId, email, membership });
  return { kind: 'signedIn', email, membership, offline: false };
}

/**
 * 앱을 켤 때: 저장된 로그인이 있으면 이어서 쓰고, 없으면 로컬 모드다.
 * 서버 확인은 인터넷이 없으면 실패하기까지 10초 넘게 걸릴 수 있어(딸 폰 2026-10-06 확인), 그 전에 이 기기에 저장해 둔 역할로
 * 화면을 먼저 정하도록 onStored로 알려 준다. 그동안 아빠 폰에 아이 화면이 잠깐 보이지 않게 하기 위해서다.
 */
export async function restoreAccount(onStored?: (state: AccountState) => void): Promise<AccountState> {
  const { data, error } = await getSupabase().auth.getSession();
  const user = data.session?.user;
  if (!user) {
    // 토큰이 만료됐는데 인터넷이 없어 갱신하지 못하면 세션 없음과 오류가 함께 온다(저장된 세션은 남아 있음).
    // 이때는 로그아웃이 아니므로 마지막으로 확인한 계정·역할을 유지하고, 인터넷이 돌아오면 다시 확인한다.
    const cached = error ? readCachedAccount() : null;
    if (!cached) return { kind: 'local' };
    const stored: AccountState = { kind: 'signedIn', email: cached.email, membership: cached.membership, offline: true };
    onStored?.(stored);
    return stored;
  }
  onStored?.({ kind: 'signedIn', email: user.email ?? '', membership: readCache(user.id), offline: true });
  return loadSignedIn(user.id, user.email ?? '');
}

export async function signIn(email: string, password: string): Promise<AccountState> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) throw new Error(signInErrorMessage(error));
  return loadSignedIn(data.user.id, data.user.email ?? email.trim());
}

/**
 * 이 기기에서만 로그아웃한다(다른 기기의 로그인은 그대로). 로컬 데이터는 지우지 않는다.
 * 오프라인에서 토큰이 만료돼 라이브러리가 세션을 지우지 못하면(오류 반환) 저장된 로그인 정보를 직접 지워, 다음에 켤 때 다시 로그인되지 않게 한다.
 */
export async function signOut(): Promise<AccountState> {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) globalThis.localStorage?.removeItem(AUTH_STORAGE_KEY);
  globalThis.localStorage?.removeItem(CACHE_KEY);
  // 다음 로그인 때는 서버 기준으로 처음부터 맞춘다(다른 계정·가족으로 로그인해도 옛 기록이 섞여 올라가지 않게)
  clearSyncedFamily();
  return { kind: 'local' };
}
