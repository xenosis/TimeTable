const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const maxLines = Number.parseInt(process.env.MAX_SOURCE_LINES || '300', 10);
const sourceRoots = ['app', 'src', '__tests__', 'test-utils', 'scripts', 'dashboard', '.claude/hooks', '.codex/hooks', 'android/app/src'];
const normalizedSourceRoots = sourceRoots.map((root) => path.normalize(root));
const sourceExtensions = new Set(['.cjs', '.css', '.html', '.js', '.jsx', '.mjs', '.ts', '.tsx', '.java', '.kt']);
const excludedSegments = new Set(['.expo', '.gradle', '.tmp', 'build', 'coverage', 'dist', 'node_modules']);

function isExcluded(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).some((part) => excludedSegments.has(part));
}

function isManagedSource(filePath) {
  const absolutePath = path.resolve(filePath);
  const relativePath = path.relative(projectRoot, absolutePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || isExcluded(absolutePath)) return false;
  if (!sourceExtensions.has(path.extname(absolutePath))) return false;
  return normalizedSourceRoots.some((root) => relativePath === root || relativePath.startsWith(`${root}${path.sep}`));
}

function collectFiles(targetPath, files) {
  if (!fs.existsSync(targetPath) || isExcluded(targetPath)) return;
  const stat = fs.statSync(targetPath);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(targetPath)) collectFiles(path.join(targetPath, entry), files);
  } else if (isManagedSource(targetPath)) {
    files.add(path.resolve(targetPath));
  }
}

function countLines(content) {
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.length;
}

function lineLimit(filePath) {
  const relativePath = path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
  // 파일 선택만으로 동작하는 휴대형 UI라 markup/style/script를 함께 둔다.
  return relativePath === 'dashboard/backlog-dashboard.html' ? 800 : maxLines;
}

function splitCandidates(filePath) {
  const extension = path.extname(filePath);
  if (extension === '.tsx' || extension === '.jsx') {
    return '화면 렌더링, 상태·이벤트 처리, 스타일/하위 컴포넌트 책임을 기준으로 분리 검토';
  }
  if (extension === '.ts' || extension === '.js' || extension === '.cjs' || extension === '.mjs') {
    return '타입·상수, 순수 도메인 로직, 저장소/API I/O 책임을 기준으로 분리 검토';
  }
  return 'Android 컴포넌트, 서비스/리시버, React Native 브리지 책임을 기준으로 분리 검토';
}

const files = new Set();
const requestedPaths = process.argv.slice(2);
if (requestedPaths.length > 0) {
  requestedPaths.forEach((target) => collectFiles(path.resolve(target), files));
} else {
  sourceRoots.forEach((root) => collectFiles(path.join(projectRoot, root), files));
}

const violations = [...files]
  .map((filePath) => ({
    filePath,
    lines: countLines(fs.readFileSync(filePath, 'utf8')),
    limit: lineLimit(filePath),
  }))
  .filter(({ lines, limit }) => lines > limit)
  .sort((a, b) => b.lines - a.lines);

if (violations.length > 0) {
  console.error(`CODE_LENGTH_FAIL: 소스 파일 ${violations.length}개가 ${maxLines}줄 기준을 초과했습니다.`);
  for (const { filePath, lines, limit } of violations) {
    console.error(`- ${path.relative(projectRoot, filePath)}: ${lines}줄 / 기준 ${limit}줄 (초과 ${lines - limit}줄)`);
    console.error(`  분리 후보: ${splitCandidates(filePath)}`);
  }
  console.error('코드를 압축하거나 의미 없이 쪼개지 말고 책임 경계를 검토하세요. 데이터·생성물·의존성은 검사 대상이 아닙니다.');
  process.exit(1);
}

console.log(`CODE_LENGTH_OK: ${files.size}개 관리 소스 파일 통과 (기본 ${maxLines}줄, 단일 파일 대시보드 HTML 800줄).`);
