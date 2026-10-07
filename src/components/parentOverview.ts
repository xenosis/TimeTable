import { getDatabase } from '../db/database';
import { getStickerSummary, type StickerSummary } from '../db/stickerRepository';
import { getTodayTasks, type TodayTask } from '../db/taskRepository';
import type { ChildDeviceStatus } from '../server/childDeviceStatus';
import { formatSyncTime } from '../sync/syncStatus';
import { toLocalDateStr } from '../utils/date';

export type ParentOverview = { readonly tasks: readonly TodayTask[]; readonly stickers: StickerSummary };

/**
 * 아빠 화면의 딸 오늘 할 일·보석 현황(P6.8). 아빠 폰도 로그인하면 서버 내용을 그대로 받아 두므로(P6.13) 이 폰의 DB를 읽는다.
 * 딸이 체크하면 딸 폰이 서버에 올리고, Realtime 신호로 아빠 폰이 다시 받아 온 뒤 화면이 이 값을 새로 읽는다.
 */
export async function loadParentOverview(now = new Date()): Promise<ParentOverview> {
  const database = await getDatabase();
  const tasks = await getTodayTasks(database, toLocalDateStr(now), now.getDay());
  return { tasks, stickers: await getStickerSummary(database) };
}

/** 오늘 할 일 진행 한 줄. 못 한 일은 '아직 남았어요'로 표현한다(디자인 원칙). */
export function taskProgressLine(tasks: readonly TodayTask[]): string {
  if (tasks.length === 0) return '오늘은 할 일이 없어요.';
  const done = tasks.filter((task) => task.completed === 1).length;
  return done === tasks.length ? `오늘 할 일 ${tasks.length}개를 모두 했어요.` : `오늘 할 일 ${tasks.length}개 중 ${done}개 했어요. ${tasks.length - done}개가 아직 남았어요.`;
}

/** 보석 한 줄. 작은 보석과 큰 보석은 종류가 달라 따로 보이고, 보상 목표가 있으면 남은 개수를 붙인다. */
export function stickerLine(stickers: StickerSummary): string {
  const counts = `작은 보석 ${stickers.gems}개 · 큰 보석 ${stickers.largeGems}개`;
  if (!stickers.goal) return counts;
  return stickers.remaining === 0 ? `${counts} · '${stickers.goal.title}' 목표를 채웠어요` : `${counts} · '${stickers.goal.title}'까지 ${stickers.remaining}개 남음`;
}

export type Remote = { readonly state: 'loading' } | { readonly state: 'ready'; readonly device: ChildDeviceStatus | null } | { readonly state: 'error'; readonly message: string };

/**
 * 딸 폰 마지막 동기화 한 줄(서버 기기 기록 조회 결과). 이 폰에서 마지막으로 편집을 저장한 시각(lastEditAt)이 있으면
 * 딸 폰이 그 뒤에 맞췄는지로 '반영 완료'/'아직 반영 전'을 덧붙인다(research.md 6절).
 */
export function childSyncLine(remote: Remote, lastEditAt: string | null = null, now = new Date()): string {
  if (remote.state === 'loading') return '딸 폰 기록을 불러오는 중이에요.';
  if (remote.state === 'error') return remote.message;
  if (!remote.device?.lastSyncedAt) return '딸 폰이 아직 서버와 맞춘 적이 없어요.';
  const version = remote.device.appVersion ? ` (앱 ${remote.device.appVersion})` : '';
  const line = `딸 폰이 마지막으로 맞춘 때: ${formatSyncTime(remote.device.lastSyncedAt, now)}${version}`;
  const editTime = lastEditAt ? new Date(lastEditAt).getTime() : NaN;
  if (Number.isNaN(editTime)) return line;
  return new Date(remote.device.lastSyncedAt).getTime() >= editTime
    ? `딸 폰 반영 완료 (${formatSyncTime(remote.device.lastSyncedAt, now)})${version}`
    : `${line}\n${formatSyncTime(lastEditAt, now)}에 고친 내용은 아직 딸 폰에 반영 전이에요. 딸 폰에서 앱을 열면 반영돼요.`;
}
