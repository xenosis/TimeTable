#!/usr/bin/env node
const path = require('path');

const { addTask, getTask, listTasks, nextTasks, placeTask, setStatus, updateTask } = require('./commands.cjs');
const { BacklogConflictError, mutateBacklog, readBacklog } = require('./storage.cjs');
const { BacklogValidationError } = require('./validate.cjs');

function parseArgs(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2).replaceAll('-', '_');
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return { positionals, options };
}

function assertKnownOptions(options, allowed) {
  const unknown = Object.keys(options).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new Error(`알 수 없는 옵션: ${unknown.map((key) => `--${key.replaceAll('_', '-')}`).join(', ')}`);
}

function output(result, source, json) {
  if (json) {
    console.log(JSON.stringify({ source, ...result }, null, 2));
    return;
  }
  console.log(`source: ${source.path}`);
  console.log(`schema: ${source.schemaVersion}  sha256: ${source.sha256}`);
  if (result.task) console.log(JSON.stringify(result.task, null, 2));
  else {
    const page = result.page;
    console.log(`total=${page.total} returned=${page.returned} offset=${page.offset} nextOffset=${page.nextOffset ?? 'none'}`);
    for (const task of page.items) {
      console.log(`${task.id}\t${task.status}\t${task.priority ?? '-'}\t${task.category}\t${task.title}`);
    }
  }
}

function usage() {
  console.log(`사용법:
  npm run backlog -- list [--status S] [--priority P|null] [--category C] [--parent ID|null] [--owner O|null] [--done|--all] [--offset N] [--limit N] [--json] [--file PATH]
  npm run backlog -- get ID [--json] [--file PATH]
  npm run backlog -- next [--owner O|null] [--all] [--offset N] [--limit N] [--json] [--file PATH]
  npm run backlog -- add --id ID --title T --category C --summary S --done-when D --expect-hash SHA256 [--priority P|null] [--parent ID|null] [--deps ID,ID] [--where P|null] [--doc P|null] [--est N] [--gate TEXT|null] [--owner O|null] [--json] [--file PATH]
  npm run backlog -- update ID --expect-hash SHA256 --note TEXT [--title T] [--category C] [--summary S] [--done-when D] [--priority P|null] [--parent ID|null] [--deps ID,ID] [--where P|null] [--doc P|null] [--est N|null] [--gate TEXT|null] [--clear-completion] [--json] [--file PATH]
  npm run backlog -- place ID --after ID --note TEXT --expect-hash SHA256 [--file PATH]
  npm run backlog -- set-status ID STATUS --expect-hash SHA256 [--note TEXT] [--owner O|null] [--evidence TEXT --verification TEXT] [--json] [--file PATH]

누락 없는 순회: npm run backlog -- list --all --json`);
}

function main() {
  const { positionals, options } = parseArgs(process.argv.slice(2));
  const command = positionals.shift();
  if (!command || ['help', '-h'].includes(command)) {
    usage();
    return;
  }
  const filePath = path.resolve(options.file || 'backlog.json');
  const json = Boolean(options.json);

  if (command === 'list') {
    assertKnownOptions(options, ['file', 'json', 'status', 'priority', 'category', 'parent', 'owner', 'done', 'all', 'offset', 'limit']);
    if (positionals.length) throw new Error(`예상하지 않은 인수: ${positionals.join(' ')}`);
    const current = readBacklog(filePath);
    output({ page: listTasks(current.data, options) }, current.source, json);
    return;
  }
  if (command === 'get') {
    assertKnownOptions(options, ['file', 'json']);
    if (positionals.length !== 1) throw new Error('get에는 문자열 작업 ID 하나가 필요합니다.');
    const current = readBacklog(filePath);
    output({ task: getTask(current.data, positionals[0]) }, current.source, json);
    return;
  }
  if (command === 'next') {
    assertKnownOptions(options, ['file', 'json', 'owner', 'all', 'offset', 'limit']);
    if (positionals.length) throw new Error(`예상하지 않은 인수: ${positionals.join(' ')}`);
    const current = readBacklog(filePath);
    output({ page: nextTasks(current.data, options) }, current.source, json);
    return;
  }
  if (command === 'add') {
    assertKnownOptions(options, ['file', 'json', 'expect_hash', 'id', 'title', 'category', 'summary', 'done_when', 'priority', 'parent', 'deps', 'where', 'doc', 'est', 'gate', 'owner']);
    if (positionals.length) throw new Error(`예상하지 않은 인수: ${positionals.join(' ')}`);
    const result = mutateBacklog(filePath, options.expect_hash, (data) => addTask(data, options, new Date().toISOString()));
    console.log(JSON.stringify({ changed: options.id, before: result.before, after: result.after, backupPath: result.backupPath }, null, 2));
    return;
  }
  if (command === 'set-status') {
    assertKnownOptions(options, ['file', 'json', 'expect_hash', 'note', 'owner', 'evidence', 'verification']);
    if (positionals.length !== 2) throw new Error('set-status에는 ID와 새 STATUS가 필요합니다.');
    const [id, status] = positionals;
    const result = mutateBacklog(filePath, options.expect_hash, (data) => setStatus(data, id, status, options, new Date().toISOString()));
    console.log(JSON.stringify({ changed: id, status, before: result.before, after: result.after, backupPath: result.backupPath }, null, 2));
    return;
  }
  if (command === 'update') {
    assertKnownOptions(options, ['file', 'json', 'expect_hash', 'note', 'title', 'category', 'summary', 'done_when', 'priority', 'parent', 'deps', 'where', 'doc', 'est', 'gate', 'clear_completion']);
    if (positionals.length !== 1) throw new Error('update에는 문자열 작업 ID 하나가 필요합니다.');
    const [id] = positionals;
    const result = mutateBacklog(filePath, options.expect_hash, (data) => updateTask(data, id, options, new Date().toISOString()));
    console.log(JSON.stringify({ changed: id, before: result.before, after: result.after, backupPath: result.backupPath }, null, 2));
    return;
  }
  if (command === 'place') {
    assertKnownOptions(options, ['file', 'expect_hash', 'after', 'note']);
    if (positionals.length !== 1) throw new Error('place에는 옮길 문자열 작업 ID 하나가 필요합니다.');
    const [id] = positionals;
    const result = mutateBacklog(filePath, options.expect_hash, (data) => placeTask(data, id, options, new Date().toISOString()));
    console.log(JSON.stringify({ changed: id, after: options.after, before: result.before, afterSource: result.after, backupPath: result.backupPath }, null, 2));
    return;
  }
  throw new Error(`알 수 없는 서브명령: ${command}`);
}

try {
  main();
} catch (error) {
  const prefix = error instanceof BacklogConflictError ? 'CONFLICT'
    : error instanceof BacklogValidationError ? 'INVALID_BACKLOG'
      : error.code === 'NOT_FOUND' ? 'NOT_FOUND' : 'ERROR';
  console.error(`${prefix}: ${error.message}`);
  process.exit(prefix === 'CONFLICT' ? 3 : prefix === 'NOT_FOUND' ? 4 : 2);
}
