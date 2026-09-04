const fs = require('fs');
const http = require('http');
const path = require('path');

const port = Number(process.env.PORT || 3978);
const host = process.env.HOST || '0.0.0.0';
const distDir = path.join(__dirname, 'dist');
const indexFile = path.join(distDir, 'index.html');
// Preserve the existing deployment ports without requiring new environment
// variables: production uses web 3978/API 3988 and local test uses 3979/3989.
const defaultApiPort = port === 3978 ? 3988 : 3989;
const apiProxyTarget = new URL(process.env.API_PROXY_TARGET || `http://127.0.0.1:${defaultApiPort}`);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const stream = fs.createReadStream(filePath);

  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': filePath.includes(`${path.sep}assets${path.sep}`)
      ? 'public, max-age=31536000, immutable'
      : filePath.includes(`${path.sep}models${path.sep}`)
        ? 'public, max-age=86400, stale-while-revalidate=604800'
      : 'no-cache',
  });

  stream.pipe(res);
}

function safeResolve(requestPath) {
  let decodedPath = '/';

  try {
    decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  } catch (_error) {
    return indexFile;
  }

  // The kiosk rotates this virtual directory every day at 06:00. Mapping it
  // to the same physical model files gives the browser a fresh HTTP cache key
  // without duplicating the large face-recognition assets on disk.
  const versionedModel = decodedPath.match(/^\/models\/(?:cache-\d{4}-\d{2}-\d{2}|release-kiosk-v2)\/([^/\\]+)$/);
  if (versionedModel) decodedPath = `/models/${versionedModel[1]}`;

  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(distDir, normalizedPath);

  return filePath.startsWith(distDir) ? filePath : indexFile;
}

function proxyToApi(req, res) {
  // The browser calls this server on the same origin. From here to the API the
  // request is server-to-server, so forwarding the browser Origin would make a
  // local production instance fail the API CORS policy unnecessarily.
  const { origin: _browserOrigin, ...forwardHeaders } = req.headers;
  const proxyRequest = http.request({
    hostname: apiProxyTarget.hostname,
    port: apiProxyTarget.port,
    method: req.method,
    path: req.url,
    headers: {
      ...forwardHeaders,
      host: apiProxyTarget.host,
    },
  }, (proxyResponse) => {
    res.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
    proxyResponse.pipe(res);
  });

  proxyRequest.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ success: false, error: 'API indisponível.' }));
  });

  req.pipe(proxyRequest);
}

const server = http.createServer((req, res) => {
  if (!fs.existsSync(indexFile)) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('frontend/dist not found. Run npm --prefix frontend run build first.');
    return;
  }

  const urlPath = req.url || '/';
  const requestPath = urlPath.split('?')[0];
  if (requestPath === '/api' || requestPath.startsWith('/api/') || requestPath === '/uploads' || requestPath.startsWith('/uploads/')) {
    proxyToApi(req, res);
    return;
  }
  const requestedFile = safeResolve(requestPath === '/' ? '/index.html' : requestPath);

  fs.stat(requestedFile, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(res, requestedFile);
      return;
    }

    // A missing hashed asset is not an SPA route. Returning index.html here
    // makes the browser report a misleading dynamic-import error.
    if (path.extname(requestPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('Asset not found');
      return;
    }

    sendFile(res, indexFile);
  });
});

server.listen(port, host, () => {
  console.log(`N3xTime web ready on http://${host}:${port}`);
});
