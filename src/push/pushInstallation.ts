import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

type Installation = { id: string; secret: string };
const key = 'tt.push.installation';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let pending: Promise<Installation> | undefined;

/** 같은 설치본의 등록 이전을 증명한다. 비밀 값은 보안 저장소에만 저장하고 로그에 남기지 않는다. */
async function readOrCreate(): Promise<Installation> {
  const stored = await SecureStore.getItemAsync(key);
  if (stored !== null) {
    let value: Partial<Installation>;
    try { value = JSON.parse(stored) as Partial<Installation>; }
    catch { throw new Error('변경 알림 기기 정보를 읽지 못했어요.'); }
    if (!value || typeof value.id !== 'string' || !uuid.test(value.id) || typeof value.secret !== 'string' || !/^[0-9a-f]{64}$/.test(value.secret)) {
      throw new Error('변경 알림 기기 정보를 읽지 못했어요.');
    }
    return { id: value.id, secret: value.secret };
  }
  const bytes = await Crypto.getRandomBytesAsync(32);
  const value = { id: Crypto.randomUUID(), secret: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('') };
  await SecureStore.setItemAsync(key, JSON.stringify(value));
  return value;
}

export function getPushInstallation(): Promise<Installation> {
  if (!pending) pending = readOrCreate().catch((error: unknown) => { pending = undefined; throw error; });
  return pending;
}
