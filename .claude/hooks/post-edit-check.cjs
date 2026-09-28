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
    console.error('POST_EDIT_CHECK_UNVERIFIED: hook 입력 JSON을 파싱할 수 없습니다.');
    process.exit(2);
  }

  const projectRoot = path.resolve(input.cwd || process.cwd());
  const filePath = path.resolve(input.tool_input?.file_path || '');
  const relativePath = path.relative(projectRoot, filePath);
  const supportedExtension = /\.(cjs|css|html|js|jsx|mjs|ts|tsx|java|kt)$/.test(filePath);
  const managedRoot = /^(app|src|__tests__|scripts|dashboard|\.claude[\\/]hooks|android[\\/]app[\\/]src)([\\/]|$)/.test(relativePath);
  if (!filePath || relativePath.startsWith('..') || !supportedExtension || !managedRoot || !fs.existsSync(filePath)) {
    process.exit(0);
  }

  const failures = [];
  const lengthResult = spawnSync(process.execPath, ['scripts/check-file-length.cjs', filePath], {
    cwd: projectRoot,
    encoding: 'utf8',
    timeout: 5_000,
    windowsHide: true,
  });
  if (lengthResult.status !== 0 || lengthResult.error) {
    failures.push(lengthResult.error?.code === 'ETIMEDOUT'
      ? '코드 길이 검사 TIMEOUT_UNVERIFIED(5초)'
      : (lengthResult.stderr || lengthResult.error?.message || '코드 길이 검사 실패').trim());
  }

  if (/\.(cjs|js|jsx|mjs|ts|tsx)$/.test(filePath)) {
    const eslintBin = path.join(projectRoot, 'node_modules', 'eslint', 'bin', 'eslint.js');
    if (!fs.existsSync(eslintBin)) {
      failures.push('lint NOT_CONFIGURED: node_modules/eslint/bin/eslint.js가 없습니다. npm install 후 다시 검사하세요.');
    } else {
      const lintResult = spawnSync(process.execPath, [eslintBin, filePath, '--no-cache', '--max-warnings', '0'], {
        cwd: projectRoot,
        encoding: 'utf8',
        timeout: 45_000,
        windowsHide: true,
      });
      if (lintResult.status !== 0 || lintResult.error) {
        failures.push(lintResult.error?.code === 'ETIMEDOUT'
          ? 'lint TIMEOUT_UNVERIFIED(45초)'
          : `lint 실패:\n${(lintResult.stdout || lintResult.stderr || lintResult.error?.message || '상세 출력 없음').trim()}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error(`POST_EDIT_CHECK_FAILED: ${relativePath}\n${failures.join('\n\n')}\n수정 후 파일을 다시 저장하세요.`);
    process.exit(2);
  }
  process.exit(0);
});
