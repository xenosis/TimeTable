const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

let rawInput = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { rawInput += chunk; });
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(rawInput || '{}');
  } catch {
    console.error('POST_EDIT_CHECK_UNVERIFIED: Codex hook 입력 JSON을 파싱할 수 없습니다.');
    process.exit(2);
  }

  const projectRoot = findProjectRoot(input.cwd || process.cwd(), 'package.json');
  const patchText = String(input.tool_input?.command || '');
  const relativeFiles = extractPatchFiles(patchText);
  const failures = [];

  if (relativeFiles.some((file) => /^(?:CLAUDE|AGENTS)\.md$/i.test(file))) {
    const result = runNode(projectRoot, ['scripts/check-agent-instructions.cjs'], 5_000);
    if (!passed(result)) failures.push(formatFailure('지침 동기화', result, 5));
  }

  const sourceFiles = relativeFiles
    .map((file) => path.resolve(projectRoot, file))
    .filter((file) => isManagedSource(projectRoot, file) && fs.existsSync(file));

  if (sourceFiles.length > 0) {
    const lengthResult = runNode(projectRoot, ['scripts/check-file-length.cjs', ...sourceFiles], 5_000);
    if (!passed(lengthResult)) failures.push(formatFailure('코드 길이', lengthResult, 5));

    const lintFiles = sourceFiles.filter((file) => /\.(?:cjs|js|jsx|mjs|ts|tsx)$/i.test(file));
    if (lintFiles.length > 0) {
      const eslintBin = path.join(projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
      if (!fs.existsSync(eslintBin)) {
        failures.push('lint NOT_CONFIGURED: node_modules/eslint/bin/eslint.js가 없습니다. 의존성을 복구한 뒤 npm run lint를 실행하세요.');
      } else {
        const lintResult = runNode(projectRoot, [eslintBin, ...lintFiles, '--no-cache', '--max-warnings', '0'], 45_000);
        if (!passed(lintResult)) failures.push(formatFailure('lint', lintResult, 45));
      }
    }
  }

  if (failures.length > 0) {
    console.error(`POST_EDIT_CHECK_FAILED:\n${failures.join('\n\n')}\n수정 후 파일을 다시 저장하세요.`);
    process.exit(2);
  }
  process.exit(0);
});

function extractPatchFiles(patchText) {
  return [...patchText.matchAll(/^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/gim)]
    .map((match) => match[1].replaceAll('\\', '/'));
}

function findProjectRoot(startPath, marker) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(path.join(current, marker))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(startPath);
    current = parent;
  }
}

function isManagedSource(projectRoot, filePath) {
  const relative = path.relative(projectRoot, filePath);
  return !relative.startsWith('..')
    && /\.(?:cjs|css|html|js|jsx|mjs|ts|tsx|java|kt)$/i.test(filePath)
    && /^(?:app|src|__tests__|scripts|dashboard|\.claude[\\/]hooks|\.codex[\\/]hooks|android[\\/]app[\\/]src)(?:[\\/]|$)/i.test(relative);
}

function runNode(projectRoot, args, timeout) {
  return spawnSync(process.execPath, args, { cwd: projectRoot, encoding: 'utf8', timeout, windowsHide: true });
}

function passed(result) {
  return result.status === 0 && !result.error;
}

function formatFailure(name, result, timeoutSeconds) {
  if (result.error?.code === 'ETIMEDOUT') return `${name} TIMEOUT_UNVERIFIED(${timeoutSeconds}초)`;
  return `${name} 실패:\n${(result.stdout || result.stderr || result.error?.message || '상세 출력 없음').trim()}`;
}
