const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const projectRoot = path.resolve(__dirname, '..');
const claudePath = path.join(projectRoot, 'CLAUDE.md');
const codexPath = path.join(projectRoot, 'AGENTS.md');

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

for (const filePath of [claudePath, codexPath]) {
  if (!fs.existsSync(filePath)) {
    console.error(`AGENT_INSTRUCTIONS_NOT_CONFIGURED: ${path.basename(filePath)}가 없습니다.`);
    process.exit(1);
  }
}

const claudeContent = fs.readFileSync(claudePath);
const codexContent = fs.readFileSync(codexPath);
const claudeHash = sha256(claudeContent);
const codexHash = sha256(codexContent);

if (!claudeContent.equals(codexContent)) {
  console.error('AGENT_INSTRUCTIONS_MISMATCH: CLAUDE.md와 AGENTS.md 내용이 다릅니다.');
  console.error(`- CLAUDE.md: ${claudeHash}`);
  console.error(`- AGENTS.md: ${codexHash}`);
  console.error('수정 방법: 공통 운영 규칙을 두 파일에 동일하게 반영한 뒤 npm run instructions:check를 다시 실행하세요.');
  process.exit(1);
}

console.log(`AGENT_INSTRUCTIONS_OK: CLAUDE.md와 AGENTS.md가 동일합니다 (${claudeHash}).`);
