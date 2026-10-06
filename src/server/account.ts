import { getSupabase } from './supabaseClient';

export type FamilyRole = 'parent' | 'child';
export type Membership = { readonly role: FamilyRole; readonly familyId: string };

/**
 * 이 기기의 서버 계정 상태.
 * - local: 로그인하지 않음. 지금처럼 이 폰에만 저장하며 쓴다(사용자 결정 2026-10-06).
 * - signedIn: 로그인함. membership이 null이면 아직 가족에 연결되지 않은 계정이다.
 *   offline이면 인터넷이 없어 서버에서 역할을 확인하지 못해, 이 기기에 마지막으로 확인해 둔 역할을 쓰는 중이다.
 */
export type AccountState =
  | { readonly kind: 'checking' }
  | { readonly kind: 'local' }
  | { readonly kind: 'signedIn'; readonly email: string; readonly membership: Membership | null; readonly offline: boolean };

const CACHE_KEY = 'tt.account.membership';

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

type CachedMembership = Membership & { readonly userId: string };

function readCache(userId: string): Membership | null {
  try {
    const cached = JSON.parse(globalThis.localStorage?.getItem(CACHE_KEY) ?? 'null') as CachedMembership | null;
    return cached?.userId === userId ? parseMembership({ role: cached.role, family_id: cached.familyId }) : null;
  } catch {
    return null;
  }
}

function writeCache(userId: string, membership: Membership | null): void {
  if (membership) globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify({ userId, ...membership }));
  else globalThis.localStorage?.removeItem(CACHE_KEY);
}

/** 로그인한 계정의 가족·역할을 서버에서 읽는다. 인터넷이 없으면 마지막으로 확인한 역할을 쓴다. */
async function loadSignedIn(userId: string, email: string): Promise<AccountState> {
  const { data, error } = await getSupabase().from('tt_family_members').select('role, family_id').eq('user_id', userId).maybeSingle();
  if (error) return { kind: 'signedIn', email, membership: readCache(userId), offline: true };
  const membership = parseMembership(data);
  writeCache(userId, membership);
  return { kind: 'signedIn', email, membership, offline: false };
}

/** 앱을 켤 때: 저장된 로그인이 있으면 이어서 쓰고, 없으면 로컬 모드다. */
export async function restoreAccount(): Promise<AccountState> {
  const { data } = await getSupabase().auth.getSession();
  const user = data.session?.user;
  return user ? loadSignedIn(user.id, user.email ?? '') : { kind: 'local' };
}

export async function signIn(email: string, password: string): Promise<AccountState> {
  const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
  if (error || !data.user) throw new Error(signInErrorMessage(error));
  return loadSignedIn(data.user.id, data.user.email ?? email.trim());
}

/** 이 기기에서만 로그아웃한다(다른 기기의 로그인은 그대로). 로컬 데이터는 지우지 않는다. */
export async function signOut(): Promise<AccountState> {
  await getSupabase().auth.signOut({ scope: 'local' });
  globalThis.localStorage?.removeItem(CACHE_KEY);
  return { kind: 'local' };
}
