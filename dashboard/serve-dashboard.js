// backlog-dashboard.html 전용 로컬 정적 서버.
//
// 이 서버는 현재 프로젝트의 backlog.json과 docs/backlog만 읽는다. file://로 열면
// 브라우저가 JSON fetch를 막으므로, 대시보드는 반드시 이 서버로 연다.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 5175;
const PORT_TRY_COUNT = 20;
const IDENTITY_PATH = '/_backlog-dashboard';
const DEFAULT_IDLE_MS = 10 * 60 * 1000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function send(res, status, headers, body, headOnly = false) {
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(headOnly ? undefined : body);
}

function resolveRequestPath(requestUrl) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((requestUrl || '/').split('?')[0]);
  } catch {
    return null;
  }
  if (urlPath === '/') return path.join(ROOT, 'dashboard', 'backlog-dashboard.html');
  if (urlPath === '/backlog.json') return path.join(ROOT, 'backlog.json');
  const docMatch = /^\/docs\/backlog\/([A-Za-z0-9._-]+\.md)$/.exec(urlPath);
  return docMatch ? path.join(ROOT, 'docs', 'backlog', docMatch[1]) : null;
}

function createServer() {
  return http.createServer((req, res) => {
    const headOnly = req.method === 'HEAD';
    if (req.method !== 'GET' && !headOnly) {
      send(res, 405, { 'Content-Type': 'text/plain; charset=utf-8' }, '읽기 전용 서버입니다 (GET만 허용)');
      return;
    }

    const urlPath = (req.url || '/').split('?')[0];
    if (urlPath === IDENTITY_PATH) {
      send(res, 200, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify({ root: ROOT }), headOnly);
      return;
    }

    const full = resolveRequestPath(req.url);
    if (!full) {
      send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '허용되지 않은 읽기 경로입니다.');
      return;
    }

    fs.stat(full, (statErr, stat) => {
      if (statErr || !stat.isFile()) {
        send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8' }, '요청한 파일을 찾을 수 없습니다.');
        return;
      }
      fs.readFile(full, (readErr, data) => {
        if (readErr) {
          send(res, 500, { 'Content-Type': 'text/plain; charset=utf-8' }, String(readErr));
          return;
        }
        const type = TYPES[path.extname(full)] || 'application/octet-stream';
        send(res, 200, { 'Content-Type': type, 'Last-Modified': stat.mtime.toUTCString() }, data, headOnly);
      });
    });
  });
}

function requestIdentity(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: IDENTITY_PATH, timeout: 300 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const identity = JSON.parse(body);
          resolve(res.statusCode === 200 && identity.root === ROOT);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function openBrowser(port) {
  const url = `http://127.0.0.1:${port}/`;
  const child = spawn('cmd.exe', ['/c', 'start', '', url], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return url;
}

function readPositiveInteger(name, fallback, maximum = 65535) {
  if (!process.env[name]) return fallback;
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name}는 1~${maximum} 범위의 정수여야 합니다.`);
  }
  return value;
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
}

async function startDashboard({
  open = true,
  startPort = readPositiveInteger('PORT', DEFAULT_PORT),
  idleMs = readPositiveInteger('DASHBOARD_IDLE_MS', DEFAULT_IDLE_MS, Number.MAX_SAFE_INTEGER),
} = {}) {
  for (let offset = 0; offset < PORT_TRY_COUNT && startPort + offset <= 65535; offset += 1) {
    const port = startPort + offset;
    if (await requestIdentity(port)) {
      const url = open ? openBrowser(port) : `http://127.0.0.1:${port}/`;
      return { reused: true, port, url, server: null };
    }

    const server = createServer();
    try {
      await listen(server, port);
    } catch (error) {
      if (error.code === 'EADDRINUSE') continue;
      throw error;
    }

    let idleTimer;
    const resetIdleTimer = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => server.close(), idleMs);
    };
    server.on('request', resetIdleTimer);
    server.on('close', () => clearTimeout(idleTimer));
    resetIdleTimer();
    const url = open ? openBrowser(port) : `http://127.0.0.1:${port}/`;
    return { reused: false, port, url, server };
  }
  throw new Error(`포트 ${startPort}부터 ${PORT_TRY_COUNT}개를 모두 사용할 수 없습니다.`);
}

if (require.main === module) {
  startDashboard()
    .then(({ reused, url }) => console.log(reused ? `기존 Backlog 대시보드 열기: ${url}` : `Backlog 대시보드: ${url} (10분간 요청이 없으면 종료)`))
    .catch((error) => {
      console.error(`대시보드 서버 시작 실패: ${error.message}`);
      process.exitCode = 2;
    });
}

module.exports = { IDENTITY_PATH, ROOT, createServer, resolveRequestPath, startDashboard };
