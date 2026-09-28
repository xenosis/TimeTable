const http = require('http');

const { IDENTITY_PATH, ROOT, startDashboard } = require('../dashboard/serve-dashboard');

function getJson(port, requestPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: requestPath }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    }).on('error', reject);
  });
}

describe('backlog dashboard server', () => {
  let started;

  afterEach(async () => {
    if (!started || !started.server) return;
    await new Promise((resolve) => started.server.close(resolve));
    started = null;
  });

  test('serves this project backlog and identifies itself', async () => {
    started = await startDashboard({ open: false, startPort: 53175, idleMs: 10_000 });
    const identity = await getJson(started.port, IDENTITY_PATH);
    const backlog = await getJson(started.port, '/backlog.json');

    expect(started.reused).toBe(false);
    expect(JSON.parse(identity.body)).toEqual({ root: ROOT });
    expect(backlog.status).toBe(200);
    expect(JSON.parse(backlog.body).tasks).toEqual(expect.any(Array));
  });

  test('reuses an existing server for the same project', async () => {
    started = await startDashboard({ open: false, startPort: 53176, idleMs: 10_000 });
    const reused = await startDashboard({ open: false, startPort: 53176, idleMs: 10_000 });

    expect(reused).toMatchObject({ reused: true, port: started.port, server: null });
  });
});
