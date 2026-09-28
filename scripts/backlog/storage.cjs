const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const { validateBacklog } = require('./validate.cjs');

class BacklogConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BacklogConflictError';
  }
}

function sha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function parseRaw(raw, filePath) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${filePath}: JSON 파싱 실패: ${error.message}`);
  }
  validateBacklog(data);
  return data;
}

function makeSource(filePath, raw, data) {
  const stat = fs.statSync(filePath);
  return {
    path: path.resolve(filePath),
    schemaVersion: data.$schema_version,
    sha256: sha256(raw),
    bytes: Buffer.byteLength(raw),
    modifiedAt: stat.mtime.toISOString(),
  };
}

function readBacklog(filePath) {
  const resolved = path.resolve(filePath);
  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (error) {
    throw new Error(`${resolved}: 백로그를 읽을 수 없습니다: ${error.message}`);
  }
  const data = parseRaw(raw, resolved);
  return { data, raw, source: makeSource(resolved, raw, data) };
}

function acquireLock(lockPath) {
  try {
    const fd = fs.openSync(lockPath, 'wx');
    fs.writeFileSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
    return fd;
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new BacklogConflictError(`변경 잠금이 이미 존재합니다: ${lockPath}. 다른 CLI 작업이 끝났는지 확인하세요.`);
    }
    throw error;
  }
}

function mutationPaths(filePath, oldHash) {
  const directory = path.dirname(filePath);
  const basename = path.basename(filePath, path.extname(filePath));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = path.join(directory, '.backlog-backups');
  return {
    backupDirectory,
    backupPath: path.join(backupDirectory, `${basename}.${stamp}.${oldHash.slice(0, 12)}.json`),
    lockPath: path.join(directory, `.${path.basename(filePath)}.lock`),
    tempPath: path.join(directory, `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`),
  };
}

function assertReviewUnlocked(filePath) {
  const reviewLockPath = path.join(path.dirname(filePath), '.backlog-review.lock');
  if (!fs.existsSync(reviewLockPath)) return;
  let detail = '';
  try {
    detail = fs.readFileSync(reviewLockPath, 'utf8').trim();
  } catch {
    detail = '잠금 정보를 읽을 수 없습니다.';
  }
  throw new BacklogConflictError(`리뷰 실행 중에는 백로그를 변경할 수 없습니다: ${reviewLockPath}${detail ? ` (${detail})` : ''}`);
}

function mutateBacklog(filePath, expectedHash, change) {
  if (!/^[a-f0-9]{64}$/i.test(expectedHash || '')) {
    throw new Error('--expect-hash에 조회 결과의 64자리 SHA-256 값이 필요합니다.');
  }
  const resolved = path.resolve(filePath);
  assertReviewUnlocked(resolved);
  const initial = readBacklog(resolved);
  const paths = mutationPaths(resolved, initial.source.sha256);
  const lockFd = acquireLock(paths.lockPath);
  let tempFd;
  try {
    const current = readBacklog(resolved);
    if (current.source.sha256 !== expectedHash.toLowerCase()) {
      throw new BacklogConflictError(`해시 충돌: 기대 ${expectedHash}, 현재 ${current.source.sha256}. 다시 조회 후 변경하세요.`);
    }
    const changedData = change(current.data);
    validateBacklog(changedData);
    const serialized = `${JSON.stringify(changedData, null, 2)}\n`;
    parseRaw(serialized, resolved);

    fs.mkdirSync(paths.backupDirectory, { recursive: true });
    fs.copyFileSync(resolved, paths.backupPath, fs.constants.COPYFILE_EXCL);
    tempFd = fs.openSync(paths.tempPath, 'wx');
    fs.writeFileSync(tempFd, serialized, 'utf8');
    fs.fsyncSync(tempFd);
    fs.closeSync(tempFd);
    tempFd = undefined;

    const beforeReplace = readBacklog(resolved);
    if (beforeReplace.source.sha256 !== expectedHash.toLowerCase()) {
      throw new BacklogConflictError(`저장 직전 해시 충돌: 원본이 ${beforeReplace.source.sha256}로 변경되었습니다. 원본은 보존했습니다.`);
    }
    fs.renameSync(paths.tempPath, resolved);
    const saved = readBacklog(resolved);
    return { before: current.source, after: saved.source, backupPath: paths.backupPath, data: saved.data };
  } finally {
    if (tempFd !== undefined) fs.closeSync(tempFd);
    if (fs.existsSync(paths.tempPath)) fs.unlinkSync(paths.tempPath);
    fs.closeSync(lockFd);
    if (fs.existsSync(paths.lockPath)) fs.unlinkSync(paths.lockPath);
  }
}

module.exports = { BacklogConflictError, mutateBacklog, readBacklog, sha256 };
