import http from 'node:http';
import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const HOST = '127.0.0.1';
const PORT = parseInt(process.env.TIMER_API_PORT || '4321', 10);
const TMP_DIR = join(process.cwd(), '.tmp');
const REQ_FILE = join(TMP_DIR, 'timer-api-req.json');
const RES_FILE = join(TMP_DIR, 'timer-api-res.json');

let seq = 0;

try { mkdirSync(TMP_DIR, { recursive: true }); } catch {}

function requestApp(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${++seq}`;
    writeFileSync(REQ_FILE, JSON.stringify({ requestId, action, payload }));

    const start = Date.now();
    const poll = setInterval(() => {
      if (existsSync(RES_FILE)) {
        try {
          const res = JSON.parse(readFileSync(RES_FILE, 'utf-8'));
          if (res.requestId === requestId) {
            clearInterval(poll);
            try { unlinkSync(RES_FILE); } catch {}
            if (res.error) return reject(new Error(res.error));
            return resolve(res);
          }
        } catch {}
      }
      if (Date.now() - start > 10000) {
        clearInterval(poll);
        try { unlinkSync(REQ_FILE); } catch {}
        reject(new Error('Request timed out'));
      }
    }, 50);
  });
}

// --- HTTP Server ---
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => body += chunk);
    req.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { resolve({}); }
    });
  });
}

function json(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const path = url.pathname;

    if (req.method === 'GET' && path === '/api/status') {
      return json(res, 200, await requestApp('getStatus'));
    }
    if (req.method === 'POST' && path === '/api/timer/start') {
      await requestApp('start');
      return json(res, 200, { success: true });
    }
    if (req.method === 'POST' && path === '/api/timer/pause') {
      await requestApp('pause');
      return json(res, 200, { success: true });
    }
    if (req.method === 'POST' && path === '/api/timer/reset') {
      await requestApp('reset');
      return json(res, 200, { success: true });
    }
    if (req.method === 'POST' && path === '/api/timer/adjust') {
      const body = await parseBody(req);
      await requestApp('adjust', { delta: body.delta || 0 });
      return json(res, 200, { success: true });
    }
    if (req.method === 'POST' && path === '/api/exec') {
      const body = await parseBody(req);
      if (!body.code) return json(res, 400, { error: 'Missing "code" field' });
      const result = await requestApp('exec', { code: body.code });
      return json(res, 200, result);
    }
    if (req.method === 'POST' && path === '/api/config') {
      const body = await parseBody(req);
      await requestApp('configure', body);
      return json(res, 200, { success: true });
    }

    json(res, 404, { error: 'Not found' });
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, HOST, () => {
  console.error(`[TimerAPI] HTTP server on http://${HOST}:${PORT}`);
});

// Poll for app lifecycle - exit if marker file disappears
setInterval(() => {
  if (!existsSync(join(TMP_DIR, 'timer-api-running'))) {
    process.exit();
  }
}, 2000);
