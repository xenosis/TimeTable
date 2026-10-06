import { bumpChildChangeVersion } from './childChangeVersion';
import type { TimetableDatabase } from './types';

/**
 * 체크·보석 기록과 동기화 교체가 서로 겹치지 않게 세우는 한 줄(같은 SQLite 연결을 함께 쓰므로).
 * 보상 저장소와 보석 자격 저장소가 같이 쓰도록 따로 둔다(서로 불러오는 순환을 피함).
 */
type QueueDatabase = Pick<TimetableDatabase, 'execAsync'>;
let transactionQueue: Promise<unknown> = Promise.resolve();

/** 줄에만 세운다(트랜잭션은 action이 직접 연다). */
export function withRewardQueue<T>(action: () => Promise<T>): Promise<T> {
  const run = transactionQueue.then(action);
  transactionQueue = run.catch(() => undefined);
  return run;
}

/** 줄에 세워 한 트랜잭션으로 실행하고, 성공하면 딸 폰 기록 변경 횟수를 올린다(동기화 P6.14가 쓴다). */
export function withRewardTransaction<T>(database: QueueDatabase, action: () => Promise<T>): Promise<T> {
  return withRewardQueue(async () => {
    await database.execAsync('BEGIN IMMEDIATE');
    try { const result = await action(); await database.execAsync('COMMIT'); bumpChildChangeVersion(); return result; }
    catch (error) { await database.execAsync('ROLLBACK'); throw error; }
  });
}
