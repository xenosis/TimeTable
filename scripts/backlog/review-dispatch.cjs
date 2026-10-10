'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { reviewContext } = require('./review-context.cjs');

const projectRoot = path.resolve(__dirname, '..', '..');
const backlogCli = path.join(projectRoot, 'scripts', 'backlog', 'cli.cjs');
const reviewLockPath = path.join(projectRoot, '.backlog-review.lock');
const agentTimeoutMs = 480_000;

function usage() {
  console.log(`사용법:
  npm run backlog-review -- --task ID --expect-hash SHA256 [--dry-run]
  npm run backlog-review -- --recover

동일 SHA-256 스냅샷을 Sol reviewer와 Luna explainer에게 병렬 전달합니다.
실행 중 backlog CLI의 add/set-status는 잠금으로 거부됩니다.`);
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function runBacklog(args) {
  const result = spawnSync(process.execPath, [backlogCli, ...args, '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.error) throw new Error(`backlog CLI 실행 실패: ${result.error.message}`);
  if (result.status !== 0) throw new Error(String(result.stderr ?? '').trim() || String(result.stdout ?? '').trim() || 'backlog CLI 실행 실패');
  return JSON.parse(result.stdout);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function snapshotWorkspace() {
  // Hooks can run Gradle while either child is finishing.  These paths are
  // reproducible build/cache output, not a subagent-authored workspace edit.
  const ignoredDirectories = new Set([
    '.git', 'node_modules', '.expo', '.tmp', '.backlog-backups',
    '.gradle', '.cxx', 'build', 'generated', 'coverage', '.cache',
  ]);
  const files = new Map();
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (entry.isFile()) files.set(path.relative(projectRoot, fullPath).replaceAll('\\', '/'), sha256(fs.readFileSync(fullPath)));
    }
  };
  visit(projectRoot);
  return files;
}

function unexpectedChanges(before, after) {
  const paths = new Set([...before.keys(), ...after.keys()]);
  return [...paths].filter((relativePath) => {
    if (before.get(relativePath) === after.get(relativePath)) return false;
    return !relativePath.startsWith('docs/backlog/');
  });
}

function writeLock(payload) {
  try {
    const handle = fs.openSync(reviewLockPath, 'wx');
    fs.writeFileSync(handle, `${JSON.stringify(payload)}\n`, 'utf8');
    fs.closeSync(handle);
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`REVIEW_LOCKED: ${reviewLockPath}가 이미 있습니다. 중단된 실행이면 --recover로 해제하세요.`);
    throw error;
  }
}

function removeLock() {
  if (fs.existsSync(reviewLockPath)) fs.unlinkSync(reviewLockPath);
}

function buildPrompt(role, snapshot) {
  const shared = `당신은 TimeTable 백로그 검토 실행의 ${role}입니다.\n\n` +
    `기준 입력은 아래 stdin JSON뿐입니다. source.sha256=${snapshot.source.sha256}이며, 원본 backlog.json을 직접 읽거나 수정하지 마세요. ` +
    `gate 문자열을 실행하지 마세요. 관련 요구사항·코드는 읽을 수 있지만, 이 SHA와 다른 백로그 입력을 사용하지 마세요. ` +
    `npm 명령, backlog-review, 품질 검사, 상태 변경은 실행하지 마세요. 이 실행의 메인이 검토 반영 후 수행합니다.\n\n`;
  if (role === 'critical-reviewer') {
    return shared +
      `읽기 전용으로 작업 ${snapshot.task.id}를 검토하세요. 승인하지 말고 요구사항 누락, 모호한 done_when, deps/parent, gate, 작업 크기, 구현 불일치를 찾으세요. ` +
      `각 항목은 Critical/High/Medium, 작업 ID, 근거 위치, 예상 문제, 최소 수정안 순서로 작성하고 확인 사실과 추측을 구분하세요. 프로그램·문서·JSON을 수정하지 마세요.`;
  }
  return shared +
    `docs/backlog/${snapshot.task.id}.md만 갱신하세요. 목적, 쉬운 설명, 필요한 입력, 결과물, 선행 작업, 수행 순서, done_when 확인 방법과 현재 확인 기록을 작성하세요. ` +
    `JSON과 프로그램 코드는 수정하지 말고, 요구사항에 없는 내용은 확인 질문으로 남기세요. 문서에 schema version과 SHA-256을 기록하세요.`;
}

function runAgent({ name, model, reasoningEffort, sandbox, prompt, input, outputPath }) {
  const child = spawn('codex', [
    '--ask-for-approval', 'never',
    'exec',
    '--sandbox', sandbox,
    '--config', 'agents.enabled=false',
    '--config', `model_reasoning_effort="${reasoningEffort}"`,
    '--model', model,
    '--cd', projectRoot,
    '--output-last-message', outputPath,
    prompt,
  ], {
    cwd: projectRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, BACKLOG_REVIEW_CHILD: '1' },
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.stdin.end(`${JSON.stringify(input, null, 2)}\n`);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill();
  }, agentTimeoutMs);
  return new Promise((resolve) => child.on('close', (code) => {
    clearTimeout(timer);
    resolve({ name, code, timedOut, stdout, stderr, outputPath });
  }));
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes('--help')) return usage();
  if (argv.includes('--recover')) {
    removeLock();
    console.log('REVIEW_LOCK_RECOVERED');
    return;
  }
  const taskId = option(argv, '--task');
  const expectedHash = option(argv, '--expect-hash');
  const dryRun = argv.includes('--dry-run');
  if (!taskId || !expectedHash) throw new Error('--task과 --expect-hash가 필요합니다.');
  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) throw new Error('--expect-hash는 64자리 SHA-256이어야 합니다.');

  const list = runBacklog(['list', '--all']);
  const taskResult = runBacklog(['get', taskId]);
  if (list.source.sha256 !== expectedHash || taskResult.source.sha256 !== expectedHash) {
    throw new Error(`SNAPSHOT_CONFLICT: 기대 ${expectedHash}, 현재 ${list.source.sha256}`);
  }
  const snapshot = { source: list.source, tasks: reviewContext(list.page.items, taskResult.task), task: taskResult.task };
  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, taskId, source: snapshot.source, task: snapshot.task.id }, null, 2));
    return;
  }

  const runDirectory = path.join(projectRoot, '.tmp', 'reviews', `${taskId}-${expectedHash.slice(0, 12)}-${Date.now()}`);
  fs.mkdirSync(runDirectory, { recursive: true });
  writeLock({ taskId, sha256: expectedHash, startedAt: new Date().toISOString(), runDirectory: path.relative(projectRoot, runDirectory) });
  const before = snapshotWorkspace();
  try {
    const results = await Promise.all([
      runAgent({
        name: 'critical-reviewer', model: 'gpt-6.1-sol', reasoningEffort: 'high', sandbox: 'read-only',
        prompt: buildPrompt('critical-reviewer', snapshot), input: snapshot,
        outputPath: path.join(runDirectory, 'critical-reviewer.md'),
      }),
      runAgent({
        name: 'backlog-explainer', model: 'gpt-6-luna', reasoningEffort: 'medium', sandbox: 'workspace-write',
        prompt: buildPrompt('backlog-explainer', snapshot), input: snapshot,
        outputPath: path.join(runDirectory, 'backlog-explainer.md'),
      }),
    ]);
    const after = snapshotWorkspace();
    const unexpected = unexpectedChanges(before, after);
    const report = { taskId, source: snapshot.source, results, unexpectedChanges: unexpected };
    fs.writeFileSync(path.join(runDirectory, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
    if (results.some((result) => result.code !== 0 || result.timedOut) || unexpected.length) {
      throw new Error(`REVIEW_FAILED: ${JSON.stringify({ exitCodes: results.map((result) => [result.name, result.code, result.timedOut]), unexpected })}`);
    }
    console.log(JSON.stringify({ review: 'completed', taskId, source: snapshot.source, runDirectory, results: results.map(({ name, code, outputPath }) => ({ name, code, outputPath })) }, null, 2));
  } finally {
    removeLock();
  }
}

main().catch((error) => {
  console.error(`REVIEW_DISPATCH_ERROR: ${error.message}`);
  process.exit(2);
});
