import { getDatabase } from '../db/database';
import type { TimetableDatabase } from '../db/types';
import { getSupabase } from './supabaseClient';
import type { AccountState } from './account';

/** 서버 함수 tt_import_local이 받는 묶음의 키. 로컬 테이블 이름과 같다(supabase/migrations/20261006000000_tt_gem_rights_import.sql). */
export const importTables = [
  'periods', 'timetable_sets', 'timetable_items', 'day_exceptions', 'tasks', 'task_completions',
  'task_completion_history', 'sticker_ledger', 'rewards', 'gem_rights',
] as const;
export type ImportTable = (typeof importTables)[number];
export type ImportCounts = Readonly<Record<ImportTable, number>> & { readonly timetable_settings: number };
type Row = Record<string, unknown>;
export type ImportPayload = Record<ImportTable, Row[]> & { timetable_settings: Row | null };

const LOCAL_FAMILY = 'local-family';
const DONE_KEY = 'tt.import.done';

/** 로컬 SQLite의 행을 가공 없이 모은다. 시각·요일 형식 변환과 id 다시 붙이기는 서버 함수가 한다. */
export async function readLocalPayload(database: Pick<TimetableDatabase, 'getAllAsync'>): Promise<ImportPayload> {
  const byFamily = (table: string) => database.getAllAsync<Row>(`SELECT * FROM ${table} WHERE family_id = ? ORDER BY id`, LOCAL_FAMILY);
  const [periods, timetableSets, timetableItems, dayExceptions, tasks, stickerLedger, rewards, gemRights, settings, completions, history] = await Promise.all([
    byFamily('periods'), byFamily('timetable_sets'), byFamily('timetable_items'), byFamily('day_exceptions'), byFamily('tasks'),
    byFamily('sticker_ledger'), byFamily('rewards'), byFamily('gem_rights'),
    database.getAllAsync<Row>('SELECT active_set_id FROM timetable_settings WHERE family_id = ?', LOCAL_FAMILY),
    // 완료 기록에는 family_id가 없어 할 일을 거쳐 이 가족 것만 고른다
    database.getAllAsync<Row>('SELECT c.* FROM task_completions c JOIN tasks t ON t.id = c.task_id WHERE t.family_id = ? ORDER BY c.id', LOCAL_FAMILY),
    database.getAllAsync<Row>('SELECT h.* FROM task_completion_history h JOIN tasks t ON t.id = h.task_id WHERE t.family_id = ? ORDER BY h.task_id, h.completion_date', LOCAL_FAMILY),
  ]);
  return {
    periods, timetable_sets: timetableSets, timetable_items: timetableItems, day_exceptions: dayExceptions, tasks,
    task_completions: completions, task_completion_history: history, sticker_ledger: stickerLedger, rewards, gem_rights: gemRights,
    timetable_settings: settings[0] ?? null,
  };
}

/** 올릴 데이터가 있는지(시간표·할 일·보석 중 하나라도). 빈 폰에서 올려 서버를 '이미 이전됨'으로 막는 일을 피한다. */
export function hasLocalData(payload: ImportPayload): boolean {
  return importTables.some((table) => payload[table].length > 0);
}

/** 서버가 넣었다고 알려 준 개수가 로컬 개수와 모두 같은지. 다르면 이전 성공으로 보지 않는다. */
export function countsMatch(payload: ImportPayload, counts: Partial<Record<string, unknown>>): boolean {
  const settings = payload.timetable_settings ? 1 : 0;
  return importTables.every((table) => counts[table] === payload[table].length) && (counts.timetable_settings ?? 0) === settings;
}

/** 딸 계정으로 로그인해 가족에 연결된 폰에서만 이전할 수 있다(아빠 폰의 빈 데이터가 먼저 올라가지 않게). */
export function canImport(account: AccountState): account is Extract<AccountState, { kind: 'signedIn' }> & { membership: { role: 'child'; familyId: string } } {
  return account.kind === 'signedIn' && !account.offline && account.membership?.role === 'child';
}

export function importAlreadyDone(familyId: string): boolean {
  try {
    return globalThis.localStorage?.getItem(DONE_KEY) === familyId;
  } catch {
    return false;
  }
}

/** 서버 오류를 화면용 한글 문구로 바꾼다. 서버 함수가 보낸 한글 이유(TT_IMPORT: …)는 그대로 보여 준다. */
export function importErrorMessage(error: unknown): string {
  const message = typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : '';
  const reason = /TT_IMPORT: (.+)$/.exec(message)?.[1];
  if (reason) return reason;
  if (/network|fetch|timed? ?out/i.test(message)) return '인터넷 연결을 확인한 뒤 다시 해 주세요.';
  return '서버로 올리지 못했어요. 이 폰의 데이터는 그대로예요. 잠시 뒤 다시 해 주세요.';
}

/** 이 폰의 로컬 데이터를 서버로 한 번 올린다. 서버 함수가 한 트랜잭션으로 넣으므로 실패하면 서버에는 아무것도 남지 않는다. */
export async function importLocalData(familyId: string): Promise<ImportCounts> {
  const payload = await readLocalPayload(await getDatabase());
  if (!hasLocalData(payload)) throw new Error('이 폰에 올릴 데이터가 없어요.');
  const { data, error } = await getSupabase().rpc('tt_import_local', { p_family: familyId, p_payload: payload });
  if (error) throw new Error(importErrorMessage(error));
  if (!data || typeof data !== 'object' || !countsMatch(payload, data as Record<string, unknown>)) {
    throw new Error('서버에 올라간 개수가 이 폰과 달라요. 아빠에게 알려 주세요.');
  }
  globalThis.localStorage?.setItem(DONE_KEY, familyId);
  return data as ImportCounts;
}
