/** @jest-environment node */
import { MAX_MEMO_LENGTH } from '../src/db/timetableRepository';
import { timetableCategories } from '../src/db/types';
import { colorKeys, iconKeys } from '../src/theme';

// 서버 스키마(supabase/migrations)가 앱 코드와 어긋나지 않는지 정적으로 검사한다.
// 실제 Postgres에 적용해 보는 검증은 아니므로, 적용 결과는 Supabase에서 따로 확인해야 한다.
/* eslint-disable @typescript-eslint/no-require-imports */
// @types/node를 추가하지 않고(라이브러리 정책) Node 내장 모듈을 require로 불러온다. jest는 프로젝트 루트에서 실행된다
const { readFileSync, readdirSync } = require('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string; readdirSync(path: string): string[] };
/* eslint-enable @typescript-eslint/no-require-imports */

const directory = 'supabase/migrations';
const files = readdirSync(directory).filter((name: string) => name.endsWith('.sql')).sort();
const read = (suffix: string) => readFileSync(`${directory}/${files.find((name: string) => name.endsWith(suffix)) ?? ''}`, 'utf8');
const schema = read('_tt_schema.sql');
const rls = read('_tt_rls.sql');
const gemImport = read('_tt_gem_rights_import.sql');
const importGuard = read('_tt_import_guard.sql');
const familyEdit = read('_tt_apply_family_edit.sql');
const realtime = read('_tt_realtime.sql');
const pushInstallation = read('_tt_push_installation.sql');

const createdTables = [...schema.matchAll(/create table public\.(tt_\w+)/g)].map((match) => match[1]);
const quoted = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

describe('supabase 마이그레이션', () => {
  it('파일 이름이 시간순으로 스키마 → 보안 규칙 → 보석 자격·이전 함수 순서로 적용되게 정렬된다', () => {
    expect(files.map((name: string) => name.replace(/^\d+_/, ''))).toEqual(['tt_schema.sql', 'tt_rls.sql', 'tt_gem_rights_import.sql', 'tt_import_guard.sql', 'tt_apply_family_edit.sql', 'tt_realtime.sql', 'tt_mark_gems_given.sql', 'tt_push_delivery_queue.sql', 'tt_push_installation.sql', 'tt_school_profile.sql', 'tt_device_sync_installation.sql']);
  });

  it('보석 자격 테이블도 RLS·권한·anon 회수가 다른 가족 테이블과 같다(P6.5)', () => {
    expect(gemImport).toContain('create table public.tt_gem_rights');
    expect(gemImport).toContain('alter table public.tt_gem_rights enable row level security;');
    expect(gemImport).toContain('using ((select tt_private.is_family_member(family_id)))');
    expect(gemImport).toContain('grant select, insert, update, delete on public.tt_gem_rights to authenticated, service_role;');
    expect(gemImport).toContain('revoke all on public.tt_gem_rights from anon;');
    expect(gemImport).toContain('revoke truncate, references, trigger on public.tt_gem_rights from authenticated;');
    // 로컬 gem_rights의 상태 값과 같다
    expect(gemImport).toContain("check (state in ('available', 'requested', 'given'))");
  });

  it('이전 함수는 호출한 사람 권한(RLS 적용)으로 돌고 로그인한 사용자만 부를 수 있다', () => {
    expect(gemImport).toMatch(/create function public\.tt_import_local\(p_family uuid, p_payload jsonb\) returns jsonb\r?\nlanguage plpgsql\r?\nsecurity invoker\r?\nset search_path = ''/);
    expect(gemImport).not.toMatch(/security definer/);
    expect(gemImport).toContain('revoke execute on function public.tt_import_local(uuid, jsonb) from public, anon;');
    expect(gemImport).toContain('grant execute on function public.tt_import_local(uuid, jsonb) to authenticated;');
    expect(gemImport).toContain("raise exception 'TT_IMPORT: 서버에 이미 이 가족의 데이터가 있습니다'");
  });

  it('편집 저장 함수는 호출자 권한(RLS)으로 한 트랜잭션에 저장하고, 덮어쓰기·되살리기·완료 이력 할 일 지우기를 거부한다(P6.15)', () => {
    expect(familyEdit).toMatch(/create function public\.tt_apply_family_edit\(p_family uuid, p_edit jsonb\) returns void\r?\nlanguage plpgsql\r?\nsecurity invoker\r?\nset search_path = ''/);
    expect(familyEdit).not.toMatch(/security definer/);
    expect(familyEdit).toContain('revoke execute on function public.tt_apply_family_edit(uuid, jsonb) from public, anon;');
    expect(familyEdit).toContain('grant execute on function public.tt_apply_family_edit(uuid, jsonb) to authenticated;');
    expect(familyEdit).toContain('exception when unique_violation then');
    expect(familyEdit).toContain("raise exception 'TT_EDIT: 다른 기기에서 지운 항목이에요");
    expect(familyEdit).toContain('tt_task_completion_history');
    expect(familyEdit).toContain('pg_advisory_xact_lock');
  });

  it('Realtime 게시는 가족 데이터 테이블만 넣고 기기 기록은 빼며, 삭제도 거를 수 있게 replica identity full을 켠다(P6.7)', () => {
    // 서버 게시 목록과 앱이 듣는 목록이 같아야 한다(어긋나면 그 테이블 변경을 조용히 놓친다)
    const published = [...(realtime.match(/foreach t in array array\[([^\]]*)\]/)?.[1] ?? '').matchAll(/'(tt_\w+)'/g)].map((m) => m[1]).sort();
    const appSource = readFileSync('src/sync/realtimeSync.ts', 'utf8');
    const appTables = [...(appSource.match(/export const realtimeTables = \[([\s\S]*?)\] as const/)?.[1] ?? '').matchAll(/'(tt_\w+)'/g)].map((m) => m[1]).sort();
    expect(appTables.length).toBe(11);
    expect(published).toEqual(appTables);
    expect(realtime).not.toMatch(/'tt_devices'|'tt_families'|'tt_family_members'/);
    expect(realtime).toContain('replica identity full');
    expect(realtime).toContain('alter publication supabase_realtime add table');
  });

  it('설치본 기기 등록은 비밀 값의 해시만 비공개 스키마에 두고, 딸 계정만 로그인 상태로 등록할 수 있다(P6.9)', () => {
    expect(pushInstallation).toContain('create table tt_private.push_installations');
    expect(pushInstallation).toContain('secret_hash bytea not null check (octet_length(secret_hash) = 32)');
    expect(pushInstallation).toContain('revoke all on tt_private.push_installations from public, anon, authenticated;');
    expect(pushInstallation).toContain("m.user_id = caller and m.role = 'child'");
    // 공개 스키마 함수는 호출자 권한으로 감싸기만 하고, 권한이 필요한 본체는 비공개 스키마에 둔다
    expect(pushInstallation).toMatch(/create function public\.tt_register_push_installation\([^)]*\) returns uuid language sql security invoker/);
    expect(pushInstallation).not.toMatch(/create function public\.[^(]*\([^)]*\)[^;]*security definer/);
    expect(pushInstallation).toMatch(/from public, anon;\s*grant execute on function tt_private\.register_push_installation/);
  });

  it('이전 함수 보완: 호출한 딸 계정만 이전하고 같은 가족 동시 호출은 잠금으로 하나씩 처리한다', () => {
    expect(importGuard).toContain('create or replace function public.tt_import_local(p_family uuid, p_payload jsonb) returns jsonb');
    expect(importGuard).toContain('security invoker');
    expect(importGuard).not.toMatch(/security definer/);
    expect(importGuard).toContain('pg_advisory_xact_lock');
    expect(importGuard).toContain("m.user_id = (select auth.uid()) and m.role = 'child'");
  });

  it('모든 테이블 이름에 tt_ 접두사가 붙어 Doro 테이블과 겹치지 않는다', () => {
    expect(createdTables.length).toBeGreaterThanOrEqual(13);
    for (const match of schema.matchAll(/create table (?:if not exists )?(?:public\.)?(\w+)/g)) expect(match[1]).toMatch(/^tt_/);
  });

  it('만든 모든 테이블에 보안 규칙(RLS)을 켜고 anon 권한을 회수한다', () => {
    const enabledDirectly = [...rls.matchAll(/alter table public\.(tt_\w+) enable row level security/g)].map((match) => match[1]);
    const loopLists = [...rls.matchAll(/foreach t in array array\[([^\]]*)\]/g)].map((match) => [...match[1].matchAll(/'(tt_\w+)'/g)].map((item) => item[1]));
    const enabledInLoop = loopLists[0] ?? [];
    const grantedInLoop = loopLists[1] ?? [];
    const revokedInLoop = loopLists[2] ?? [];
    for (const table of createdTables) {
      expect([...enabledDirectly, ...enabledInLoop]).toContain(table);
      expect(grantedInLoop).toContain(table);
      expect(revokedInLoop).toContain(table);
    }
  });

  it('새 테이블 자동 노출 중단(2026-10-30)에 대비해 로그인 사용자에게만 테이블·시퀀스 권한을 직접 준다', () => {
    expect(rls).toContain("grant select, insert, update, delete on public.%I to authenticated, service_role");
    expect(rls).toContain("grant usage, select on sequence %s to authenticated, service_role");
    expect(rls).toContain("revoke all on public.%I from anon");
    expect(rls).toContain("revoke all on sequence %s from anon");
    // Doro와 같은 프로젝트라 스키마 전체에 주는 grant는 쓰지 않는다
    expect(rls).not.toMatch(/grant [^;]* on all (tables|sequences) in schema public/i);
  });

  it('보안 규칙에 쓰는 소속 확인 함수는 로그인한 사용자에게만 실행 권한을 준다', () => {
    for (const fn of ['tt_private.is_family_member(uuid)', 'tt_private.is_family_parent(uuid)', 'public.tt_create_family(text, text)']) {
      expect(rls).toContain(`revoke execute on function ${fn} from public, anon;`);
      expect(rls).toContain(`grant execute on function ${fn} to authenticated;`);
    }
    expect((rls.match(/^security definer$/gm) ?? []).length).toBe(3);
    expect((rls.match(/^set search_path = ''$/gm) ?? []).length).toBe(3);
  });

  it('정책 안의 auth.uid()는 select로 감싸 한 번만 계산한다', () => {
    for (const match of rls.matchAll(/auth\.uid\(\)/g)) expect(rls.slice(Math.max(0, (match.index ?? 0) - 8), match.index)).toBe('(select ');
  });

  it('메모 최대 길이와 종류·색·아이콘 목록이 앱 코드와 같다', () => {
    expect(schema).toContain(`char_length(memo) <= ${MAX_MEMO_LENGTH}`);
    expect(schema).toContain(`category in (${quoted(timetableCategories)})`);
    expect(schema).toContain(`color_key in (${quoted(colorKeys)})`);
    expect(schema).toContain(`icon_key in (${quoted(iconKeys)})`);
  });

  it('로컬 id를 그대로 이전할 수 있게 identity가 generated by default다', () => {
    expect(schema).not.toContain('generated always');
    expect(schema).toContain('generated by default as identity');
  });

  it('외래키가 있는 테이블마다 가족 기준 인덱스가 있다', () => {
    for (const table of createdTables.filter((name: string) => name !== 'tt_families' && name !== 'tt_family_members')) {
      const hasIndex = new RegExp(`create (?:unique )?index \\w+ on public\\.${table} \\(family_id`).test(schema)
        || new RegExp(`create table public\\.${table} \\([^;]*(?:unique \\(family_id|family_id uuid primary key)`).test(schema);
      expect({ table, hasIndex }).toEqual({ table, hasIndex: true });
    }
  });
});
