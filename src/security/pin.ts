import * as SecureStore from 'expo-secure-store';

const pinKey = 'timetable.pin.sha256.v1';
const pinLockKey = 'timetable.pin.lock.v1';

export function hashPin(pin: string): string {
  const bytes = Array.from(new TextEncoder().encode(pin));
  const bitLength = bytes.length * 8;
  bytes.push(0x80); while ((bytes.length % 64) !== 56) bytes.push(0);
  for (let index = 7; index >= 0; index -= 1) bytes.push((bitLength / 2 ** (index * 8)) & 0xff);
  const words = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  for (let offset = 0; offset < bytes.length; offset += 64) {
    const schedule = Array.from({ length: 64 }, (_, index) => index < 16 ? ((bytes[offset + index * 4] << 24) | (bytes[offset + index * 4 + 1] << 16) | (bytes[offset + index * 4 + 2] << 8) | bytes[offset + index * 4 + 3]) >>> 0 : 0);
    for (let index = 16; index < 64; index += 1) { const a = schedule[index - 15], b = schedule[index - 2]; schedule[index] = (((a >>> 7 | a << 25) ^ (a >>> 18 | a << 14) ^ a >>> 3) + schedule[index - 7] + ((b >>> 17 | b << 15) ^ (b >>> 19 | b << 13) ^ b >>> 10) + schedule[index - 16]) >>> 0; }
    let [a,b,c,d,e,f,g,h] = words;
    for (let index = 0; index < 64; index += 1) { const s1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7); const choice = (e & f) ^ (~e & g); const t1 = (h + s1 + choice + constants[index] + schedule[index]) >>> 0; const s0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10); const majority = (a & b) ^ (a & c) ^ (b & c); [h,g,f,e,d,c,b,a] = [g,f,e,(d + t1) >>> 0,c,b,a,(t1 + s0 + majority) >>> 0]; }
    [words[0],words[1],words[2],words[3],words[4],words[5],words[6],words[7]] = [words[0]+a,words[1]+b,words[2]+c,words[3]+d,words[4]+e,words[5]+f,words[6]+g,words[7]+h].map((word) => word >>> 0);
  }
  return words.map((word) => word.toString(16).padStart(8, '0')).join('');
}

function validPin(pin: string): boolean { return /^\d{4,8}$/.test(pin); }
export async function hasPin(): Promise<boolean> { return (await SecureStore.getItemAsync(pinKey)) != null; }
export async function savePin(pin: string): Promise<void> { if (!validPin(pin)) throw new Error('PIN은 숫자 4~8자리여야 해요.'); await SecureStore.setItemAsync(pinKey, hashPin(pin)); }
export async function verifyPin(pin: string): Promise<boolean> { const saved = await SecureStore.getItemAsync(pinKey); return saved != null && saved === hashPin(pin); }
type PinLock = { readonly attempts: number; readonly until: number };
async function readLock(): Promise<PinLock> { try { const raw = await SecureStore.getItemAsync(pinLockKey); return raw ? JSON.parse(raw) as PinLock : { attempts: 0, until: 0 }; } catch { return { attempts: 0, until: 0 }; } }
export async function getPinLockUntil(): Promise<number> { const lock = await readLock(); if (lock.until > Date.now()) return lock.until; if (lock.attempts || lock.until) await SecureStore.deleteItemAsync(pinLockKey); return 0; }
export async function recordPinFailure(): Promise<number> { const lock = await readLock(); const attempts = lock.until && lock.until <= Date.now() ? 1 : lock.attempts + 1; const until = attempts >= 5 ? Date.now() + 5 * 60 * 1000 : 0; await SecureStore.setItemAsync(pinLockKey, JSON.stringify({ attempts, until })); return until; }
export async function resetPinFailures(): Promise<void> { await SecureStore.deleteItemAsync(pinLockKey); }
