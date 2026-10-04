const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { beforeEach } = require('@jest/globals');

const hookDirectory = path.resolve(process.cwd(), '.codex/hooks');
let root;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-quality-hooks-'));
  fs.mkdirSync(path.join(root, 'scripts'));
  fs.writeFileSync(path.join(root, 'package.json'), '{}');
  fs.writeFileSync(path.join(root, 'scripts/run-quality-checks.cjs'), '');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

function runHook(name, input, status = 0, env = {}) {
  const stdin = new EventEmitter();
  stdin.setEncoding = jest.fn();
  const spawnSync = jest.fn(() => ({ status, stdout: '', stderr: '' }));
  const exit = new Error('hook exit');
  let code;
  const hookProcess = {
    stdin, env, execPath: process.execPath, cwd: () => root,
    exit: (value) => { code = value; throw exit; },
  };
  vm.runInNewContext(fs.readFileSync(path.join(hookDirectory, name), 'utf8'), {
    require: (module) => module === 'child_process' ? { spawnSync } : require(module),
    process: hookProcess,
    console: { log: jest.fn(), error: jest.fn() },
  });
  stdin.emit('data', JSON.stringify({ cwd: root, session_id: 'one', ...input }));
  try { stdin.emit('end'); } catch (error) { if (error !== exit) throw error; }
  return { code, spawnSync };
}

function edit(file, session = 'one') {
  return runHook('post-edit-check.cjs', {
    session_id: session, tool_input: { command: `*** Delete File: ${file}\n` },
  });
}

function flag(session = 'one') {
  return path.join(root, 'node_modules/.cache/codex-quality-edited', session);
}

test('a read-only conversation skips all checks', () => {
  const result = runHook('quality-stop.cjs', {});
  expect(result.code).toBe(0);
  expect(result.spawnSync).not.toHaveBeenCalled();
});

test.each(['.codex/config.toml', 'docs/research.md', 'backlog.json', 'package.json'])(
  'editing %s does not trigger the full check', (file) => {
    edit(file);
    expect(fs.existsSync(flag())).toBe(false);
    expect(runHook('quality-stop.cjs', {}).spawnSync).not.toHaveBeenCalled();
  },
);

test('source deletion triggers one check, then successful verification clears it', () => {
  edit('src/deleted.ts');
  expect(fs.existsSync(flag())).toBe(true);
  const result = runHook('quality-stop.cjs', {});
  expect(result.spawnSync).toHaveBeenCalledTimes(1);
  expect(result.spawnSync.mock.calls[0][1]).toEqual(['scripts/run-quality-checks.cjs']);
  expect(fs.existsSync(flag())).toBe(false);
  expect(runHook('quality-stop.cjs', {}).spawnSync).not.toHaveBeenCalled();
});

test('changes in a different session do not trigger checks here', () => {
  edit('app/index.tsx', 'two');
  expect(runHook('quality-stop.cjs', {}).spawnSync).not.toHaveBeenCalled();
  expect(fs.existsSync(flag('two'))).toBe(true);
});

test('failed verification retains the flag for a retry', () => {
  edit('src/example.ts');
  expect(runHook('quality-stop.cjs', {}, 1).code).toBe(2);
  expect(fs.existsSync(flag())).toBe(true);
  expect(runHook('quality-stop.cjs', {}).spawnSync).toHaveBeenCalledTimes(1);
});

test('review children defer verification to their main process', () => {
  edit('src/example.ts');
  const result = runHook('quality-stop.cjs', {}, 0, { BACKLOG_REVIEW_CHILD: '1' });
  expect(result.spawnSync).not.toHaveBeenCalled();
  expect(fs.existsSync(flag())).toBe(true);
});

test.each([
  { input: `*** Add File: src/new.ts\n` },
  { patch: `*** Update File: src/example.ts\n*** Move to: src/renamed.ts\n` },
  { file_path: path.join('src', 'written.ts') },
  `*** Update File: src/example.ts\n`,
])('supports edit tool input %j', (toolInput) => {
  runHook('post-edit-check.cjs', { tool_input: toolInput });
  expect(fs.existsSync(flag())).toBe(true);
});
